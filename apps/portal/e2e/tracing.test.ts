// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const settings = {
  traceEndpoint: 'http://server:4000/api/v1/internal/traces/kong',
  instrumentations: [
    'request',
    'router',
    'balancer',
    'plugin_rewrite',
    'plugin_access',
    'plugin_header_filter',
  ],
  samplingRate: 1,
};

test('026 AC3/10: tracing dialog mirrors every quickstart node value', async ({
  page,
}) => {
  const request = page.request;
  expect(
    (
      await request.post('/api/auth/sign-in/email', {
        data: { email: 'admin@example.com', password: 'change-me-now' },
      })
    ).status(),
  ).toBe(200);
  await page.goto('/admin/tracing');
  await page
    .getByRole('button', { name: /Turn on tracing|Edit settings/ })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('tracing_instrumentations');
  await expect(dialog).toContainText('tracing_sampling_rate');
  await expect(dialog).toContainText('KONG_TRACING_INSTRUMENTATIONS');
  await expect(dialog).toContainText('KONG_TRACING_SAMPLING_RATE');
  await expect(dialog).toContainText(/restart the Kong node/i);
  await expect(dialog.getByLabel('Trace endpoint')).toHaveValue(
    settings.traceEndpoint,
  );
  await expect(dialog.getByLabel('Sampling rate')).toHaveValue('1');
  for (const instrumentation of settings.instrumentations)
    await expect(
      dialog.getByRole('checkbox', {
        name: new RegExp(`^${instrumentation}( \\(required\\))?$`),
      }),
    ).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: /Turn on tracing|Edit settings/ }),
  ).toBeFocused();
});

