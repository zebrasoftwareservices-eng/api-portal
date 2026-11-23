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
  navigationSettings,
  pages,
  user,
} from '@portal/db';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import type { Auth } from './auth.js';

const ids = { admin: uuidv7(), developer: uuidv7() };
let sessions = 0;
const events: string[] = [];
const auth = {
  api: {
    getSession: async ({ headers }: { headers: Headers }) => {
      sessions += 1;
      const name = headers.get('x-viewer');
      if (name !== 'admin' && name !== 'developer') return null;
      return {
        user: {
          id: ids[name],
          role: name === 'admin' ? 'admin' : 'developer',
          emailVerified: false,
          email: `${name}@example.com`,
          name,
        },
      };
    },
  },
} as unknown as Auth;

let container: StartedPostgreSqlContainer;
let connection: ReturnType<typeof connect>;
let server: Awaited<ReturnType<typeof createApp>>['app'];

const apis = { kind: 'builtin' as const, key: 'apis' as const, hidden: false };
const myApps = { kind: 'builtin' as const, key: 'my-apps' as const, hidden: false };

function write(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Getting started',
    slug: 'getting-started',
    body: '# Hello',
    visibility: 'public',
    status: 'draft',
    ...overrides,
  };
}

async function call(
  method: 'GET' | 'PUT' | 'POST' | 'DELETE',
  url: string,
  options: { viewer?: 'admin' | 'developer'; payload?: unknown } = {},
) {
  return server.inject({
    method,
    url,
    payload: options.payload as never,
    headers: options.viewer ? { 'x-viewer': options.viewer } : {},
  });
}

function pointers(body: { errors?: { pointer?: string }[] }) {
  return (body.errors ?? []).map((error) => error.pointer);
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const url = container.getConnectionUri();
  await migrate(url);
  connection = connect(url);
  await connection.db.insert(instanceSettings).values({ id: 1, instanceId: uuidv7() });
  await connection.db.insert(user).values([
    { id: ids.admin, name: 'Admin', email: 'pages-admin@example.com', role: 'admin', emailVerified: true },
    {
      id: ids.developer,
      name: 'Developer',
      email: 'pages-dev@example.com',
      role: 'developer',
      emailVerified: false,
    },
  ]);
  ({ app: server } = await createApp({
    db: connection.db,
    auth,
    config: loadConfig({ DATABASE_URL: url }),
    logger: {
      level: 'info',
      formatters: {
        log(object: Record<string, unknown>) {
          if (typeof object.event === 'string') events.push(object.event);
          return object;
        },
      },
    },
  }));
});

afterAll(async () => {
  await server?.close();
  await connection?.client.end();
  await container?.stop();
});

beforeEach(async () => {
  await connection.db.delete(pages);
  await connection.db.delete(navigationSettings);
  events.length = 0;
});

it('serves the default navigation without a session lookup', async () => {
  const before = sessions;
  const response = await call('GET', '/api/v1/navigation');
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(response.json()).toEqual({
    isDefault: true,
    header: [
      { kind: 'builtin', key: 'apis' },
      { kind: 'builtin', key: 'my-apps' },
    ],
    footer: [],
  });
  expect(sessions).toBe(before);
  const admin = await call('GET', '/api/v1/admin/navigation', { viewer: 'admin' });
  expect(admin.json()).toMatchObject({
    isDefault: true,
    header: [apis, myApps],
    footer: [],
    updatedAt: null,
  });
  expect(admin.headers['cache-control']).toBe('private, no-store');
});

