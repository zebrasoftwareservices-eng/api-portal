// SPDX-License-Identifier: Apache-2.0
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import { navigationSettings, pages, type Database } from '@portal/db';
import { DEFAULT_NAVIGATION } from '@portal/sdk';
import { z } from 'zod';
import { headersFor, requireUser, type Auth } from './auth.js';
import { readablePages } from './pages.js';
import { Problem } from './problem.js';

const keys = ['apis', 'my-apps'] as const;
const label = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .refine(
    (value) => !/[\r\n]/u.test(value) && !value.includes('\u0000'),
    'Must be one line without NUL characters.',
  );
const pageLink = z.object({ kind: z.literal('page'), label, pageId: z.string().uuid() }).strict();
const externalLink = z
  .object({
    kind: z.literal('link'),
    label,
    url: z
      .string()
      .trim()
      .min(1)
      .max(2048)
      .refine((value) => {
        if (/[\r\n]/u.test(value) || value.includes('\u0000')) return false;
        try {
          const url = new URL(value);
          return url.protocol === 'https:' && !url.username && !url.password;
        } catch {
          return false;
        }
      }, 'Must be an absolute HTTPS URL without credentials.'),
  })
  .strict();
const builtin = z
  .object({ kind: z.literal('builtin'), key: z.enum(keys), hidden: z.boolean() })
  .strict();
const headerItem = z.discriminatedUnion('kind', [builtin, pageLink, externalLink]);
const footerItem = z.discriminatedUnion('kind', [pageLink, externalLink]);
const saveNavigation = z
  .object({
    header: z.array(headerItem).max(12),
    footer: z.array(footerItem).max(20),
  })
  .strict();

type Saved = z.infer<typeof saveNavigation>;
type SavedItem = Saved['header'][number] | Saved['footer'][number];
type PageRow = typeof pages.$inferSelect;

const privateNoStore = {
  onRequest: async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'private, no-store');
  },
};

function defaultSaved(): Saved {
  return {
    header: DEFAULT_NAVIGATION.header.map((item) => ({ ...item })),
    footer: [],
  };
}

function normalizeStored(header: unknown, footer: unknown): Saved | null {
  const filteredHeader = Array.isArray(header)
    ? header.filter(
        (item) =>
          !item ||
          typeof item !== 'object' ||
          (item as Record<string, unknown>).kind !== 'builtin' ||
          keys.includes((item as Record<string, unknown>).key as (typeof keys)[number]),
      )
    : header;
  const parsed = saveNavigation.safeParse({ header: filteredHeader, footer });
  if (!parsed.success) return null;
  const present = new Set(
    parsed.data.header.flatMap((item) => (item.kind === 'builtin' ? [item.key] : [])),
  );
  for (const key of keys)
    if (!present.has(key)) parsed.data.header.push({ kind: 'builtin', key, hidden: false });
  return parsed.data;
}

function pageIds(saved: Saved) {
  return [
    ...new Set(
      [...saved.header, ...saved.footer].flatMap((item) =>
        item.kind === 'page' ? [item.pageId] : [],
      ),
    ),
  ];
}

async function loadRow(
  db: Database,
  log: { warn: (object: object, message: string) => void },
) {
  const [row] = await db.select().from(navigationSettings).where(eq(navigationSettings.id, 1));
  if (!row) return { saved: defaultSaved(), isDefault: true, updatedAt: null };
  const saved = normalizeStored(row.header, row.footer);
  if (!saved) {
    log.warn(
      { event: 'navigation-invalid' },
      'Stored navigation failed validation; serving the default',
    );
    return { saved: defaultSaved(), isDefault: true, updatedAt: null };
  }
  return { saved, isDefault: false, updatedAt: row.updatedAt.toISOString() };
}

async function linkedPages(
  db: Database,
  saved: Saved,
  viewer?: { userId: string | null },
) {
  const ids = pageIds(saved);
  if (!ids.length) return new Map<string, PageRow>();
  const rows = await db
    .select()
    .from(pages)
    .where(and(inArray(pages.id, ids), viewer ? readablePages(viewer) : undefined));
  return new Map(rows.map((row) => [row.id, row]));
}