test('026 AC4/6: quickstart probe passes and a selected call renders a waterfall', async ({
  page,
}) => {
  const request = page.request;
  test.setTimeout(45_000);
  expect(
    (
      await request.post('/api/auth/sign-in/email', {
        data: { email: 'admin@example.com', password: 'change-me-now' },
      })
    ).status(),
  ).toBe(200);
  const saved = await request.put('/api/v1/admin/tracing', { data: settings });
  expect(saved.status(), await saved.text()).toBe(200);
  const apis = await (await request.get('/api/v1/apis')).json();
  const sample = apis.items.find(
    (api: { slug: string }) => api.slug === 'sample',
  );
  expect(sample).toBeTruthy();
  // Start from no sample selection so the picker, not the API, adds it.
  const before = await (await request.get('/api/v1/admin/tracing')).json();
  for (const selection of before.selections as {
    id: string;
    kind: string;
    targetId: string;
  }[])
    if (selection.kind === 'api' && selection.targetId === sample.id)
      expect(
        (
          await request.delete(
            `/api/v1/admin/tracing/selections/${selection.id}`,
          )
        ).status(),
      ).toBe(204);

  await page.goto('/admin/tracing');
  const kind = page.getByLabel('Kind');
  const apiPicker = page.getByLabel('Select api');
  await expect(kind).toHaveValue('api');
  const sampleOption = apiPicker.locator(`option[value="${sample.id}"]`);
  await expect(sampleOption).toHaveText(sample.title);
  // A kind change resets the target list and the chosen target.
  await apiPicker.selectOption(sample.id);
  await expect(apiPicker).toHaveValue(sample.id);
  await kind.selectOption('team');
  await kind.selectOption('api');
  await expect(apiPicker).toHaveValue('');
  await expect(sampleOption).toBeAttached();
  await apiPicker.selectOption(sample.id);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(
    page.getByRole('table').filter({ hasText: 'Covers' }),
  ).toContainText(sample.slug);
  const after = await (await request.get('/api/v1/admin/tracing')).json();
  expect(
    (after.selections as { kind: string; targetId: string }[]).some(
      (selection) =>
        selection.kind === 'api' && selection.targetId === sample.id,
    ),
  ).toBe(true);

  await page.getByRole('button', { name: 'Edit settings' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Test' }).click();
  await expect(page.getByText('✓ Test passed')).toBeVisible({
    timeout: 15_000,
  });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cancel' })
    .click();

  const target =
    '/api/v1/try-it?scalar_url=' +
    encodeURIComponent(
      `${process.env.KONG_PROXY_PUBLIC_URL ?? 'http://localhost:8000'}/sample/get?token=abc123`,
    );
  expect((await request.get(target)).status()).toBe(401);
  const latest = page.getByRole('main');
  await expect(
    latest.getByRole('table', { name: /Spans of the latest traced call/ }),
  ).toBeVisible({
    timeout: 30_000,
  });
  await expect(latest).toContainText('GET');
  await expect(latest).toContainText('/sample/get');
  await expect(latest).toContainText('401');
  await expect(latest).not.toContainText('abc123');
  await expect(latest).toContainText('Slowest');
});

test('026 AC6: keeps and switches the latest trace independently for two APIs', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const request = page.request;
  expect(
    (
      await request.post('/api/auth/sign-in/email', {
        data: { email: 'admin@example.com', password: 'change-me-now' },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await request.put('/api/v1/admin/tracing', { data: settings })).status(),
  ).toBe(200);

  const id = crypto.randomUUID();
  const slug = `trace-${id}`;
  const title = `Trace API ${id}`;
  const kong = process.env.KONG_ADMIN_URL ?? 'http://localhost:8001';
  expect(
    (
      await request.put(`${kong}/services/${id}`, {
        data: { name: slug, url: 'http://httpbin:8080' },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.post(`${kong}/services/${id}/routes`, {
        data: { paths: [`/${slug}`] },
      })
    ).ok(),
  ).toBe(true);
  const imported = await request.post('/api/v1/admin/apis', {
    data: {
      slug,
      gatewayServiceId: id,
      spec: {
        content: JSON.stringify({
          openapi: '3.1.0',
          info: { title, version: '1.0.0' },
          paths: {
            '/get': {
              get: { responses: { '200': { description: 'OK' } } },
            },
          },
        }),
      },
    },
  });
  expect(imported.status(), await imported.text()).toBe(201);
  const tracedApi = await imported.json();
  const catalog = await (await request.get('/api/v1/apis')).json();
  const sample = catalog.items.find(
    (api: { slug: string }) => api.slug === 'sample',
  );
  expect(sample).toBeTruthy();

  const tracing = await (await request.get('/api/v1/admin/tracing')).json();
  for (const api of [sample, tracedApi]) {
    if (
      !(tracing.selections as { kind: string; targetId: string }[]).some(
        (selection) =>
          selection.kind === 'api' && selection.targetId === api.id,
      )
    ) {
      const selected = await request.post(
        '/api/v1/admin/tracing/selections',
        { data: { kind: 'api', targetId: api.id } },
      );
      expect([200, 201]).toContain(selected.status());
    }
  }
  await expect
    .poll(
      async () =>
        (await (await request.get('/api/v1/admin/tracing')).json()).apply
          .status,
      { timeout: 30_000 },
    )
    .toBe('applied');

  const proxy = process.env.KONG_PROXY_PUBLIC_URL ?? 'http://localhost:8000';
  const call = (path: string) =>
    request.get(
      '/api/v1/try-it?scalar_url=' + encodeURIComponent(`${proxy}${path}`),
    );
  const latest = async (apiId: string) => {
    const response = await request.get(
      `/api/v1/admin/tracing/latest?apiId=${apiId}`,
    );
    expect(response.status(), await response.text()).toBe(200);
    return (await response.json()).trace;
  };

  await call('/sample/get');
  await expect
    .poll(async () => (await latest(sample.id))?.request?.path, {
      timeout: 30_000,
    })
    .toBe('/sample/get');
  await call(`/${slug}/get`);
  await expect
    .poll(async () => (await latest(tracedApi.id))?.request?.path, {
      timeout: 30_000,
    })
    .toBe(`/${slug}/get`);

  const tracedBefore = await latest(tracedApi.id);
  await page.goto('/admin/tracing');
  const picker = page.getByLabel('Show the latest call to');
  await expect(picker).toHaveValue(tracedApi.id, { timeout: 30_000 });
  await expect(page.getByRole('main')).toContainText(`/${slug}/get`);
  await picker.selectOption(sample.id);
  await expect(page.getByRole('main')).toContainText('/sample/get');
  await picker.selectOption(tracedApi.id);
  await expect(page.getByRole('main')).toContainText(`/${slug}/get`);

  const sampleBefore = await latest(sample.id);
  await call('/sample/get');
  await expect
    .poll(async () => (await latest(sample.id))?.traceId, {
      timeout: 30_000,
    })
    .not.toBe(sampleBefore.traceId);
  expect((await latest(tracedApi.id)).traceId).toBe(tracedBefore.traceId);
});

test('026 AC10: the quickstart Kong node sets the tracing instrumentations and sampling rate', () => {
  const compose = readFileSync(
    resolve(process.cwd(), 'deploy/docker-compose.yml'),
    'utf8',
  );
  const instrumentations =
    /KONG_TRACING_INSTRUMENTATIONS: \$\{KONG_TRACING_INSTRUMENTATIONS:-([^}]+)\}/.exec(
      compose,
    )?.[1];
  expect(instrumentations?.split(',')).toEqual(settings.instrumentations);
  for (const excluded of ['db_query', 'dns_query', 'http_client'])
    expect(instrumentations).not.toContain(excluded);
  expect(compose).toMatch(
    /KONG_TRACING_SAMPLING_RATE: \$\{KONG_TRACING_SAMPLING_RATE:-1\}/,
  );
});

test('026 AC9: an anonymous visitor cannot open the admin trace page', async ({
  page,
}) => {
  await page.goto('/admin/tracing');
  await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  await expect(
    page.getByRole('heading', { name: 'Tracing', exact: true }),
  ).not.toBeVisible();
});

test('026 AC1/6: a traced developer account keeps one latest trace per called API', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const admin = page.request;
  expect(
    (
      await admin.post('/api/auth/sign-in/email', {
        data: { email: 'admin@example.com', password: 'change-me-now' },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await admin.put('/api/v1/admin/tracing', { data: settings })).status(),
  ).toBe(200);

  // A second Kong API that requires a key, imported into the portal.
  const id = crypto.randomUUID();
  const slug = `dev-trace-${id}`;
  const kong = process.env.KONG_ADMIN_URL ?? 'http://localhost:8001';
  for (const [path, data] of [
    [`/services/${id}`, { name: slug, url: 'http://httpbin:8080' }],
    [`/services/${id}/routes`, { paths: [`/${slug}`] }],
    [`/services/${id}/plugins`, { name: 'key-auth' }],
  ] as const) {
    const response = path.endsWith('/routes') || path.endsWith('/plugins')
      ? await admin.post(`${kong}${path}`, { data })
      : await admin.put(`${kong}${path}`, { data });
    expect(response.ok(), await response.text()).toBe(true);
  }
  const imported = await admin.post('/api/v1/admin/apis', {
    data: {
      slug,
      gatewayServiceId: id,
      spec: {
        content: JSON.stringify({
          openapi: '3.1.0',
          info: { title: `Developer Trace ${id}`, version: '1.0.0' },
          paths: {
            '/get': { get: { responses: { '200': { description: 'OK' } } } },
          },
        }),
      },
    },
  });
  expect(imported.status(), await imported.text()).toBe(201);
  const second = await imported.json();
  const sample = (await (await admin.get('/api/v1/apis')).json()).items.find(
    (api: { slug: string }) => api.slug === 'sample',
  );
  expect(sample).toBeTruthy();

  // The developer signs up and gets one key for both APIs.
  const developerContext = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  try {
    const developer = developerContext.request;
    expect(
      (
        await developer.post('/api/auth/sign-up/email', {
          data: {
            name: 'Trace Developer',
            email: `trace-dev-${id}@example.com`,
            password: 'QA-password-123',
          },
        })
      ).ok(),
    ).toBe(true);
    const me = await (await developer.get('/api/v1/me')).json();
    const app = await developer.post('/api/v1/apps', {
      data: { name: 'Traced app', apiIds: [sample.id, second.id] },
    });
    expect(app.status(), await app.text()).toBe(201);
    const key = (await app.json()).credential.key as string;

    // Only the developer account is selected for tracing, not either API.
    const selected = await admin.post('/api/v1/admin/tracing/selections', {
      data: { kind: 'developer', targetId: me.id },
    });
    expect([200, 201]).toContain(selected.status());
    await expect
      .poll(
        async () =>
          (await (await admin.get('/api/v1/admin/tracing')).json()).apply
            .status,
        { timeout: 30_000 },
      )
      .toBe('applied');

    const proxy = process.env.KONG_PROXY_PUBLIC_URL ?? 'http://localhost:8000';
    const call = async (path: string) => {
      const response = await developer.get(`${proxy}${path}`, {
        headers: { apikey: key },
      });
      expect(response.status(), path).toBe(200);
    };
    const latest = async (apiId: string) => {
      const response = await admin.get(
        `/api/v1/admin/tracing/latest?apiId=${apiId}`,
      );
      expect(response.status(), await response.text()).toBe(200);
      return (await response.json()).trace;
    };

    const sampleBefore = (await latest(sample.id))?.traceId;
    await call('/sample/get?token=abc123');
    await expect
      .poll(async () => (await latest(sample.id))?.traceId, { timeout: 30_000 })
      .not.toBe(sampleBefore);
    const sampleTrace = await latest(sample.id);
    expect(sampleTrace.request).toMatchObject({ method: 'GET', path: '/sample/get', statusCode: 200 });
    expect(sampleTrace.api.id).toBe(sample.id);

    await call(`/${slug}/get`);
    await expect
      .poll(async () => (await latest(second.id))?.request?.path, {
        timeout: 30_000,
      })
      .toBe(`/${slug}/get`);
    const secondTrace = await latest(second.id);
    expect(secondTrace.api.id).toBe(second.id);
    expect(secondTrace.traceId).not.toBe(sampleTrace.traceId);
    expect(JSON.stringify(secondTrace)).not.toContain('abc123');

    // The second API's call did not replace the sample API's latest trace.
    expect((await latest(sample.id)).traceId).toBe(sampleTrace.traceId);
    const newest = await (await admin.get('/api/v1/admin/tracing/latest')).json();
    expect(newest.apis.map((api: { id: string }) => api.id)).toEqual(
      expect.arrayContaining([sample.id, second.id]),
    );

    await admin.delete(
      `/api/v1/admin/tracing/selections/${(await selected.json()).id}`,
    );
  } finally {
    await developerContext.close();
  }
});
