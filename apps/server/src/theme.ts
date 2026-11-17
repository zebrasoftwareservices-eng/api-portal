// SPDX-License-Identifier: Apache-2.0
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { themeAssets, themeSettings, type Database } from '@portal/db';
import {
  DEFAULT_THEME,
  parseThemeWrite,
  renderThemeCss,
  themeEtag,
  validateTheme,
  type AssetContentType,
  type AssetKind,
  type AssetUpdate,
  type FieldError,
  type ParsedAsset,
  type StoredThemeValues,
  type ThemeValues,
} from '@portal/theme';
import { requireUser, type Auth } from './auth.js';
import { notFound, Problem } from './problem.js';

const BODY_LIMIT = 2 * 1024 * 1024;
const ASSET_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

interface AssetMeta {
  contentType: AssetContentType;
  byteSize: number;
  sha256: string;
}

interface LiveTheme {
  isDefault: boolean;
  etag: string;
  values: ThemeValues;
  logo: AssetMeta | null;
  favicon: AssetMeta | null;
  updatedAt: string | null;
}

function validation(errors: FieldError[]): never {
  throw new Problem(
    400,
    'validation',
    errors[0]?.message ?? 'Request validation failed.',
    errors.map((error) => ({ message: error.message, pointer: error.pointer })),
  );
}

function defaultTheme(etag: string): LiveTheme {
  return {
    isDefault: true,
    etag,
    values: DEFAULT_THEME,
    logo: null,
    favicon: null,
    updatedAt: null,
  };
}

function isAssetType(value: string): value is AssetContentType {
  return (
    value === 'image/png' ||
    value === 'image/svg+xml' ||
    value === 'image/webp' ||
    value === 'image/x-icon'
  );
}

async function loadTheme(
  db: Database,
  log: { warn: (obj: object, message: string) => void },
): Promise<LiveTheme> {
  const fallbackEtag = await themeEtag(DEFAULT_THEME, []);
  const [settings] = await db.select().from(themeSettings).where(eq(themeSettings.id, 1));
  if (!settings) return defaultTheme(fallbackEtag);
  const candidate = {
    ...(settings.values && typeof settings.values === 'object' ? settings.values : {}),
    customCss: settings.customCss,
  };
  if (validateTheme(candidate).length) {
    log.warn(
      { event: 'theme-invalid' },
      'Stored theme failed validation; serving the default',
    );
    return defaultTheme(fallbackEtag);
  }
  const values = candidate as ThemeValues;
  const rows = await db
    .select({
      kind: themeAssets.kind,
      contentType: themeAssets.contentType,
      byteSize: themeAssets.byteSize,
      sha256: themeAssets.sha256,
    })
    .from(themeAssets);
  const assets: Partial<Record<AssetKind, AssetMeta>> = {};
  for (const row of rows) {
    if ((row.kind !== 'logo' && row.kind !== 'favicon') || !isAssetType(row.contentType))
      continue;
    assets[row.kind] = {
      contentType: row.contentType,
      byteSize: row.byteSize,
      sha256: row.sha256,
    };
  }
  const listed = (['logo', 'favicon'] as const)
    .filter((kind) => assets[kind])
    .map((kind) => ({ kind, sha256: assets[kind]!.sha256 }));
  return {
    isDefault: false,
    etag: await themeEtag(values, listed),
    values,
    logo: assets.logo ?? null,
    favicon: assets.favicon ?? null,
    updatedAt: settings.updatedAt.toISOString(),
  };
}

function assetInfo(kind: AssetKind, asset: AssetMeta | null, etag: string) {
  if (!asset) return null;
  return {
    contentType: asset.contentType,
    byteSize: asset.byteSize,
    url: `/api/v1/theme/assets/${kind}?v=${etag}`,
  };
}

function adminView(theme: LiveTheme) {
  return {
    isDefault: theme.isDefault,
    etag: theme.etag,
    values: theme.values,
    defaults: DEFAULT_THEME,
    logo: assetInfo('logo', theme.logo, theme.etag),
    favicon: assetInfo('favicon', theme.favicon, theme.etag),
    updatedAt: theme.updatedAt,
  };
}

