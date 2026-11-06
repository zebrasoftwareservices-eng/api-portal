// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import './reference-snippets.test';

test('developer signs up, copies a one-time key, calls Kong and revokes it', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const email = `qa-${crypto.randomUUID()}@example.com`;
  await page.goto('/sign-up');
  await page.getByLabel('Name', { exact: true }).fill('QA Developer');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('QA-password-123');
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect((await context.request.get('/api/v1/me')).status()).toBe(200);
  expect(
    (await context.request.get('/api/v1/admin/gateway/services')).status(),
  ).toBe(403);
  await page.goto('/admin/apis');
  await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible();
  await page.goto('/dashboard/apps/new?api=sample');
  await page.getByLabel('App name').fill(`QA ${crypto.randomUUID()}`);
  await expect(page.locator('input[type="checkbox"]:checked')).toHaveCount(1);
  await expect(
    page.locator('label').filter({ has: page.locator('input:checked') }),
  ).toContainText('Sample HTTP API');
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/apps') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Create app and get key' }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const { app, credential } = await response.json();
  const consumer = await (
    await context.request.get(
      `http://localhost:8001/consumers/portal-app-${app.id}`,
    )
  ).json();
  expect(consumer.tags).toContain(`portal-app-${app.id}`);
  expect(consumer.tags).toEqual(
    expect.arrayContaining([
      'portal',
      expect.stringMatching(/^portal-instance-/),
    ]),
  );
  const keys = await (
    await context.request.get(
      `http://localhost:8001/consumers/portal-app-${app.id}/key-auth`,
    )
  ).json();
  expect(keys.data).toHaveLength(1);
  expect(keys.data[0].tags).toEqual(
    expect.arrayContaining([
      `portal-app-${app.id}`,
      `portal-cred-${credential.id}`,
      expect.stringMatching(/^portal-instance-/),
    ]),
  );
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByLabel('API key', { exact: true })).toHaveValue(
    credential.key,
  );
  await dialog.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: '✓ Copied', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    credential.key,
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: "I've saved it" }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: app.name, exact: true }),
  ).toBeVisible();
  expect(await page.content()).not.toContain(credential.key);
  const target =
    '/api/v1/try-it?scalar_url=' +
    encodeURIComponent('http://localhost:8000/sample/get');
  expect((await context.request.get(target)).status()).toBe(401);
  expect(
    (
      await context.request.get(target, { headers: { apikey: credential.key } })
    ).status(),
  ).toBe(200);
  await page.goto('/apis/sample');
  await page
    .getByRole('button', { name: /Test Request/ })
    .first()
    .click();
  const send = page.getByRole('button', {
    name: 'Send get request to http://localhost:8000/sample/get',
    exact: true,
  });
  const unauthorized = page.waitForResponse((r) =>
    r.url().includes('/api/v1/try-it?'),
  );
  await send.click();
  expect((await unauthorized).status()).toBe(401);
  await expect(
    page.getByText('No API key found in request', { exact: false }).last(),
  ).toBeVisible();
  await page
    .getByPlaceholder('QUxMIFlPVVIgQkFTRSBBUkUgQkVMT05HIFRPIFVT')
    .last()
    .fill(credential.key);
  const authorized = page.waitForResponse((r) =>
    r.url().includes('/api/v1/try-it?'),
  );
  await send.click();
  expect((await authorized).status()).toBe(200);
  await page.goto(`/dashboard/apps/${app.id}`);
  await page.getByRole('button', { name: 'Revoke', exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Revoke key', exact: true })
    .click();
  await expect(
    page.locator('tbody').getByText('○ Revoked', { exact: true }),
  ).toBeVisible();
  expect(
    (
      await context.request.get(target, { headers: { apikey: credential.key } })
    ).status(),
  ).toBe(401);
  expect(
    (
      await context.request.delete(
        `/api/v1/apps/${app.id}/credentials/${credential.id}`,
      )
    ).status(),
  ).toBe(204);
  await context.clearCookies();
  expect((await context.request.get('/api/v1/me')).status()).toBe(401);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  await page.goto('/sign-up');
  await page.getByLabel('Name', { exact: true }).fill('Duplicate');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('QA-password-123');
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(
    page.getByText('An account with this email already exists.'),
  ).toBeVisible();
});