it('refuses every admin route to visitors and developers and changes nothing', async () => {
  const created = await call('POST', '/api/v1/admin/pages', {
    viewer: 'admin',
    payload: write(),
  });
  const id = created.json().id as string;
  const before = await connection.db.select().from(pages);
  const routes: ['GET' | 'POST' | 'PUT' | 'DELETE', string, unknown?][] = [
    ['GET', '/api/v1/admin/pages'],
    ['POST', '/api/v1/admin/pages', write({ slug: 'another-page', title: 'Another' })],
    ['GET', `/api/v1/admin/pages/${id}`],
    ['PUT', `/api/v1/admin/pages/${id}`, write({ title: 'Changed', status: 'published' })],
    ['DELETE', `/api/v1/admin/pages/${id}`],
    ['GET', '/api/v1/admin/navigation'],
    ['PUT', '/api/v1/admin/navigation', { header: [apis, myApps], footer: [] }],
    ['DELETE', '/api/v1/admin/navigation'],
  ];
  for (const [method, url, payload] of routes) {
    const signedOut = await call(method, url, { payload });
    expect(signedOut.statusCode, `${method} ${url}`).toBe(401);
    expect(signedOut.headers['content-type']).toContain('application/problem+json');
    expect(signedOut.headers['cache-control']).toBe('private, no-store');
    expect(signedOut.json().type).toBe('/problems/unauthenticated');
    const developer = await call(method, url, { viewer: 'developer', payload });
    expect(developer.statusCode, `${method} ${url}`).toBe(403);
    expect(developer.json().type).toBe('/problems/forbidden');
    expect(developer.headers['cache-control']).toBe('private, no-store');
  }
  const badId = await call('GET', '/api/v1/admin/pages/not-a-uuid');
  expect(badId.statusCode).toBe(401);
  const developerBadId = await call('PUT', '/api/v1/admin/pages/not-a-uuid', {
    viewer: 'developer',
    payload: write(),
  });
  expect(developerBadId.statusCode).toBe(403);
  expect(await connection.db.select().from(pages)).toEqual(before);
  expect(await connection.db.select().from(navigationSettings)).toEqual([]);
});

it('creates a draft, keeps it off the public URL, and publishes the next save', async () => {
  const created = await call('POST', '/api/v1/admin/pages', {
    viewer: 'admin',
    payload: write({ body: 'Body marker alpha' }),
  });
  expect(created.statusCode).toBe(201);
  expect(created.headers.location).toBe(`/api/v1/admin/pages/${created.json().id}`);
  expect(created.headers['cache-control']).toBe('private, no-store');
  expect(created.json()).toMatchObject({
    title: 'Getting started',
    slug: 'getting-started',
    body: 'Body marker alpha',
    description: null,
    seoTitle: null,
    ogImageUrl: null,
    visibility: 'public',
    status: 'draft',
    navigation: [],
  });
  const hidden = await call('GET', '/api/v1/pages/getting-started');
  expect(hidden.statusCode).toBe(404);
  expect(JSON.stringify(hidden.json())).not.toContain('Body marker alpha');
  const preview = await call('GET', `/api/v1/admin/pages/${created.json().id}`, {
    viewer: 'admin',
  });
  expect(preview.statusCode).toBe(200);
  expect(preview.json().body).toBe('Body marker alpha');

  const published = await call('PUT', `/api/v1/admin/pages/${created.json().id}`, {
    viewer: 'admin',
    payload: write({
      status: 'published',
      body: '## Updated\n\n- one',
      description: '  Search me  ',
    }),
  });
  expect(published.statusCode).toBe(200);
  expect(published.json()).toMatchObject({
    status: 'published',
    body: '## Updated\n\n- one',
    description: 'Search me',
  });
  const page = await call('GET', '/api/v1/pages/getting-started');
  expect(page.statusCode).toBe(200);
  expect(page.headers['cache-control']).toBe('private, no-store');
  expect(page.json()).toMatchObject({
    slug: 'getting-started',
    title: 'Getting started',
    body: '## Updated\n\n- one',
    description: 'Search me',
    visibility: 'public',
  });

  const renamed = await call('PUT', `/api/v1/admin/pages/${created.json().id}`, {
    viewer: 'admin',
    payload: write({ slug: 'start-here', status: 'published', body: 'Renamed body' }),
  });
  expect(renamed.statusCode).toBe(200);
  expect((await call('GET', '/api/v1/pages/getting-started')).statusCode).toBe(404);
  expect((await call('GET', '/api/v1/pages/start-here')).json().body).toBe('Renamed body');
});

