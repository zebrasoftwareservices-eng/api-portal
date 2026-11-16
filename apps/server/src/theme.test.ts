// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import {
  connect,
  instanceSettings,
  migrate,
  themeAssets,
  themeSettings,
  user,
} from '@portal/db';
import { DEFAULT_THEME } from '@portal/theme';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
let container: StartedPostgreSqlContainer;
let connection: ReturnType<typeof connect>;
let server: Awaited<ReturnType<typeof createApp>>['app'];
let adminCookie = '';
let developerCookie = '';

function b64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('base64');
}

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

function svg(body = '') {
  return b64(
    new TextEncoder().encode(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">${body}</svg>`,
    ),
  );
}

function saveBody(overrides: Record<string, unknown> = {}) {
  return { values: structuredClone(DEFAULT_THEME), ...overrides };
}

async function signUp(email: string) {
  const bootstrapId = uuidv7();
  await connection.db.insert(user).values({
    id: bootstrapId,
    name: 'Bootstrap',
    email: `${bootstrapId}@example.com`,
    role: 'admin',
    emailVerified: true,
  });
  const response = await server.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email, name: 'Person', password: 'password123' },
  });
  await connection.db.delete(user).where(eq(user.id, bootstrapId));
  expect(response.statusCode, response.body).toBe(200);
  return response.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  connection = connect(container.getConnectionUri());
  await migrate(container.getConnectionUri());
  await connection.db.insert(instanceSettings).values({ id: 1, instanceId: uuidv7() });
  ({ app: server } = await createApp({
    db: connection.db,
    config,
    enqueueMail: async () => {},
    logger: false,
  }));
  adminCookie = await signUp('theme-admin@example.com');
  const [admin] = await connection.db
    .select()
    .from(user)
    .where(eq(user.email, 'theme-admin@example.com'));
  await connection.db.update(user).set({ role: 'admin' }).where(eq(user.id, admin!.id));
  developerCookie = await signUp('theme-dev@example.com');
});

afterAll(async () => {
  await server?.close();
  await connection?.client.end();
  await container?.stop();
});

beforeEach(async () => {
  await connection.db.delete(themeAssets);
  await connection.db.delete(themeSettings);
});

async function call(
  method: 'GET' | 'PUT' | 'POST' | 'DELETE',
  url: string,
  options: { cookie?: string; payload?: unknown; headers?: Record<string, string> } = {},
) {
  return server.inject({
    method,
    url,
    payload: options.payload as never,
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...options.headers,
    },
  });
}