function publicView(theme: LiveTheme) {
  return {
    isDefault: theme.isDefault,
    etag: theme.etag,
    defaultMode: theme.values.defaultMode,
    font: theme.values.font,
    stylesheetUrl: `/api/v1/theme.css?v=${theme.etag}`,
    customCssUrl: theme.values.customCss
      ? `/api/v1/theme/custom.css?v=${theme.etag}`
      : null,
    logoUrl: theme.logo ? `/api/v1/theme/assets/logo?v=${theme.etag}` : null,
    faviconUrl: theme.favicon ? `/api/v1/theme/assets/favicon?v=${theme.etag}` : null,
  };
}

function queryValue(request: FastifyRequest, name: string) {
  const query = request.query;
  if (!query || typeof query !== 'object') return undefined;
  const value = (query as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}

function etagMatches(header: string | string[] | undefined, etag: string) {
  if (header === undefined) return false;
  const value = Array.isArray(header) ? header.join(',') : header;
  return value.split(',').some((part) => {
    const token = part.trim();
    if (token === '*') return true;
    return token.replace(/^W\//i, '').replace(/^"(.*)"$/, '$1') === etag;
  });
}

function sendCached(
  request: FastifyRequest,
  reply: FastifyReply,
  etag: string,
  body: string | Buffer,
  contentType: string,
) {
  const version = queryValue(request, 'v');
  reply.header('ETag', `"${etag}"`);
  reply.header(
    'Cache-Control',
    version === etag ? 'public, max-age=31536000, immutable' : 'no-cache',
  );
  if (etagMatches(request.headers['if-none-match'], etag)) return reply.code(304).send();
  return reply.type(contentType).send(body);
}

async function writeTheme(
  db: Database,
  userId: string,
  values: ThemeValues,
  logo: AssetUpdate,
  favicon: AssetUpdate,
) {
  const stored: StoredThemeValues = {
    colors: values.colors,
    font: values.font,
    radius: values.radius,
    defaultMode: values.defaultMode,
  };
  await db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .insert(themeSettings)
      .values({
        id: 1,
        values: stored,
        customCss: values.customCss,
        updatedBy: userId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: themeSettings.id,
        set: {
          values: stored,
          customCss: values.customCss,
          updatedBy: userId,
          updatedAt: now,
        },
      });
    await applyAsset(tx, 'logo', logo, now);
    await applyAsset(tx, 'favicon', favicon, now);
  });
}

async function applyAsset(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  kind: AssetKind,
  change: AssetUpdate,
  now: Date,
) {
  if (change === undefined) return;
  if (change === null) {
    await tx.delete(themeAssets).where(eq(themeAssets.kind, kind));
    return;
  }
  const row = {
    kind,
    contentType: change.contentType,
    data: Buffer.from(change.data),
    byteSize: change.byteSize,
    sha256: change.sha256,
    updatedAt: now,
  };
  await tx.insert(themeAssets).values(row).onConflictDoUpdate({
    target: themeAssets.kind,
    set: {
      contentType: row.contentType,
      data: row.data,
      byteSize: row.byteSize,
      sha256: row.sha256,
      updatedAt: now,
    },
  });
}

async function assetBytes(db: Database, kind: AssetKind): Promise<ParsedAsset | null> {
  const [row] = await db.select().from(themeAssets).where(eq(themeAssets.kind, kind));
  if (!row || !isAssetType(row.contentType)) return null;
  const data = row.data instanceof Uint8Array ? row.data : Buffer.from(row.data);
  return {
    contentType: row.contentType,
    data,
    byteSize: row.byteSize,
    sha256: row.sha256,
  };
}

function kindParam(request: FastifyRequest): AssetKind | null {
  const kind = (request.params as { kind?: unknown }).kind;
  return kind === 'logo' || kind === 'favicon' ? kind : null;
}