it('returns the same 404 for a missing slug, a bad slug, a draft and a signed-in-only page', async () => {
  const marker = 'signed-in-marker-9f3a';
  const created = await call('POST', '/api/v1/admin/pages', {
    viewer: 'admin',
    payload: write({
      slug: 'members-only',
      title: marker,
      description: `${marker}-description`,
      body: `${marker}-body`,
      visibility: 'signed-in',
      status: 'published',
    }),
  });
  expect(created.statusCode).toBe(201);
  await call('POST', '/api/v1/admin/pages', {
    viewer: 'admin',
    payload: write({ slug: 'still-a-draft', title: 'Draft title', status: 'draft' }),
  });
  const missing = await call('GET', '/api/v1/pages/no-such-page');
  const malformed = await call('GET', '/api/v1/pages/NOT-A-SLUG');
  const hidden = await call('GET', '/api/v1/pages/members-only');
  const draft = await call('GET', '/api/v1/pages/still-a-draft');
  const adminDraft = await call('GET', '/api/v1/pages/still-a-draft', { viewer: 'admin' });
  for (const response of [missing, malformed, hidden, draft, adminDraft]) {
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.headers['cache-control']).toBe('private, no-store');
    const body = response.json();
    expect(body).toMatchObject({
      type: '/problems/not-found',
      title: 'not found',
      status: 404,
      detail: 'The requested resource was not found.',
    });
    expect(JSON.stringify(body)).not.toContain(marker);
    expect(JSON.stringify(body)).not.toContain('Draft title');
  }
  const withoutInstance = (response: Awaited<ReturnType<typeof call>>) => {
    const body = response.json();
    delete body.instance;
    return body;
  };
  expect(withoutInstance(hidden)).toEqual(withoutInstance(missing));
  expect(hidden.json().instance).toBe('/api/v1/pages/members-only');
  expect(missing.json().instance).toBe('/api/v1/pages/no-such-page');

  for (const viewer of ['developer', 'admin'] as const) {
    const allowed = await call('GET', '/api/v1/pages/members-only', { viewer });
    expect(allowed.statusCode, viewer).toBe(200);
    expect(allowed.json()).toMatchObject({ title: marker, body: `${marker}-body` });
  }
});