test('AC 2: Scalar shows a real access refusal and preserves an upstream 403', async ({
  page,
  context,
  playwright,
  baseURL,
}) => {
  test.setTimeout(60000);
  const admin = await playwright.request.newContext({ baseURL });
  const id = crypto.randomUUID(),
    path = `qa-access-${id}`;
  try {
    expect(
      (
        await admin.post('/api/auth/sign-in/email', {
          data: { email: 'admin@example.com', password: 'change-me-now' },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await admin.put(`http://localhost:8001/services/${id}`, {
          data: { name: path, url: 'http://httpbin:8080' },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await admin.post(`http://localhost:8001/services/${id}/routes`, {
          data: { paths: [`/${path}`] },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await admin.post(`http://localhost:8001/services/${id}/plugins`, {
          data: { name: 'key-auth', config: { hide_credentials: false } },
        })
      ).ok(),
    ).toBe(true);
    const imported = await admin.post('/api/v1/admin/apis', {
      data: {
        slug: path,
        gatewayServiceId: id,
        spec: {
          content: JSON.stringify({
            openapi: '3.1.0',
            info: { title: path, version: '1' },
            paths: {
              '/get': {
                get: { responses: { '200': { description: 'Echo' } } },
              },
            },
          }),
        },
      },
    });
    expect(imported.status(), await imported.text()).toBe(201);
    expect(
      (
        await context.request.post('/api/auth/sign-up/email', {
          data: {
            name: 'Access QA',
            email: `${path}@example.com`,
            password: 'QA-password-123',
          },
        })
      ).status(),
    ).toBe(200);
    const sample = (
      await (await context.request.get('/api/v1/apis')).json()
    ).items.find((a: { slug: string }) => a.slug === 'sample');
    const created = await context.request.post('/api/v1/apps', {
      data: { name: path, apiIds: [sample.id] },
    });
    expect(created.status()).toBe(201);
    const { app, credential } = await created.json();
    await expect
      .poll(
        async () =>
          (
            await context.request.get(`http://localhost:8000/${path}/get`, {
              headers: { apikey: credential.key },
            })
          ).status(),
        { timeout: 15000 },
      )
      .toBe(403);
    // JSO-277: publication can precede proxy catalog-cache expiry by 30s.
    await expect
      .poll(
        async () =>
          (
            await context.request.get(
              '/api/v1/try-it?scalar_url=' +
                encodeURIComponent(`http://localhost:8000/${path}/get`),
              { headers: { apikey: credential.key } },
            )
          ).status(),
        { timeout: 35000, intervals: [1000] },
      )
      .toBe(403);
    await page.goto(`/apis/${path}`);
    await page
      .getByRole('button', { name: /Test Request/ })
      .first()
      .click();
    await page
      .getByPlaceholder('QUxMIFlPVVIgQkFTRSBBUkUgQkVMT05HIFRPIFVT')
      .last()
      .fill(credential.key);
    const response = page.waitForResponse((r) =>
      r.url().includes('/api/v1/try-it?'),
    );
    await page
      .getByRole('button', {
        name: `Send get request to http://localhost:8000/${path}/get`,
        exact: true,
      })
      .click();
    const refused = await response;
    expect(refused.status()).toBe(403);
    expect(await refused.json()).toMatchObject({
      type: '/problems/api-access-denied',
      title: "This key doesn't have access to this API",
      detail: expect.stringContaining('create an app that includes this API'),
    });
    await expect(
      page
        .getByText("This key doesn't have access to this API", { exact: false })
        .last(),
    ).toBeVisible();
    // Grant only for the upstream-pass-through assertion; the UI refusal above used an unsubscribed app.
    expect(
      (
        await admin.post(
          `http://localhost:8001/consumers/portal-app-${app.id}/acls`,
          { data: { group: `portal-svc-${id}` } },
        )
      ).ok(),
    ).toBe(true);
    await expect
      .poll(
        async () =>
          (
            await context.request.get(
              `http://localhost:8000/${path}/status/403`,
              { headers: { apikey: credential.key } },
            )
          ).status(),
        { timeout: 15000 },
      )
      .toBe(403);
    const upstream = await context.request.get(
      '/api/v1/try-it?scalar_url=' +
        encodeURIComponent(`http://localhost:8000/${path}/status/403`),
      { headers: { apikey: credential.key } },
    );
    expect(upstream.status()).toBe(403);
    expect(upstream.headers()['x-kong-upstream-latency']).toBeDefined();
    expect(await upstream.text()).not.toContain('/problems/api-access-denied');
  } finally {
    await admin.dispose();
  }
});

test('admin imports files and URLs and rejects invalid files without publication', async ({
  page,
  context,
}) => {
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: true }).fill('admin@example.com');
  await page.getByLabel('Password', { exact: true }).fill('change-me-now');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/admin/apis');
  // Each published API needs a distinct Kong service (spec 004).
  const freshServices = [];
  for (let index = 0; index < 2; index++) {
    const id = crypto.randomUUID();
    expect(
      (
        await context.request.put(`http://localhost:8001/services/${id}`, {
          data: { name: `qa-import-${id}`, url: 'http://httpbin:8080' },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await context.request.post(
          `http://localhost:8001/services/${id}/routes`,
          {
            data: { paths: [`/qa-${id}`] },
          },
        )
      ).ok(),
    ).toBe(true);
    freshServices.push(id);
  }
  await page.reload();
  const sampleService = { id: freshServices[0]! };
  await page
    .getByLabel('Kong service', { exact: true })
    .selectOption(sampleService.id);
  const before = (await (await context.request.get('/api/v1/apis')).json())
    .items.length;
  for (const content of [
    'a: [',
    '{"openapi":"3.1.0","info":{}}',
    '{"swagger":"2.0"}',
  ]) {
    await page.getByLabel('OpenAPI file', { exact: true }).setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from(content),
    });
    const result = page.waitForResponse(
      (r) =>
        r.url().endsWith('/api/v1/admin/apis') &&
        r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Import and publish' }).click();
    expect((await result).status()).toBe(422);
    await expect(
      page.getByText('Nothing was published.', { exact: true }),
    ).toBeVisible();
    expect(
      (await (await context.request.get('/api/v1/apis')).json()).items,
    ).toHaveLength(before);
  }
  // JSO-160: a missing top-level info must name the actual schema error.
  for (const version of ['3.0.3', '3.1.0']) {
    for (const format of ['json', 'yaml']) {
      const content =
        format === 'json'
          ? JSON.stringify({ openapi: version, paths: {} })
          : `openapi: ${version}\npaths: {}`;
      await page.getByLabel('OpenAPI file', { exact: true }).setInputFiles({
        name: `missing-info.${format}`,
        mimeType: format === 'json' ? 'application/json' : 'application/yaml',
        buffer: Buffer.from(content),
      });
      const result = page.waitForResponse(
        (r) =>
          r.url().endsWith('/api/v1/admin/apis') &&
          r.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Import and publish' }).click();
      const response = await result;
      expect(response.status()).toBe(422);
      expect(response.headers()['content-type']).toContain(
        'application/problem+json',
      );
      const detail =
        "Invalid OpenAPI document: must have required property 'info' at /";
      expect(await response.json()).toMatchObject({
        detail,
        errors: [
          { message: "must have required property 'info'", pointer: '' },
        ],
      });
      await expect(page.getByText(detail, { exact: true })).toBeVisible();
      await expect(
        page.getByText('Nothing was published.', { exact: true }),
      ).toBeVisible();
      expect(
        (await (await context.request.get('/api/v1/apis')).json()).items,
      ).toHaveLength(before);
    }
  }
  const slug = `qa-${crypto.randomUUID()}`;
  await page.getByLabel('OpenAPI file', { exact: true }).setInputFiles({
    name: 'valid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        openapi: '3.1.0',
        info: { title: slug, version: '1.0' },
        paths: {},
      }),
    ),
  });
  await page.getByRole('button', { name: 'Import and publish' }).click();
  await expect(
    page.getByRole('link', { name: `View ${slug}`, exact: true }),
  ).toBeVisible();
  await page.getByLabel('From a URL', { exact: true }).check();
  await page
    .getByLabel('Document URL', { exact: true })
    .fill('http://server:4000/api/v1/apis/sample/openapi.json');
  await page
    .getByLabel('Kong service', { exact: true })
    .selectOption(freshServices[1]!);
  await page.getByText('More options', { exact: true }).click();
  await page.getByLabel('Slug', { exact: true }).fill(`${slug}-url`);
  await page.getByRole('button', { name: 'Import and publish' }).click();
  await expect(
    page.getByRole('link', { name: 'View Sample HTTP API', exact: true }),
  ).toBeVisible();
  await page.goto('/');
  await expect(
    page.getByRole('link', { name: new RegExp(slug) }).first(),
  ).toBeVisible();
});

// Local hostnames enable Scalar's optional agent by default, so exercise the
// quickstart origin and capture requests before navigation (including failures).
test('JSO-186: reference and try-it only contact the portal origin on localhost', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? 'http://localhost:3000').origin;
  expect(new URL(origin).hostname).toBe('localhost');
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin)
      externalRequests.push(request.url());
  });
  await page.goto('/apis/sample');
  await page
    .getByRole('button', { name: /Test Request/ })
    .first()
    .click();
  await expect(page.getByText('Ask AI Agent', { exact: true })).toHaveCount(0);
  const response = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/v1/try-it',
  );
  await page
    .getByRole('button', {
      name: 'Send get request to http://localhost:8000/sample/get',
      exact: true,
    })
    .click();
  expect((await response).status()).toBe(401);
  await expect(
    page.getByText('No API key found in request', { exact: false }).last(),
  ).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(externalRequests).toEqual([]);
});