export async function registerTheme(server: FastifyInstance, db: Database, auth: Auth) {
  server.get('/api/v1/theme', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return publicView(await loadTheme(db, request.log));
  });

  server.get('/api/v1/theme.css', async (request, reply) => {
    const theme = await loadTheme(db, request.log);
    return sendCached(
      request,
      reply,
      theme.etag,
      renderThemeCss(theme.values),
      'text/css; charset=utf-8',
    );
  });

  server.get('/api/v1/theme/custom.css', async (request, reply) => {
    const theme = await loadTheme(db, request.log);
    return sendCached(
      request,
      reply,
      theme.etag,
      theme.values.customCss,
      'text/css; charset=utf-8',
    );
  });

  server.get('/api/v1/theme/assets/:kind', async (request, reply) => {
    const kind = kindParam(request);
    if (!kind) throw notFound();
    const theme = await loadTheme(db, request.log);
    const meta = theme[kind];
    if (theme.isDefault || !meta) throw notFound();
    const asset = await assetBytes(db, kind);
    if (!asset) throw notFound();
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Content-Security-Policy', ASSET_CSP);
    return sendCached(request, reply, theme.etag, Buffer.from(asset.data), asset.contentType);
  });

  server.get('/api/v1/admin/theme', async (request) => {
    await requireUser(auth, request, true);
    return adminView(await loadTheme(db, request.log));
  });

  server.put('/api/v1/admin/theme', { bodyLimit: BODY_LIMIT }, async (request) => {
    const admin = await requireUser(auth, request, true);
    const parsed = await parseThemeWrite(request.body, 'save');
    if (parsed.errors.length || !parsed.theme) validation(parsed.errors);
    await writeTheme(
      db,
      admin.id,
      parsed.theme.values,
      parsed.theme.logo,
      parsed.theme.favicon,
    );
    return adminView(await loadTheme(db, request.log));
  });

  server.delete('/api/v1/admin/theme', async (request) => {
    await requireUser(auth, request, true);
    await db.transaction(async (tx) => {
      await tx.delete(themeAssets);
      await tx.delete(themeSettings);
    });
    return adminView(await loadTheme(db, request.log));
  });

  server.get('/api/v1/admin/theme/export', async (request, reply) => {
    await requireUser(auth, request, true);
    const theme = await loadTheme(db, request.log);
    const logo = theme.logo ? await assetBytes(db, 'logo') : null;
    const favicon = theme.favicon ? await assetBytes(db, 'favicon') : null;
    reply.header('Content-Disposition', 'attachment; filename="portal-theme.json"');
    return {
      format: 'portal-theme' as const,
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      values: theme.values,
      logo: logo ? { contentType: logo.contentType, data: Buffer.from(logo.data).toString('base64') } : null,
      favicon: favicon
        ? { contentType: favicon.contentType, data: Buffer.from(favicon.data).toString('base64') }
        : null,
    };
  });

  await server.register(async (importer) => {
    importer.removeContentTypeParser('application/json');
    importer.addContentTypeParser(
      'application/json',
      { parseAs: 'string', bodyLimit: BODY_LIMIT },
      (_request, body, done) => {
        done(null, typeof body === 'string' ? body : String(body));
      },
    );
    importer.post(
      '/api/v1/admin/theme/import',
      { bodyLimit: BODY_LIMIT },
      async (request) => {
        const admin = await requireUser(auth, request, true);
        if (typeof request.body !== 'string')
          throw new Problem(400, 'validation', 'The file is not valid JSON');
        let document: unknown;
        try {
          document = JSON.parse(request.body);
        } catch {
          throw new Problem(400, 'validation', 'The file is not valid JSON');
        }
        const parsed = await parseThemeWrite(document, 'import');
        if (parsed.errors.length || !parsed.theme) validation(parsed.errors);
        await writeTheme(
          db,
          admin.id,
          parsed.theme.values,
          parsed.theme.logo,
          parsed.theme.favicon,
        );
        return adminView(await loadTheme(db, request.log));
      },
    );
  });
}