it('refuses an invalid page and leaves the stored row unchanged', async () => {
  const created = await call('POST', '/api/v1/admin/pages', {
    viewer: 'admin',
    payload: write({ description: 'Kept' }),
  });
  const id = created.json().id as string;
  const cases: Record<string, unknown>[] = [
    write({ title: '   ' }),
    write({ title: 'Line\nbreak' }),
    write({ title: 'Nul\u0000' }),
    write({ slug: 'Bad Slug' }),
    write({ slug: 'a' }),
    write({ body: 'nul\u0000' }),
    write({ body: 'x'.repeat(100_001) }),
    write({ description: 'has\nnewline' }),
    write({ ogImageUrl: 'http://example.com/og.png' }),
    write({ ogImageUrl: 'https://user:pass@example.com/og.png' }),
    { ...write(), extra: true },
  ];
  for (const payload of cases) {
    const refused = await call('PUT', `/api/v1/admin/pages/${id}`, { viewer: 'admin', payload });
    expect(refused.statusCode, JSON.stringify(payload).slice(0, 80)).toBe(400);
    expect(refused.json().type).toBe('/problems/validation');
    expect(pointers(refused.json()).length).toBeGreaterThan(0);
  }
  expect(pointers((await call('PUT', `/api/v1/admin/pages/${id}`, {
    viewer: 'admin',
    payload: write({ title: '   ' }),
  })).json())).toContain('/title');
  expect(pointers((await call('PUT', `/api/v1/admin/pages/${id}`, {
    viewer: 'admin',
    payload: write({ slug: 'Bad Slug' }),
  })).json())).toContain('/slug');
  expect(pointers((await call('PUT', `/api/v1/admin/pages/${id}`, {
    viewer: 'admin',
    payload: write({ ogImageUrl: 'javascript:alert(1)' }),
  })).json())).toContain('/ogImageUrl');
  const emptyOptional = await call('POST', '/api/v1/admin/pages', {
    viewer: 'admin',
    payload: write({ slug: 'optional-empty', description: '   ', seoTitle: '', ogImageUrl: null }),
  });
  expect(emptyOptional.json()).toMatchObject({
    description: null,
    seoTitle: null,
    ogImageUrl: null,
  });
  const taken = await call('POST', '/api/v1/admin/pages', {
    viewer: 'admin',
    payload: write({ title: 'Other' }),
  });
  expect(taken.statusCode).toBe(409);
  expect(taken.json()).toMatchObject({
    type: '/problems/page-slug-taken',
    title: 'Page URL already in use',
    status: 409,
  });
  expect(taken.json().errors).toEqual([
    { pointer: '/slug', message: 'Choose a different slug.' },
  ]);
  const clash = await call('PUT', `/api/v1/admin/pages/${emptyOptional.json().id}`, {
    viewer: 'admin',
    payload: write({ slug: 'getting-started', title: 'Stolen' }),
  });
  expect(clash.statusCode).toBe(409);
  expect((await call('GET', `/api/v1/admin/pages/${id}`, { viewer: 'admin' })).json()).toMatchObject({
    title: 'Getting started',
    slug: 'getting-started',
    description: 'Kept',
  });
  const missing = await call('GET', `/api/v1/admin/pages/${uuidv7()}`, { viewer: 'admin' });
  expect(missing.statusCode).toBe(404);
  expect((await call('PUT', '/api/v1/admin/pages/not-a-uuid', { viewer: 'admin', payload: write() })).statusCode).toBe(404);
  expect((await call('DELETE', '/api/v1/admin/pages/not-a-uuid', { viewer: 'admin' })).statusCode).toBe(404);

  const tooBig = await call('POST', '/api/v1/admin/pages', {
    viewer: 'admin',
    payload: write({ slug: 'too-big', body: 'x'.repeat(1024 * 1024) }),
  });
  expect(tooBig.statusCode).toBe(413);
  expect(tooBig.json().type).toBe('/problems/payload-too-large');
  expect(tooBig.headers['cache-control']).toBe('private, no-store');
});

