// SPDX-License-Identifier: Apache-2.0
import { expect, test, type Page } from '@playwright/test';

const document = (version: string, paths: Record<string, unknown>) => ({
  openapi: '3.1.0',
  info: { title: 'Orders QA', version },
  paths,
});
const response = { responses: { '200': { description: 'OK' } } };
const v1Paths = {
  '/get': { get: response },
  '/orders': { get: response },
  '/orders/{id}': {
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    get: response,
  },
};
const v2Paths = { ...v1Paths, '/orders': { post: response } };
async function upload(page: Page, doc: unknown) {
  // File input events are not replayed by React before hydration.
  await page.waitForLoadState('networkidle');
  await page.getByLabel('OpenAPI file', { exact: true }).setInputFiles({
    name: 'orders.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  });
}

test('012 AC1-4,6,9: real Kong versions, stable references, changelog, defaults and duplicate refusal', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  expect(
    (
      await context.request.post('/api/auth/sign-in/email', {
        data: { email: 'admin@example.com', password: 'change-me-now' },
      })
    ).status(),
  ).toBe(200);
  const id = crypto.randomUUID(),
    slug = `versions-${id}`;
  expect(
    (
      await context.request.put(`http://localhost:8001/services/${id}`, {
        data: { name: slug, url: 'http://httpbin:8080' },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await context.request.post(
        `http://localhost:8001/services/${id}/routes`,
        {
          data: { paths: [`/${slug}`] },
        },
      )
    ).ok(),
  ).toBe(true);
  const imported = await context.request.post('/api/v1/admin/apis', {
    data: {
      slug,
      gatewayServiceId: id,
      spec: { content: JSON.stringify(document('1.0.0', v1Paths)) },
    },
  });
  expect(imported.status(), await imported.text()).toBe(201);
  await page.goto(`/admin/apis/${slug}`);
  await upload(page, document('2.0.0', v2Paths));
  await page
    .getByLabel('Release note (optional)', { exact: true })
    .fill('Orders can now be created');
  await page
    .getByRole('button', { name: 'Publish version', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Published version 2.0.0',
  );
  await page.locator('summary').filter({ hasText: 'lint warnings' }).click();
  const warning = page.locator('.finding').first();
  await expect(warning.locator('strong code')).not.toBeEmpty();
  await expect(warning).toContainText('Line 1');
  await expect(warning.locator('p').first()).not.toBeEmpty();
  await page.goto(`/apis/${slug}`);
  const switcher = page.getByRole('button', {
    name: 'Version 2.0.0, latest',
    exact: true,
  });
  await expect(switcher).toContainText('2.0.0');
  await switcher.click();
  await page.getByRole('menuitem', { name: /1\.0\.0/ }).click();
  await expect(page).toHaveURL(new RegExp(`/apis/${slug}/versions/1\\.0\\.0$`));
  await expect(
    page.getByText("You're reading version 1.0.0.", { exact: false }),
  ).toBeVisible();
  const stable = await context.request.get(
    `/api/v1/apis/${slug}/versions/1.0.0/openapi.json`,
  );
  expect((await stable.json()).paths['/orders'].get).toBeTruthy();
  const app = await context.request.post('/api/v1/apps', {
    data: {
      name: `Version try-it ${id}`,
      apiIds: [(await imported.json()).id],
    },
  });
  expect(app.status(), await app.text()).toBe(201);
  const key = (await app.json()).credential.key;
  for (const route of [`/apis/${slug}`, `/apis/${slug}/versions/1.0.0`]) {
    await page.goto(route);
    await page
      .getByRole('button', { name: /Test Request/ })
      .first()
      .click();
    await page
      .getByPlaceholder('QUxMIFlPVVIgQkFTRSBBUkUgQkVMT05HIFRPIFVT')
      .last()
      .fill(key);
    const call = page.waitForResponse((r) =>
      r.url().includes('/api/v1/try-it?'),
    );
    await page
      .getByRole('button', {
        name: `Send get request to http://localhost:8000/${slug}/get`,
        exact: true,
      })
      .click();
    expect((await call).status()).toBe(200);
  }
  await page.goto(`/apis/${slug}/changelog`);
  const entry = page.getByRole('article', { name: '2.0.0', exact: true });
  await expect(entry).toContainText('Orders can now be created');
  await expect(entry.locator('time')).toHaveAttribute(
    'datetime',
    /\d{4}-\d{2}-\d{2}T/,
  );
  await expect(
    entry.locator('section').filter({ hasText: 'Added' }),
  ).toContainText('POST');
  await expect(
    entry.locator('section').filter({ hasText: 'Removed' }),
  ).toContainText('GET');
  await expect(entry).toContainText('Breaking changes');
  await page.goto(`/admin/apis/${slug}`);
  await upload(page, document('1.1.0', v1Paths));
  await page.getByLabel("Don't make this the default version").check();
  await page
    .getByRole('button', { name: 'Publish version', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Developers still see 2.0.0 first',
  );
  await upload(page, document('1.2.0', v1Paths));
  await page
    .getByRole('button', { name: 'Publish version', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Published version 1.2.0',
  );
  expect(
    (await (await context.request.get(`/api/v1/apis/${slug}`)).json()).version,
  ).toBe('1.2.0');
  await page
    .getByRole('button', { name: 'Set 2.0.0 as latest', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    '2.0.0 is now the latest',
  );
  await page.goto(`/apis/${slug}`);
  await expect(
    page.getByRole('button', { name: 'Version 2.0.0, latest', exact: true }),
  ).toBeVisible();
  const unknown = await context.request.put(
    `/api/v1/admin/apis/${slug}/latest-version`,
    {
      data: { version: 'does-not-exist' },
    },
  );
  expect(unknown.status()).toBe(404);
  expect(unknown.headers()['content-type']).toContain(
    'application/problem+json',
  );
  const developer = await context.browser()!.newContext();
  try {
    const signed = await developer.request.post(
      'http://localhost:3000/api/auth/sign-up/email',
      {
        data: {
          name: 'Version reader',
          email: `reader-${id}@example.com`,
          password: 'version-reader-password',
        },
      },
    );
    expect(signed.status()).toBe(200);
    const refused = await developer.request.put(
      `http://localhost:3000/api/v1/admin/apis/${slug}/latest-version`,
      {
        data: { version: '1.0.0' },
      },
    );
    expect(refused.status()).toBe(403);
    expect(refused.headers()['content-type']).toContain(
      'application/problem+json',
    );
  } finally {
    await developer.close();
  }
  expect(
    (await (await context.request.get(`/api/v1/apis/${slug}`)).json()).version,
  ).toBe('2.0.0');
  await page.goto(`/admin/apis/${slug}`);
  const before = await (
    await context.request.get(`/api/v1/apis/${slug}/openapi.json`)
  ).json();
  await upload(page, document('2.0.0', {}));
  const duplicate = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/admin/apis/${slug}/versions`) &&
      r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Publish version', exact: true })
    .click();
  expect((await duplicate).status()).toBe(409);
  await expect(
    page
      .getByText('Change info.version in the document, then publish again.', {
        exact: false,
      })
      .first(),
  ).toBeVisible();
  expect(
    await (
      await context.request.get(`/api/v1/apis/${slug}/openapi.json`)
    ).json(),
  ).toEqual(before);
  const catalog = (await (await context.request.get('/api/v1/apis')).json())
    .items;
  expect(catalog.filter((a: { slug: string }) => a.slug === slug)).toHaveLength(
    1,
  );
  expect(
    (await (await context.request.get(`/api/v1/apis/${slug}`)).json())
      .gatewayService.id,
  ).toBe(id);
});

for (const [rule, paths] of [
  [
    'operation-operationId-unique',
    {
      '/a': { get: { ...response, operationId: 'same' } },
      '/b': { get: { ...response, operationId: 'same' } },
    },
  ],
  [
    'invalid-ref',
    {
      '/orders': {
        get: {
          responses: { '200': { $ref: '#/components/responses/Missing' } },
        },
      },
    },
  ],
  ['path-params', { '/orders/{id}': { get: response } }],
] as const) {
  test(`012 AC5: ${rule} shows rule, message, pointer and line in both import forms`, async ({
    page,
    context,
  }) => {
    await context.request.post('/api/auth/sign-in/email', {
      data: { email: 'admin@example.com', password: 'change-me-now' },
    });
    const before = await (
      await context.request.get('/api/v1/apis/sample')
    ).json();
    for (const route of ['/admin/apis', '/admin/apis/sample']) {
      await page.goto(route);
      if (route === '/admin/apis') {
        const services = (
          await (
            await context.request.get('/api/v1/admin/gateway/services')
          ).json()
        ).items;
        await page
          .getByLabel('Kong service', { exact: true })
          .selectOption(services[0].id);
      }
      await upload(page, document('invalid-lint', paths));
      const url =
        route === '/admin/apis'
          ? '/api/v1/admin/apis'
          : '/api/v1/admin/apis/sample/versions';
      const result = page.waitForResponse(
        (r) => r.url().endsWith(url) && r.request().method() === 'POST',
      );
      await page
        .getByRole('button', {
          name:
            route === '/admin/apis' ? 'Import and publish' : 'Publish version',
          exact: true,
        })
        .click();
      const refused = await result;
      expect(refused.status()).toBe(422);
      expect(refused.headers()['content-type']).toContain(
        'application/problem+json',
      );
      const finding = page
        .locator('.finding')
        .filter({ has: page.locator('strong code', { hasText: rule }) })
        .first();
      await expect(finding).toContainText('Line 1');
      await expect(finding.locator('p').first()).not.toBeEmpty();
      await expect(finding.locator(':scope > code')).toContainText('/paths/');
    }
    expect(
      await (await context.request.get('/api/v1/apis/sample')).json(),
    ).toEqual(before);
  });
}

// Start the production server from the Compose definition with an operator-mounted file.
// It shares the real quickstart database and Kong, but has a separate random host port.
for (const mode of ['custom', 'missing', 'invalid'] as const) {
  test(`012 AC7-8: mounted ${mode} ruleset in the production image`, async ({
    playwright,
    context,
  }) => {
    test.setTimeout(90000);
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { mkdtemp, writeFile, rm, chmod } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const run = promisify(execFile);
    const dir = await mkdtemp(join(tmpdir(), 'portal-012-operator-'));
    await chmod(dir, 0o755);
    const name = `portal-012-${mode}-${crypto.randomUUID()}`;
    const mountedPath = `/qa/${mode}.yaml`;
    try {
      if (mode === 'custom')
        await writeFile(
          join(dir, `${mode}.yaml`),
          'extends: []\nrules:\n  operation-description:\n    given: $.paths[*].get\n    severity: error\n    then:\n      field: description\n      function: truthy\n',
        );
      if (mode === 'invalid')
        await writeFile(join(dir, `${mode}.yaml`), 'rules: [');
      await run('docker', [
        'compose',
        '-f',
        'deploy/docker-compose.yml',
        'run',
        '--no-deps',
        '-d',
        '--name',
        name,
        '-p',
        '127.0.0.1::4000',
        '-v',
        `${dir}:/qa:ro`,
        '-e',
        `PORTAL_LINT_RULESET=${mountedPath}`,
        'server',
      ]);
      const port = (await run('docker', ['port', name, '4000/tcp'])).stdout
        .trim()
        .split(':')
        .at(-1);
      const client = await playwright.request.newContext({
        baseURL: `http://localhost:${port}`,
      });
      try {
        await expect
          .poll(
            async () => {
              try {
                return (await client.get('/api/v1/health')).status();
              } catch {
                return 0;
              }
            },
            { timeout: 60000 },
          )
          .toBe(200);
        const health = await (await client.get('/api/v1/health')).json();
        expect(health.lint).toMatchObject({
          ruleset: 'custom',
          status: mode === 'custom' ? 'ok' : 'error',
          path: mountedPath,
        });
        expect(
          (
            await client.post('/api/auth/sign-in/email', {
              data: { email: 'admin@example.com', password: 'change-me-now' },
            })
          ).status(),
        ).toBe(200);
        const rejected = await client.post(
          '/api/v1/admin/apis/sample/versions',
          {
            data: {
              spec: {
                content: JSON.stringify(
                  document(`mounted-${mode}`, { '/orders': { get: response } }),
                ),
              },
            },
          },
        );
        expect(rejected.status(), await rejected.text()).toBe(
          mode === 'custom' ? 422 : 503,
        );
        expect(rejected.headers()['content-type']).toContain(
          'application/problem+json',
        );
        if (mode === 'custom') {
          expect((await rejected.json()).errors).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ rule: 'operation-description' }),
            ]),
          );
          const accepted = await client.post(
            '/api/v1/admin/apis/sample/versions',
            {
              data: {
                spec: {
                  content: JSON.stringify(
                    document(`operator-${crypto.randomUUID()}`, {
                      '/orders/{id}': {
                        get: {
                          ...response,
                          description:
                            'Passes the operator rule; undeclared parameter omitted from operator rules.',
                        },
                      },
                    }),
                  ),
                },
                makeLatest: false,
              },
            },
          );
          expect(accepted.status(), await accepted.text()).toBe(201);
        } else {
          expect(health.status).toBe('degraded');
          expect(health.lint.error).toContain(mountedPath);
          const logs = (await run('docker', ['logs', name])).stdout;
          expect(logs).toContain('Lint ruleset unavailable');
          expect(logs).toContain(mountedPath);
          expect((await client.get('/api/v1/apis/sample')).status()).toBe(200);
        }
        expect(
          (await (await context.request.get('/api/v1/health')).json()).lint,
        ).toMatchObject({ status: 'ok', ruleset: 'default' });
      } finally {
        await client.dispose();
      }
    } finally {
      await run('docker', ['rm', '-f', name]).catch(() => {});
      await rm(dir, { recursive: true });
    }
  });
}

test('012 failure path: version upload cannot discard input before hydration', async ({
  page,
  context,
}) => {
  await context.request.post('/api/auth/sign-in/email', {
    data: { email: 'admin@example.com', password: 'change-me-now' },
  });
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/_next/static/**/*.js*', async (route) => {
    await ready;
    await route.continue();
  });
  try {
    await page.goto('/admin/apis/sample', { waitUntil: 'commit' });
    const input = page.getByLabel('OpenAPI file', { exact: true });
    const enabled = await input.isEnabled();
    const version = `hydration-${crypto.randomUUID()}`;
    if (enabled) {
      await input.setInputFiles({
        name: 'hydration.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(document(version, v1Paths))),
      });
    }
    release();
    await page.waitForLoadState('networkidle');
    if (!enabled) await upload(page, document(version, v1Paths));
    await page
      .getByRole('button', { name: 'Publish version', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText(
      `Published version ${version}`,
    );
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});