function adminItem(item: SavedItem, found: Map<string, PageRow>) {
  if (item.kind !== 'page') return item;
  const page = found.get(item.pageId);
  if (!page) return null;
  return {
    ...item,
    page: {
      slug: page.slug,
      title: page.title,
      visibility: page.visibility,
      status: page.status,
    },
  };
}

async function adminView(
  db: Database,
  log: { warn: (object: object, message: string) => void },
) {
  const loaded = await loadRow(db, log);
  const found = await linkedPages(db, loaded.saved);
  return {
    isDefault: loaded.isDefault,
    header: loaded.saved.header
      .map((item) => adminItem(item, found))
      .filter((item) => item !== null),
    footer: loaded.saved.footer
      .map((item) => adminItem(item, found))
      .filter((item) => item !== null),
    updatedAt: loaded.updatedAt,
  };
}

function publicItem(item: SavedItem, found: Map<string, PageRow>) {
  if (item.kind === 'builtin') return item.hidden ? null : { kind: 'builtin' as const, key: item.key };
  if (item.kind === 'link') return { kind: 'link' as const, label: item.label, href: item.url };
  const page = found.get(item.pageId);
  return page
    ? { kind: 'page' as const, label: item.label, href: `/pages/${page.slug}` }
    : null;
}

async function publicView(db: Database, auth: Auth, request: FastifyRequest) {
  const loaded = await loadRow(db, request.log);
  // Nothing saved (and invalid JSON, which we replace with the default) has no page
  // links, so the caller is irrelevant and we do not look up a session.
  const found = loaded.isDefault
    ? new Map<string, PageRow>()
    : await linkedPages(db, loaded.saved, {
        userId:
          (await auth.api.getSession({ headers: headersFor(request) }))?.user.id ??
          null,
      });
  return {
    isDefault: loaded.isDefault,
    header: loaded.saved.header
      .map((item) => publicItem(item, found))
      .filter((item) => item !== null),
    footer: loaded.saved.footer
      .map((item) => publicItem(item, found))
      .filter((item) => item !== null),
  };
}

function validateBuiltins(saved: Saved) {
  const actual = saved.header.flatMap((item) => (item.kind === 'builtin' ? [item.key] : []));
  if (keys.some((key) => actual.filter((candidate) => candidate === key).length !== 1))
    throw new Problem(400, 'validation', 'Every built-in navigation item is required once.', [
      { pointer: '/header', message: 'Include every built-in exactly once.' },
    ]);
}

async function validatePageLinks(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  saved: Saved,
) {
  const ids = pageIds(saved);
  if (!ids.length) return;
  const rows = await tx.select({ id: pages.id }).from(pages).where(inArray(pages.id, ids));
  const found = new Set(rows.map((row) => row.id));
  const errors: { pointer: string; message: string }[] = [];
  for (const area of ['header', 'footer'] as const)
    saved[area].forEach((item, index) => {
      if (item.kind === 'page' && !found.has(item.pageId))
        errors.push({ pointer: `/${area}/${index}/pageId`, message: 'The page does not exist.' });
    });
  if (errors.length) throw new Problem(400, 'validation', 'A linked page does not exist.', errors);
}

export async function registerNavigation(server: FastifyInstance, db: Database, auth: Auth) {
  server.get('/api/v1/navigation', privateNoStore, async (request) => {
    return publicView(db, auth, request);
  });

  server.get('/api/v1/admin/navigation', privateNoStore, async (request) => {
    await requireUser(auth, request, true);
    return adminView(db, request.log);
  });

  server.put('/api/v1/admin/navigation', privateNoStore, async (request) => {
    const admin = await requireUser(auth, request, true);
    const saved = saveNavigation.parse(request.body);
    validateBuiltins(saved);
    await db.transaction(async (tx) => {
      await validatePageLinks(tx, saved);
      await tx
        .insert(navigationSettings)
        .values({ id: 1, ...saved, updatedBy: admin.id, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: navigationSettings.id,
          set: { ...saved, updatedBy: admin.id, updatedAt: new Date() },
        });
    });
    return adminView(db, request.log);
  });

  server.delete('/api/v1/admin/navigation', privateNoStore, async (request) => {
    await requireUser(auth, request, true);
    await db.delete(navigationSettings).where(eq(navigationSettings.id, 1));
    return adminView(db, request.log);
  });
}
