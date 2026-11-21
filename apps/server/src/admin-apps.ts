// SPDX-License-Identifier: Apache-2.0
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { desc, eq, sql, type SQL } from 'drizzle-orm';
import {
  apps,
  credentials,
  plans,
  products,
  teams,
  user as users,
  type Database,
} from '@portal/db';
import { requireUser, type Auth } from './auth.js';
import { appApis } from './app-plans.js';
import { credentialView } from './apps.js';
import { notFound, Problem } from './problem.js';

const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(200).optional(),
});
const cursorShape = z.object({
  createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
  id: z.uuid(),
});
const createdAtMs = sql<Date>`date_trunc('milliseconds', ${apps.createdAt})`;
const activeKeyHints = sql<string[]>`coalesce(array_agg(${credentials.keyHint} order by ${credentials.createdAt} desc) filter (where ${credentials.status} = 'active'), cast('{}' as text[]))`;

function invalidCursor() {
  return new Problem(400, 'validation', 'Request validation failed.', [
    { pointer: '/cursor', message: 'Invalid cursor.' },
  ]);
}
function parseCursor(cursor: string) {
  const text = Buffer.from(cursor, 'base64url').toString('utf8');
  const splitAt = text.lastIndexOf('|');
  const parsed = cursorShape.safeParse({
    createdAt: splitAt >= 0 ? text.slice(0, splitAt) : '',
    id: splitAt >= 0 ? text.slice(splitAt + 1) : '',
  });
  if (!parsed.success) throw invalidCursor();
  return { createdAt: new Date(parsed.data.createdAt), id: parsed.data.id };
}
function encodeCursor(createdAt: Date, id: string) {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}
function asDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid app timestamp');
  return date;
}
function hintsOf(value: unknown) {
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === 'string');
  if (value === '{}' || value == null) return [];
  if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
    const inner = value.slice(1, -1);
    return inner.length === 0 ? [] : inner.split(',');
  }
  return [];
}
function isPersonal(value: unknown) {
  return value === true || value === 't';
}

type AdminAppRow = {
  id: string;
  name: string;
  status: 'active' | 'revoke-pending' | 'revoked';
  origin: 'self' | 'request' | 'admin';
  keyIssued: boolean;
  revokedAt: Date | null;
  description: string | null;
  planId: string;
  createdAt: Date | string;
  teamId: string;
  teamName: string;
  personal: boolean | string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerRole: string | null;
  planName: string;
  builtin: boolean;
  rateLimit: number | null;
  rateLimitUnit: 'second' | 'minute' | null;
  monthlyQuota: number | null;
  productId: string | null;
  productSlug: string | null;
  productName: string | null;
  activeKeyHints: unknown;
};

function adminApp(row: AdminAppRow) {
  const createdAt = asDate(row.createdAt);
  return {
    createdAt,
    body: {
      id: row.id,
      name: row.name,
      status: row.status,
      team: {
        id: row.teamId,
        name: row.teamName,
        personal: isPersonal(row.personal),
      },
      owner: row.ownerId
        ? {
            id: row.ownerId,
            name: row.ownerName ?? '',
            email: row.ownerEmail ?? '',
            role: row.ownerRole === 'admin' ? 'admin' : 'developer',
          }
        : null,
      plan: {
        id: row.planId,
        name: row.planName,
        builtin: row.builtin,
        product: row.productId
          ? {
              id: row.productId,
              slug: row.productSlug ?? '',
              name: row.productName ?? '',
            }
          : null,
        rateLimit: row.rateLimit,
        rateLimitUnit: row.rateLimitUnit,
        monthlyQuota: row.monthlyQuota,
      },
      activeKeyHints: hintsOf(row.activeKeyHints),
      createdAt: createdAt.toISOString(),
    },
  };
}

function adminAppsQuery(db: Database, where?: SQL) {
  const joined = db
    .select({
      id: apps.id,
      name: apps.name,
      status: apps.status,
      origin: apps.origin,
      keyIssued: apps.keyIssued,
      revokedAt: apps.revokedAt,
      description: apps.description,
      planId: apps.planId,
      createdAt: createdAtMs,
      teamId: teams.id,
      teamName: teams.name,
      personal: sql<boolean>`${teams.personalOwnerId} is not null`,
      ownerId: users.id,
      ownerName: users.name,
      ownerEmail: users.email,
      ownerRole: users.role,
      planName: plans.name,
      builtin: plans.builtin,
      rateLimit: plans.rateLimit,
      rateLimitUnit: plans.rateLimitUnit,
      monthlyQuota: plans.monthlyQuota,
      productId: products.id,
      productSlug: products.slug,
      productName: products.name,
      activeKeyHints,
    })
    .from(apps)
    .innerJoin(teams, eq(teams.id, apps.teamId))
    .leftJoin(users, eq(users.id, apps.createdBy))
    .innerJoin(plans, eq(plans.id, apps.planId))
    .leftJoin(products, eq(products.id, plans.productId))
    .leftJoin(credentials, eq(credentials.appId, apps.id))
    .where(where ?? sql`true`)
    .groupBy(apps.id, teams.id, users.id, plans.id, products.id, createdAtMs)
    .orderBy(desc(createdAtMs), desc(apps.id));
  return joined;
}

export function registerAdminApps(
  server: FastifyInstance,
  db: Database,
  auth: Auth,
) {
  server.get('/api/v1/admin/apps', async (request) => {
    await requireUser(auth, request, true);
    const query = pageQuery.parse(request.query);
    const cursor = query.cursor ? parseCursor(query.cursor) : null;
    const rows = await adminAppsQuery(
      db,
      cursor
        ? sql`(${createdAtMs}, ${apps.id}) < (cast(${cursor.createdAt.toISOString()} as timestamptz), cast(${cursor.id} as uuid))`
        : undefined,
    ).limit(query.limit + 1);
    const page = rows.slice(0, query.limit).map((row) => adminApp(row));
    const last = page.at(-1);
    return {
      items: page.map((row) => row.body),
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor(last.createdAt, last.body.id)
          : null,
    };
  });
  server.get('/api/v1/admin/apps/:appId', async (request) => {
    await requireUser(auth, request, true);
    const { appId } = z.object({ appId: z.uuid() }).parse(request.params);
    const [row] = await adminAppsQuery(db, eq(apps.id, appId)).limit(1);
    if (!row) throw notFound();
    const app = adminApp(row).body;
    const [subscriptions, keys] = await Promise.all([
      appApis(db, { id: appId, planId: row.planId } as typeof apps.$inferSelect),
      db
        .select({
          id: credentials.id,
          kind: credentials.kind,
          keyHint: credentials.keyHint,
          status: credentials.status,
          createdAt: credentials.createdAt,
          revokedAt: credentials.revokedAt,
        })
        .from(credentials)
        .where(eq(credentials.appId, appId))
        .orderBy(desc(credentials.createdAt)),
    ]);
    return {
      ...app,
      origin: row.origin,
      keyIssued: row.keyIssued,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      description: row.description,
      subscriptions: subscriptions.map(({ apiId, slug, title }) => ({
        apiId,
        slug,
        title,
      })),
      credentials: keys.map(credentialView),
    };
  });
}