it('lists pages newest first without their bodies', async () => {
  const first = await call('POST', '/api/v1/admin/pages', {
    viewer: 'admin',
    payload: write({ slug: 'older-page', title: 'Older' }),
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  await call('POST', '/api/v1/admin/pages', {
    viewer: 'admin',
    payload: write({ slug: 'newer-page', title: 'Newer' }),
  });
  await call('PUT', `/api/v1/admin/pages/${first.json().id}`, {
    viewer: 'admin',
    payload: write({ slug: 'older-page', title: 'Older touched', body: 'secret body' }),
  });
  const list = await call('GET', '/api/v1/admin/pages', { viewer: 'admin' });
  expect(list.json().items.map((item: { title: string }) => item.title)).toEqual([
    'Older touched',
    'Newer',
  ]);
  expect(JSON.stringify(list.json())).not.toContain('secret body');
  expect(list.json().items[0]).not.toHaveProperty('body');
});

it('resolves navigation per caller, resets, and keeps one of two concurrent saves', async () => {
  const draft = await call('POST', '/api/v1/admin/pages', {
    viewer: 'admin',
    payload: write({ slug: 'draft-page', title: 'Draft page', status: 'draft' }),
  });
  const signedIn = await call('POST', '/api/v1/admin/pages', {
    viewer: 'admin',
    payload: write({
      slug: 'members-page',
      title: 'Members page',
      visibility: 'signed-in',
      status: 'published',
    }),
  });
  const visible = await call('POST', '/api/v1/admin/pages', {
    viewer: 'admin',
    payload: write({ slug: 'public-page', title: 'Public page', status: 'published' }),
  });
  const saved = await call('PUT', '/api/v1/admin/navigation', {
    viewer: 'admin',
    payload: {
      header: [
        { ...apis, hidden: true },
        { kind: 'page', label: 'Public', pageId: visible.json().id },
        { kind: 'link', label: 'Docs', url: 'https://example.com/docs' },
        { kind: 'page', label: 'Members', pageId: signedIn.json().id },
        { kind: 'page', label: 'Draft', pageId: draft.json().id },
        myApps,
      ],
      footer: [{ kind: 'page', label: 'Public footer', pageId: visible.json().id }],
    },
  });
  expect(saved.statusCode).toBe(200);
  expect(saved.json().isDefault).toBe(false);
  expect(saved.json().header.map((item: { label?: string; key?: string }) => item.label ?? item.key)).toEqual([
    'apis',
    'Public',
    'Docs',
    'Members',
    'Draft',
    'my-apps',
  ]);
  expect(saved.json().header[1].page).toMatchObject({ slug: 'public-page', status: 'published' });
  const detail = await call('GET', `/api/v1/admin/pages/${visible.json().id}`, { viewer: 'admin' });
  expect(detail.json().navigation).toEqual([
    { area: 'header', label: 'Public' },
    { area: 'footer', label: 'Public footer' },
  ]);
  const visitor = await call('GET', '/api/v1/navigation');
  expect(visitor.json()).toEqual({
    isDefault: false,
    header: [
      { kind: 'page', label: 'Public', href: '/pages/public-page' },
      { kind: 'link', label: 'Docs', href: 'https://example.com/docs' },
      { kind: 'builtin', key: 'my-apps' },
    ],
    footer: [{ kind: 'page', label: 'Public footer', href: '/pages/public-page' }],
  });
  const developer = await call('GET', '/api/v1/navigation', { viewer: 'developer' });
  expect(developer.json().header.map((item: { label?: string; key?: string }) => item.label ?? item.key)).toEqual([
    'Public',
    'Docs',
    'Members',
    'my-apps',
  ]);

  await call('PUT', `/api/v1/admin/pages/${visible.json().id}`, {
    viewer: 'admin',
    payload: write({ slug: 'moved-page', title: 'Public page', status: 'published' }),
  });
  expect((await call('GET', '/api/v1/pages/public-page')).statusCode).toBe(404);
  expect((await call('GET', '/api/v1/navigation')).json().header[0].href).toBe('/pages/moved-page');

  await call('PUT', `/api/v1/admin/pages/${signedIn.json().id}`, {
    viewer: 'admin',
    payload: write({
      slug: 'members-page',
      title: 'Members page',
      visibility: 'signed-in',
      status: 'draft',
    }),
  });
  expect((await call('GET', '/api/v1/pages/members-page', { viewer: 'developer' })).statusCode).toBe(404);
  expect(JSON.stringify((await call('GET', '/api/v1/navigation', { viewer: 'developer' })).json())).not.toContain(
    'Members',
  );

  const removed = await call('DELETE', `/api/v1/admin/pages/${draft.json().id}`, { viewer: 'admin' });
  expect(removed.statusCode).toBe(204);
  const [stored] = await connection.db.select().from(navigationSettings);
  expect(JSON.stringify(stored!.header)).toContain(draft.json().id);
  const adminNav = await call('GET', '/api/v1/admin/navigation', { viewer: 'admin' });
  expect(JSON.stringify(adminNav.json())).not.toContain(draft.json().id);
  expect((await call('GET', '/api/v1/pages/draft-page')).statusCode).toBe(404);

  const reset = await call('DELETE', '/api/v1/admin/navigation', { viewer: 'admin' });
  expect(reset.statusCode).toBe(200);
  expect(reset.json()).toMatchObject({ isDefault: true, header: [apis, myApps], footer: [], updatedAt: null });
  expect(await connection.db.select().from(navigationSettings)).toEqual([]);
  const again = await call('DELETE', '/api/v1/admin/navigation', { viewer: 'admin' });
  expect(again.json().isDefault).toBe(true);

  const first = {
    header: [apis, myApps, { kind: 'link', label: 'One', url: 'https://example.com/one' }],
    footer: [{ kind: 'link', label: 'Foot', url: 'https://example.com/foot' }],
  };
  const second = {
    header: [myApps, apis],
    footer: [] as unknown[],
  };
  const [left, right] = await Promise.all([
    call('PUT', '/api/v1/admin/navigation', { viewer: 'admin', payload: first }),
    call('PUT', '/api/v1/admin/navigation', { viewer: 'admin', payload: second }),
  ]);
  expect([left.statusCode, right.statusCode]).toEqual([200, 200]);
  const current = await call('GET', '/api/v1/admin/navigation', { viewer: 'admin' });
  const shape = {
    header: current.json().header,
    footer: current.json().footer,
  };
  expect([first, second]).toContainEqual(shape);
});

it('names the navigation field and does not save an invalid document', async () => {
  const page = await call('POST', '/api/v1/admin/pages', {
    viewer: 'admin',
    payload: write({ status: 'published' }),
  });
  const base = { header: [apis, myApps], footer: [] as unknown[] };
  const refused: [Record<string, unknown>, string][] = [
    [{ header: [{ ...apis, hidden: false }], footer: [] }, '/header'],
    [{ header: [apis, apis, myApps], footer: [] }, '/header'],
    [
      {
        header: [apis, myApps, { kind: 'link', label: '   ', url: 'https://example.com' }],
        footer: [],
      },
      '/header/2/label',
    ],
    [
      {
        header: [apis, myApps, { kind: 'link', label: 'Docs', url: 'javascript:alert(1)' }],
        footer: [],
      },
      '/header/2/url',
    ],
    [
      {
        header: [apis, myApps, { kind: 'page', label: 'Gone', pageId: uuidv7() }],
        footer: [],
      },
      '/header/2/pageId',
    ],
    [
      {
        header: [apis, myApps],
        footer: [{ kind: 'page', label: 'Gone', pageId: uuidv7() }],
      },
      '/footer/0/pageId',
    ],
  ];
  for (const [payload, pointer] of refused) {
    const response = await call('PUT', '/api/v1/admin/navigation', { viewer: 'admin', payload });
    expect(response.statusCode, pointer).toBe(400);
    expect(response.json().type).toBe('/problems/validation');
    expect(pointers(response.json()), pointer).toContain(pointer);
  }
  expect(await connection.db.select().from(navigationSettings)).toEqual([]);
  await call('PUT', '/api/v1/admin/navigation', { viewer: 'admin', payload: base });
  const unchanged = await connection.db.select().from(navigationSettings);
  const bad = await call('PUT', '/api/v1/admin/navigation', {
    viewer: 'admin',
    payload: {
      header: [apis, myApps, { kind: 'link', label: 'Docs', url: 'javascript:alert(1)' }],
      footer: [],
    },
  });
  expect(bad.statusCode).toBe(400);
  expect(await connection.db.select().from(navigationSettings)).toEqual(unchanged);
  expect(page.statusCode).toBe(201);
});

it('drops unknown built-ins, appends missing ones, and replaces invalid JSON with the default', async () => {
  const before = sessions;
  await connection.db.insert(navigationSettings).values({
    id: 1,
    header: [
      apis,
      { kind: 'builtin', key: 'future-docs', hidden: true },
      { kind: 'link', label: 'Docs', url: 'https://example.com/docs' },
    ],
    footer: [],
    updatedBy: ids.admin,
  });
  const admin = await call('GET', '/api/v1/admin/navigation', { viewer: 'admin' });
  expect(admin.json().isDefault).toBe(false);
  expect(admin.json().header).toEqual([
    apis,
    { kind: 'link', label: 'Docs', url: 'https://example.com/docs' },
    myApps,
  ]);
  const visitor = await call('GET', '/api/v1/navigation');
  expect(sessions).toBeGreaterThan(before);
  expect(visitor.json().header).toEqual([
    { kind: 'builtin', key: 'apis' },
    { kind: 'link', label: 'Docs', href: 'https://example.com/docs' },
    { kind: 'builtin', key: 'my-apps' },
  ]);

  await connection.db
    .update(navigationSettings)
    .set({ header: { bad: true } as never })
    .where(eq(navigationSettings.id, 1));
  const fallbackSessions = sessions;
  const fallback = await call('GET', '/api/v1/navigation');
  expect(fallback.json()).toMatchObject({ isDefault: true, header: [
    { kind: 'builtin', key: 'apis' },
    { kind: 'builtin', key: 'my-apps' },
  ], footer: [] });
  expect(sessions).toBe(fallbackSessions);
  expect(events).toContain('navigation-invalid');
  const adminFallback = await call('GET', '/api/v1/admin/navigation', { viewer: 'admin' });
  expect(adminFallback.json().isDefault).toBe(true);
  expect(events.filter((event) => event === 'navigation-invalid').length).toBeGreaterThanOrEqual(2);
});

it('searches titles and descriptions the caller may read and skips bodies and drafts', async () => {
  await call('POST', '/api/v1/admin/pages', {
    viewer: 'admin',
    payload: write({
      slug: 'public-guide',
      title: 'Public lighthouse guide',
      description: 'sharedbeacon visible',
      body: 'bodyonlytoken',
      status: 'published',
    }),
  });
  await call('POST', '/api/v1/admin/pages', {
    viewer: 'admin',
    payload: write({
      slug: 'private-guide',
      title: 'Private harbor notes',
      description: 'sharedbeacon member',
      body: 'bodyonlytoken',
      visibility: 'signed-in',
      status: 'published',
    }),
  });
  await call('POST', '/api/v1/admin/pages', {
    viewer: 'admin',
    payload: write({
      slug: 'draft-guide',
      title: 'Draft warehouse',
      description: 'sharedbeacon draftword',
      body: 'bodyonlytoken',
      status: 'draft',
    }),
  });
  const items = async (q: string, viewer?: 'admin' | 'developer') =>
    (await call('GET', `/api/v1/search?q=${encodeURIComponent(q)}`, { viewer })).json().items;
  expect(await items('lighthouse')).toEqual([
    {
      kind: 'page',
      page: {
        slug: 'public-guide',
        title: 'Public lighthouse guide',
        description: 'sharedbeacon visible',
      },
    },
  ]);
  expect(await items('harbor')).toEqual([]);
  expect(await items('draftword')).toEqual([]);
  expect(await items('bodyonlytoken', 'admin')).toEqual([]);
  for (const viewer of ['developer', 'admin'] as const) {
    expect((await items('sharedbeacon', viewer)).map((item: { page: { slug: string } }) => item.page.slug).sort()).toEqual([
      'private-guide',
      'public-guide',
    ]);
    expect(await items('draftword', viewer)).toEqual([]);
    expect(await items('harbor', viewer)).toEqual([
      {
        kind: 'page',
        page: {
          slug: 'private-guide',
          title: 'Private harbor notes',
          description: 'sharedbeacon member',
        },
      },
    ]);
  }
  expect((await items('sharedbeacon')).map((item: { page: { slug: string } }) => item.page.slug)).toEqual([
    'public-guide',
  ]);
});
