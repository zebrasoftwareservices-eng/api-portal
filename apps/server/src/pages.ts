// SPDX-License-Identifier: Apache-2.0
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq, or, type SQL } from 'drizzle-orm';
import { navigationSettings, pages, type Database } from '@portal/db';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { headersFor, requireUser, type Auth } from './auth.js';
import { notFound, Problem } from './problem.js';

const oneLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) => !/[\r\n]/u.test(value) && !value.includes('\u0000'),
      'Must be one line without NUL characters.',
    );
const nullableLine = (max: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => (typeof value === 'string' ? value.trim() || null : null))
    .refine(
      (value) => value === null || value.length <= max,
      `Must be at most ${max} characters.`,
    )
    .refine(
      (value) =>
        value === null || (!/[\r\n]/u.test(value) && !value.includes('\u0000')),
      'Must be one line without NUL characters.',
    );
const slug = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
  .refine((value) => !value.includes('\u0000'));
const httpsUrl = nullableLine(2048).refine((value) => {
  if (value === null) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}, 'Must be an absolute HTTPS URL without credentials.');
const pageWrite = z
  .object({
    title: oneLine(120),
    slug,
    body: z
      .string()
      .max(100_000)
      .refine((value) => !value.includes('\u0000'), 'Must not contain NUL characters.'),
    visibility: z.enum(['public', 'signed-in']),
    status: z.enum(['draft', 'published']),
    description: nullableLine(300),
    seoTitle: nullableLine(120),
    ogImageUrl: httpsUrl,
  })
  .strict();

export function readablePages(viewer: { userId: string | null }): SQL {
  return and(
    eq(pages.status, 'published'),
    or(
      eq(pages.visibility, 'public'),
      viewer.userId ? eq(pages.visibility, 'signed-in') : undefined,
    ),
  )!;
}

const privateNoStore = {
  onRequest: async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'private, no-store');
  },
};

function pgCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if ('code' in error && typeof error.code === 'string') return error.code;
  return 'cause' in error ? pgCode(error.cause) : undefined;
}

function slugTaken(): Problem {
  return new Problem(409, 'page-slug-taken', 'That page URL is already in use.', [
    { pointer: '/slug', message: 'Choose a different slug.' },
  ]);
}

function pageId(request: FastifyRequest) {
  const value = (request.params as { pageId?: unknown }).pageId;
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw notFound();
  return parsed.data;
}

type PageRow = typeof pages.$inferSelect;
type LinkRef = { area: 'header' | 'footer'; label: string };

function storedLinks(value: unknown, page: string, area: 'header' | 'footer'): LinkRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      item &&
      typeof item === 'object' &&
      (item as Record<string, unknown>).kind === 'page' &&
      (item as Record<string, unknown>).pageId === page &&
      typeof (item as Record<string, unknown>).label === 'string'
    )
      return [{ area, label: (item as Record<string, unknown>).label as string }];
    return [];
  });
}

async function navigationFor(db: Database, id: string) {
  const [settings] = await db
    .select({ header: navigationSettings.header, footer: navigationSettings.footer })
    .from(navigationSettings)
    .where(eq(navigationSettings.id, 1));
  return settings
    ? [...storedLinks(settings.header, id, 'header'), ...storedLinks(settings.footer, id, 'footer')]
    : [];
}

function summary(row: PageRow, navigation: LinkRef[]) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    visibility: row.visibility,
    status: row.status,
    navigation,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function detail(db: Database, row: PageRow) {
  return {
    ...summary(row, await navigationFor(db, row.id)),
    body: row.body,
    description: row.description,
    seoTitle: row.seoTitle,
    ogImageUrl: row.ogImageUrl,
  };
}

export async function registerPages(server: FastifyInstance, db: Database, auth: Auth) {
  server.get('/api/v1/pages/:slug', privateNoStore, async (request) => {
    const session = await auth.api.getSession({ headers: headersFor(request) });
    const requested = (request.params as { slug?: unknown }).slug;
    const [row] = await db
      .select()
      .from(pages)
      .where(
        and(
          typeof requested === 'string' ? eq(pages.slug, requested) : undefined,
          readablePages({ userId: session?.user.id ?? null }),
        ),
      );
    if (!row) throw notFound();
    return {
      slug: row.slug,
      title: row.title,
      body: row.body,
      description: row.description,
      seoTitle: row.seoTitle,
      ogImageUrl: row.ogImageUrl,
      visibility: row.visibility,
      updatedAt: row.updatedAt.toISOString(),
    };
  });

  server.get('/api/v1/admin/pages', privateNoStore, async (request) => {
    await requireUser(auth, request, true);
    const rows = await db.select().from(pages).orderBy(desc(pages.updatedAt));
    return {
      items: await Promise.all(
        rows.map(async (row) => summary(row, await navigationFor(db, row.id))),
      ),
    };
  });

  server.post('/api/v1/admin/pages', privateNoStore, async (request, reply) => {
    const admin = await requireUser(auth, request, true);
    const input = pageWrite.parse(request.body);
    try {
      const [row] = await db
        .insert(pages)
        .values({ id: uuidv7(), ...input, createdBy: admin.id, updatedBy: admin.id })
        .returning();
      reply.header('Location', `/api/v1/admin/pages/${row!.id}`);
      return reply.code(201).send(await detail(db, row!));
    } catch (error) {
      if (pgCode(error) === '23505') throw slugTaken();
      throw error;
    }
  });

  server.get('/api/v1/admin/pages/:pageId', privateNoStore, async (request) => {
    await requireUser(auth, request, true);
    const id = pageId(request);
    const [row] = await db.select().from(pages).where(eq(pages.id, id));
    if (!row) throw notFound();
    return detail(db, row);
  });

  server.put('/api/v1/admin/pages/:pageId', privateNoStore, async (request) => {
    const admin = await requireUser(auth, request, true);
    const id = pageId(request);
    const input = pageWrite.parse(request.body);
    try {
      const [row] = await db
        .update(pages)
        .set({ ...input, updatedBy: admin.id, updatedAt: new Date() })
        .where(eq(pages.id, id))
        .returning();
      if (!row) throw notFound();
      return detail(db, row);
    } catch (error) {
      if (pgCode(error) === '23505') throw slugTaken();
      throw error;
    }
  });

  server.delete('/api/v1/admin/pages/:pageId', privateNoStore, async (request, reply) => {
    await requireUser(auth, request, true);
    const [deleted] = await db.delete(pages).where(eq(pages.id, pageId(request))).returning({ id: pages.id });
    if (!deleted) throw notFound();
    return reply.code(204).send();
  });
}