test('reference document failure shows a retry and recovers without reloading the page', async ({
  page,
}) => {
  let unavailable = true;
  await page.route('**/api/v1/apis/sample/openapi.json', async (route) => {
    if (!unavailable) return route.continue();
    await route.fulfill({
      status: 503,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        type: '/problems/service-unavailable',
        title: 'Service unavailable',
        status: 503,
        detail: 'Reference temporarily unavailable',
      }),
    });
  });
  await page.goto('/apis/sample');
  const alert = page.getByRole('alert').filter({
    hasText: "The API reference didn't load.",
  });
  await expect(alert).toBeVisible();
  await expect(page.getByRole('button', { name: /Test Request/ })).toHaveCount(
    0,
  );
  unavailable = false;
  const recovered = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/apis/sample/openapi.json' &&
      response.status() === 200,
  );
  await alert.getByRole('button', { name: 'Try again', exact: true }).click();
  await recovered;
  await expect(alert).toBeHidden();
  await expect(
    page.getByRole('button', { name: /Test Request/ }).first(),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/apis\/sample$/);
});

// JSO-219: the first paint can precede hydration on a cold or slow connection.
for (const mode of ['sign-up', 'sign-in'] as const) {
  test(`JSO-219: ${mode} waits for hydration before accepting input or submission`, async ({
    page,
  }) => {
    let release!: () => void;
    const scriptsReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/_next/static/**/*.js*', async (route) => {
      await scriptsReady;
      await route.continue();
    });
    const authPosts: string[] = [];
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname.startsWith('/api/auth/')
      )
        authPosts.push(new URL(request.url()).pathname);
    });
    try {
      await page.goto(`/${mode}`, { waitUntil: 'commit' });
      await expect(page.getByLabel('Email', { exact: true })).toBeDisabled();
      await expect(page.getByLabel('Password', { exact: true })).toBeDisabled();
      const submit = page.getByRole('button', {
        name: mode === 'sign-up' ? 'Create account' : 'Sign in',
        exact: true,
      });
      await expect(submit).toBeDisabled();
      expect(authPosts).toEqual([]);
      expect(new URL(page.url()).search).toBe('');
      release();
      await expect(submit).toBeEnabled();
      if (mode === 'sign-up')
        await page
          .getByLabel('Name', { exact: true })
          .fill('Hydration regression');
      await page
        .getByLabel('Email', { exact: true })
        .fill(
          mode === 'sign-up'
            ? `qa-${crypto.randomUUID()}@example.com`
            : 'admin@example.com',
        );
      await page
        .getByLabel('Password', { exact: true })
        .fill(mode === 'sign-up' ? 'QA-password-123' : 'change-me-now');
      await submit.click();
      await expect(page).toHaveURL(/\/dashboard$/);
      expect(authPosts).toEqual([`/api/auth/${mode}/email`]);
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });
}