it('serves the default theme publicly when nothing is saved', async () => {
  const theme = await call('GET', '/api/v1/theme');
  expect(theme.statusCode).toBe(200);
  expect(theme.headers['cache-control']).toBe('no-store');
  expect(theme.json()).toMatchObject({
    isDefault: true,
    defaultMode: 'system',
    font: 'system',
    customCssUrl: null,
    logoUrl: null,
    faviconUrl: null,
  });
  expect(theme.json().stylesheetUrl).toBe(`/api/v1/theme.css?v=${theme.json().etag}`);
  expect(JSON.stringify(theme.json())).not.toContain('#1d4ed8');
  const css = await call('GET', `/api/v1/theme.css?v=${theme.json().etag}`);
  expect(css.headers['content-type']).toContain('text/css');
  expect(css.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  expect(css.headers.etag).toBe(`"${theme.json().etag}"`);
  expect(css.body).toContain('--primary: #1d4ed8;');
  expect(css.body).toContain('@media (prefers-color-scheme: dark)');
  const stale = await call('GET', '/api/v1/theme.css?v=not-the-etag');
  expect(stale.headers['cache-control']).toBe('no-cache');
  expect(stale.body).toBe(css.body);
  const cached = await call('GET', '/api/v1/theme.css', {
    headers: { 'if-none-match': css.headers.etag as string },
  });
  expect(cached.statusCode).toBe(304);
  expect(cached.body).toBe('');
  const custom = await call('GET', '/api/v1/theme/custom.css');
  expect(custom.statusCode).toBe(200);
  expect(custom.body).toBe('');
  const missing = await call('GET', '/api/v1/theme/assets/logo');
  expect(missing.statusCode).toBe(404);
  expect(missing.headers['content-type']).toContain('application/problem+json');
});

it('refuses admin routes to visitors and developers', async () => {
  for (const [method, url, payload] of [
    ['GET', '/api/v1/admin/theme', undefined],
    ['PUT', '/api/v1/admin/theme', saveBody()],
    ['DELETE', '/api/v1/admin/theme', undefined],
    ['GET', '/api/v1/admin/theme/export', undefined],
    ['POST', '/api/v1/admin/theme/import', saveBody()],
  ] as const) {
    const anonymous = await call(method, url, { payload });
    expect(anonymous.statusCode, `${method} ${url}`).toBe(401);
    expect(anonymous.json().type).toBe('/problems/unauthenticated');
    const developer = await call(method, url, { cookie: developerCookie, payload });
    expect(developer.statusCode, `${method} ${url}`).toBe(403);
    expect(developer.json().type).toBe('/problems/forbidden');
  }
});

it('saves a theme, changes the public etag, and resets', async () => {
  const before = (await call('GET', '/api/v1/theme')).json().etag as string;
  const values = structuredClone(DEFAULT_THEME);
  values.colors.light.primary = '#112233';
  values.customCss = '/* @import "hidden.css"; */\n.portal-marker{color:red}';
  const saved = await call('PUT', '/api/v1/admin/theme', {
    cookie: adminCookie,
    payload: {
      values,
      logo: { contentType: 'image/png', data: b64(PNG) },
    },
  });
  expect(saved.statusCode, saved.body).toBe(200);
  expect(saved.json().isDefault).toBe(false);
  expect(saved.json().etag).not.toBe(before);
  expect(saved.json().logo).toMatchObject({ contentType: 'image/png', byteSize: PNG.length });
  expect(saved.json().favicon).toBeNull();
  expect(saved.json().updatedAt).toEqual(expect.any(String));
  const live = await call('GET', '/api/v1/theme');
  expect(live.json().etag).toBe(saved.json().etag);
  expect(live.json().logoUrl).toContain('/api/v1/theme/assets/logo?v=');
  expect(live.json().customCssUrl).toContain('/api/v1/theme/custom.css?v=');
  const css = await call('GET', live.json().stylesheetUrl);
  expect(css.body).toContain('--primary: #112233;');
  expect(css.body).not.toContain('portal-marker');
  const custom = await call('GET', live.json().customCssUrl);
  expect(custom.body).toBe(values.customCss);
  const logo = await call('GET', live.json().logoUrl);
  expect(logo.statusCode).toBe(200);
  expect(logo.headers['content-type']).toContain('image/png');
  expect(logo.headers['x-content-type-options']).toBe('nosniff');
  expect(logo.headers['content-security-policy']).toBe(
    "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  );
  expect(Buffer.from(logo.rawPayload).equals(Buffer.from(PNG))).toBe(true);
  const reset = await call('DELETE', '/api/v1/admin/theme', { cookie: adminCookie });
  expect(reset.statusCode).toBe(200);
  expect(reset.json().isDefault).toBe(true);
  expect(reset.json().etag).toBe(before);
  const again = await call('DELETE', '/api/v1/admin/theme', { cookie: adminCookie });
  expect(again.json()).toMatchObject({ isDefault: true, etag: before, logo: null, favicon: null });
  expect((await call('GET', '/api/v1/theme/assets/logo')).statusCode).toBe(404);
});

it('round-trips export and import without changing the etag', async () => {
  const values = structuredClone(DEFAULT_THEME);
  values.colors.dark.accent = '#123456';
  values.font = 'inter';
  values.radius = 4;
  values.defaultMode = 'dark';
  const favicon = Uint8Array.from([0x00, 0x00, 0x01, 0x00, 0x01]);
  const saved = await call('PUT', '/api/v1/admin/theme', {
    cookie: adminCookie,
    payload: {
      values,
      favicon: { contentType: 'image/x-icon', data: b64(favicon) },
    },
  });
  expect(saved.statusCode, saved.body).toBe(200);
  const exported = await call('GET', '/api/v1/admin/theme/export', { cookie: adminCookie });
  expect(exported.statusCode).toBe(200);
  expect(exported.headers['content-disposition']).toBe('attachment; filename="portal-theme.json"');
  const file = exported.json();
  expect(file).toMatchObject({
    format: 'portal-theme',
    version: 1,
    values,
    logo: null,
    favicon: { contentType: 'image/x-icon', data: b64(favicon) },
  });
  await call('DELETE', '/api/v1/admin/theme', { cookie: adminCookie });
  const imported = await call('POST', '/api/v1/admin/theme/import', {
    cookie: adminCookie,
    payload: file,
  });
  expect(imported.statusCode, imported.body).toBe(200);
  expect(imported.json().etag).toBe(saved.json().etag);
  expect(imported.json().values).toEqual(values);
  expect(imported.json().favicon.byteSize).toBe(favicon.length);
});

it('rejects a bad colour, @import, a mismatched asset and an oversized logo without saving', async () => {
  const initial = (await call('GET', '/api/v1/admin/theme', { cookie: adminCookie })).json();
  const badColor = structuredClone(DEFAULT_THEME);
  badColor.colors.dark.primary = 'red';
  const color = await call('PUT', '/api/v1/admin/theme', {
    cookie: adminCookie,
    payload: { values: badColor },
  });
  expect(color.statusCode).toBe(400);
  expect(color.json().type).toBe('/problems/validation');
  expect(color.json().errors).toContainEqual(
    expect.objectContaining({ pointer: '/values/colors/dark/primary' }),
  );
  const imported = structuredClone(DEFAULT_THEME);
  imported.customCss = '@import url("https://evil.example/x.css");';
  const css = await call('POST', '/api/v1/admin/theme/import', {
    cookie: adminCookie,
    payload: { format: 'portal-theme', version: 1, values: imported, logo: null, favicon: null },
  });
  expect(css.statusCode).toBe(400);
  expect(css.json().detail).toBe("Custom CSS can't use @import");
  expect(css.json().errors).toContainEqual(
    expect.objectContaining({ pointer: '/values/customCss' }),
  );
  const mismatch = await call('PUT', '/api/v1/admin/theme', {
    cookie: adminCookie,
    payload: {
      values: DEFAULT_THEME,
      logo: { contentType: 'image/webp', data: b64(PNG) },
    },
  });
  expect(mismatch.statusCode).toBe(400);
  expect(mismatch.json().errors[0].pointer).toBe('/logo/data');
  const huge = new Uint8Array(600 * 1024);
  huge.set(PNG.subarray(0, 8), 0);
  const oversized = await call('PUT', '/api/v1/admin/theme', {
    cookie: adminCookie,
    payload: {
      values: DEFAULT_THEME,
      logo: { contentType: 'image/png', data: b64(huge) },
    },
  });
  expect(oversized.statusCode).toBe(400);
  expect(oversized.json().errors).toContainEqual(
    expect.objectContaining({
      pointer: '/logo/data',
      message: 'Logo is 600 KB; the limit is 512 KB',
    }),
  );
  const after = await call('GET', '/api/v1/admin/theme', { cookie: adminCookie });
  expect(after.json().etag).toBe(initial.etag);
  expect(after.json().isDefault).toBe(true);
});

it('rejects an import that is not JSON and leaves a saved theme in place', async () => {
  const values = structuredClone(DEFAULT_THEME);
  values.colors.light.border = '#abcdef';
  const saved = await call('PUT', '/api/v1/admin/theme', {
    cookie: adminCookie,
    payload: { values },
  });
  expect(saved.statusCode, saved.body).toBe(200);
  const invalid = await server.inject({
    method: 'POST',
    url: '/api/v1/admin/theme/import',
    headers: { cookie: adminCookie, 'content-type': 'application/json' },
    payload: '{',
  });
  expect(invalid.statusCode).toBe(400);
  expect(invalid.headers['content-type']).toContain('application/problem+json');
  expect(invalid.json().detail).toBe('The file is not valid JSON');
  const badFile = structuredClone(DEFAULT_THEME);
  badFile.colors.light.primary = '#gggggg';
  const rejected = await call('POST', '/api/v1/admin/theme/import', {
    cookie: adminCookie,
    payload: { format: 'portal-theme', version: 1, values: badFile, logo: null, favicon: null },
  });
  expect(rejected.statusCode).toBe(400);
  expect(rejected.json().errors).toContainEqual(
    expect.objectContaining({ pointer: '/values/colors/light/primary' }),
  );
  const still = await call('GET', '/api/v1/admin/theme', { cookie: adminCookie });
  expect(still.json().etag).toBe(saved.json().etag);
  expect(still.json().values.colors.light.border).toBe('#abcdef');
});

it('answers 413 when the body is over 2 MB and still accepts a body over the global 1 MB limit', async () => {
  const medium = structuredClone(DEFAULT_THEME);
  medium.customCss = 'a'.repeat(1_200_000);
  const withinRoute = await call('PUT', '/api/v1/admin/theme', {
    cookie: adminCookie,
    payload: { values: medium },
  });
  expect(withinRoute.statusCode, withinRoute.body).toBe(400);
  expect(withinRoute.json().type).toBe('/problems/validation');
  const payload = `{"values":${JSON.stringify('x'.repeat(2 * 1024 * 1024))}}`;
  const tooBig = await server.inject({
    method: 'PUT',
    url: '/api/v1/admin/theme',
    headers: { cookie: adminCookie, 'content-type': 'application/json' },
    payload,
  });
  expect(tooBig.statusCode).toBe(413);
  expect(tooBig.json().type).toBe('/problems/payload-too-large');
  expect((await call('GET', '/api/v1/theme')).json().isDefault).toBe(true);
});

it('serves an uploaded SVG with the sandbox policy and falls back when the stored row is invalid', async () => {
  const saved = await call('PUT', '/api/v1/admin/theme', {
    cookie: adminCookie,
    payload: {
      values: DEFAULT_THEME,
      logo: { contentType: 'image/svg+xml', data: svg('<rect width="1" height="1"/>') },
    },
  });
  expect(saved.statusCode, saved.body).toBe(200);
  const logo = await call('GET', saved.json().logo.url);
  expect(logo.headers['content-type']).toContain('image/svg+xml');
  expect(logo.headers['x-content-type-options']).toBe('nosniff');
  expect(logo.headers['content-security-policy']).toContain('sandbox');
  const script = await call('PUT', '/api/v1/admin/theme', {
    cookie: adminCookie,
    payload: {
      values: DEFAULT_THEME,
      logo: { contentType: 'image/svg+xml', data: svg('<script>alert(1)</script>') },
    },
  });
  expect(script.statusCode).toBe(400);
  expect(script.json().errors[0].message).toContain('<script');
  expect((await call('GET', '/api/v1/admin/theme', { cookie: adminCookie })).json().etag).toBe(
    saved.json().etag,
  );
  await connection.db.update(themeSettings).set({ values: { font: 'nope' } });
  const fallback = await call('GET', '/api/v1/theme');
  expect(fallback.json().isDefault).toBe(true);
  expect(fallback.json().font).toBe('system');
  expect(fallback.json().logoUrl).toBeNull();
  expect((await call('GET', '/api/v1/theme/assets/logo')).statusCode).toBe(404);
});

it('saves a low-contrast palette', async () => {
  const values = structuredClone(DEFAULT_THEME);
  values.colors.light.foreground = '#eeeeee';
  values.colors.light.background = '#ffffff';
  const saved = await call('PUT', '/api/v1/admin/theme', {
    cookie: adminCookie,
    payload: { values },
  });
  expect(saved.statusCode, saved.body).toBe(200);
  expect(saved.json().values.colors.light.foreground).toBe('#eeeeee');
});
