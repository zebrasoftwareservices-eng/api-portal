// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// Owns the Compose test stack. Run before the environment-path e2e suite:
// pnpm exec playwright test --config tests/spec005.playwright.config.ts
const apiUrl = process.env.SERVER_URL ?? 'http://localhost:4000';
const adminUrl = process.env.KONG_ADMIN_URL ?? 'http://localhost:8001';
const proxyUrl = process.env.KONG_PROXY_PUBLIC_URL ?? 'http://localhost:8000';
const portalUrl = process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:3000';
const fresh = {
  ...process.env,
  ADMIN_EMAIL: '',
  ADMIN_PASSWORD: '',
  KONG_ADMIN_URL: '',
  KONG_ADMIN_TOKEN: '',
  SEED_SAMPLE: 'false',
};
const compose = (args: string[], env = fresh) =>
  execFileSync(
    'docker',
    [
      'compose',
      '-f',
      'deploy/docker-compose.yml',
      ...(process.env.SPEC005_COMPOSE_OVERRIDE
        ? ['-f', process.env.SPEC005_COMPOSE_OVERRIDE]
        : []),
      ...args,
    ],
    { env, stdio: 'pipe', timeout: 180000 },
  );
test('AC 1–7: fresh wizard, skip, real Test failures, bundled sample opt-in, first key and disabled gateway journey', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(300000);
  compose(['down', '-v']);
  const started = Date.now();
  try {
    compose(['up', '-d', '--wait']);
    for (const path of [
      '/',
      '/apis/sample',
      '/sign-up',
      '/apps',
      '/admin/apis',
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/setup$/);
    }
    expect(Date.now() - started).toBeLessThan(300000);
    await expect(
      page.getByText('At least 8 characters.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/portal can.t reset passwords yet/),
    ).toHaveCount(0);
    await expect(page.getByLabel('Setup token', { exact: true })).toHaveCount(
      0,
    );
    expect((await request.get(`${apiUrl}/api/v1/health`)).ok()).toBe(true);
    expect(
      (await (await request.get(`${apiUrl}/api/v1/apis`)).json()).items,
    ).toEqual([]);
    expect(
      (
        await request.post(`${apiUrl}/api/auth/sign-up/email`, {
          data: {
            name: 'Premature developer',
            email: 'before-setup@example.com',
            password: 'developer-password-123',
          },
        })
      ).status(),
    ).toBe(403);
    for (const entity of ['services', 'routes', 'plugins', 'consumers'])
      expect(
        (await (await request.get(`${adminUrl}/${entity}`)).json()).data,
      ).toEqual([]);
    await page.getByLabel('Email', { exact: true }).fill('wizard@example.com');
    await page
      .getByLabel('Password', { exact: true })
      .fill('wizard-password-123');
    await page.getByRole('button', { name: 'Create admin account' }).click();
    await expect(page).toHaveURL(/\/setup\/gateway$/);
    await expect(page.getByLabel('Admin API URL', { exact: true })).toHaveValue(
      'http://kong:8001',
    );
    await page.getByRole('link', { name: 'Skip for now.' }).click();
    await expect(page).toHaveURL(/\/admin\/apis$/);
    await expect(
      page.getByRole('link', { name: 'Go to Gateways' }),
    ).toBeVisible();
    // JSO-398: Better Auth's real sign-in response has no portal role.
    await page.context().clearCookies();
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill('wizard@example.com');
    await page
      .getByLabel('Password', { exact: true })
      .fill('wizard-password-123');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/setup\/gateway$/);
    await expect(
      page.getByRole('link', { name: 'Skip for now.' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Reaching the Kong Admin API' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/zebrasoftwareservices-eng/api-portal/blob/main/docs/connect-kong.md',
    );
    await page
      .getByLabel('Admin API URL', { exact: true })
      .fill('http://user:pw@kong:8001');
    await page.getByRole('button', { name: 'Test connection' }).click();
    await expect(
      page.getByLabel('Admin API URL', { exact: true }),
    ).toBeFocused();
    await expect(page.getByLabel('Admin API URL', { exact: true })).toHaveValue(
      'http://user:pw@kong:8001',
    );
    await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
    await page
      .getByLabel('Admin API URL', { exact: true })
      .fill('http://localhost:1');
    await page.getByRole('button', { name: 'Test connection' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: /couldn.t|can.t|disabled/i }),
    ).toContainText('use its service name, like http://kong:8001');
    await expect(
      page.getByText('Use an address the portal server can reach.'),
    ).toBeVisible();
    await page
      .getByLabel('Admin API URL', { exact: true })
      .fill('http://kong:8001');
    await page
      .getByLabel('Internal proxy URL', { exact: true })
      .fill('http://localhost:1');
    await page.getByRole('button', { name: 'Save connection' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: /couldn.t|can.t|disabled/i }),
    ).toContainText('proxy');
    await page
      .getByLabel('Internal proxy URL', { exact: true })
      .fill('http://kong:8000');
    await expect(
      page.getByRole('heading', { name: 'What saving changes in this Kong' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Test connection' }).click();
    await expect(page.getByText(/Connected to Kong 3\./)).toBeVisible();
    await page.getByRole('button', { name: 'Save connection' }).click();
    await expect(
      page.getByRole('heading', { name: 'Add the sample API?' }),
    ).toBeVisible();
    expect(
      (await (await page.request.get('/api/v1/apis')).json()).items,
    ).toEqual([]);
    await page.getByRole('button', { name: 'Publish the sample API' }).click();
    // Publishing waits for Kong's six-second protection propagation allowance.
    await expect(
      page.getByRole('link', { name: 'View Sample HTTP API' }),
    ).toBeVisible({ timeout: 15000 });
    const catalog = await (await page.request.get('/api/v1/apis')).json();
    const sample = catalog.items.find(
      (a: { slug: string }) => a.slug === 'sample',
    );
    const connection = (
      await (await page.request.get('/api/v1/admin/gateways')).json()
    ).items[0];
    expect(connection.managedBy).toBe('admin');
    const developer = await browser.newContext({
      baseURL: portalUrl,
    });
    try {
      expect(
        (
          await developer.request.post('/api/auth/sign-up/email', {
            data: {
              name: 'Wizard developer',
              email: 'wizard-developer@example.com',
              password: 'developer-password-123',
            },
          })
        ).status(),
      ).toBe(200);
      const created = await developer.request.post('/api/v1/apps', {
        data: { name: 'Wizard first call', apiIds: [sample.id] },
      });
      expect(created.status()).toBe(201);
      const { app, credential } = await created.json();
      const traffic = async () =>
        (
          await request.get(`${proxyUrl}/sample/get`, {
            headers: { apikey: credential.key },
          })
        ).status();
      await expect.poll(traffic, { timeout: 15000 }).toBe(200);
      expect(
        (
          await page.request.patch(`/api/v1/admin/gateways/${connection.id}`, {
            data: { enabled: false },
          })
        ).status(),
      ).toBe(200);
      await page.goto('/admin/apis');
      await expect(
        page.getByRole('heading', { name: 'Imports are off.' }),
      ).toBeVisible();
      await expect(
        page.getByText(
          "This gateway is disabled, so the portal doesn't offer its services.",
        ),
      ).toBeVisible();
      await expect(page.getByLabel('OpenAPI URL')).toHaveCount(0);
      expect(
        (
          await developer.request.post('/api/v1/apps', {
            data: { name: 'Blocked', apiIds: [sample.id] },
          })
        ).status(),
      ).toBe(409);
      expect(
        (
          await developer.request.post(`/api/v1/apps/${app.id}/credentials`)
        ).status(),
      ).toBe(409);
      expect(await traffic()).toBe(200);
      expect((await page.request.get('/api/v1/apis/sample')).status()).toBe(
        200,
      );
      expect(
        (
          await developer.request.delete(
            `/api/v1/apps/${app.id}/credentials/${credential.id}`,
          )
        ).status(),
      ).toBe(204);
      await expect.poll(traffic, { timeout: 15000 }).toBe(401);
      expect(
        (
          await page.request.patch(`/api/v1/admin/gateways/${connection.id}`, {
            data: { enabled: true },
          })
        ).status(),
      ).toBe(200);
    } finally {
      await developer.close();
    }
    // Removal checks real dependencies, then preserves every Kong object and traffic.
    const blockedRemoval = await page.request.delete(
      `/api/v1/admin/gateways/${connection.id}`,
    );
    expect(blockedRemoval.status()).toBe(409);
    expect(await blockedRemoval.json()).toMatchObject({
      apis: 1,
      activeKeys: 0,
    });
    const snapshot = async () => {
      const values: Record<string, unknown> = {};
      for (const entity of ['services', 'routes', 'plugins', 'consumers'])
        values[entity] = (
          await (await request.get(`${adminUrl}/${entity}`)).json()
        ).data.sort((a: { id: string }, b: { id: string }) =>
          a.id.localeCompare(b.id),
        );
      return values;
    };
    // Usage setup runs asynchronously after the gateway is connected. Observe
    // all four heartbeat objects before comparing gateway-removal snapshots.
    await expect
      .poll(
        async () => {
          const state = await snapshot();
          return Object.fromEntries(
            Object.entries(state).map(([kind, rows]) => [
              kind,
              (rows as { tags?: string[] }[]).filter((row) =>
                row.tags?.includes('portal-internal'),
              ).length,
            ]),
          );
        },
        { timeout: 15000 },
      )
      .toEqual({ services: 1, routes: 1, plugins: 2, consumers: 0 });
    const beforeRemoval = await snapshot();
    const trafficBeforeRemoval = (
      await request.get(`${proxyUrl}/sample/get`)
    ).status();
    // Test-only teardown of the published dependency; the product has no unpublish endpoint.
    compose([
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'portal',
      '-d',
      'portal',
      '-c',
      'begin; delete from subscriptions; delete from apis; commit;',
    ]);
    expect(
      (
        await page.request.delete(`/api/v1/admin/gateways/${connection.id}`)
      ).status(),
    ).toBe(204);
    expect(await snapshot()).toEqual(beforeRemoval);
    expect((await request.get(`${proxyUrl}/sample/get`)).status()).toBe(
      trafficBeforeRemoval,
    );
    expect(
      (await (await page.request.get('/api/v1/admin/gateways')).json()).items,
    ).toEqual([]);
    await page.goto('/admin/gateways');
    await expect(
      page.getByRole('heading', { name: 'Connect a Kong' }),
    ).toBeVisible();
    await page.goto('/setup');
    await expect(page).not.toHaveURL(/\/setup$/);
  } finally {
    compose(['down', '-v']);
    compose(['up', '-d', '--wait'], {
      ...fresh,
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'change-me-now',
      KONG_ADMIN_URL: 'http://kong:8001',
      SEED_SAMPLE: 'true',
    });
  }
});

test('JSO-398: admin-only environment install signs in to the missing gateway step', async ({
  page,
}) => {
  test.setTimeout(180000);
  compose(['down', '-v']);
  try {
    compose(['up', '-d', '--wait'], {
      ...fresh,
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'change-me-now',
    });
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill('admin@example.com');
    await page.getByLabel('Password', { exact: true }).fill('change-me-now');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/setup\/gateway$/);
    await expect(
      page.getByRole('link', { name: 'Skip for now.' }),
    ).toBeVisible();
  } finally {
    compose(['down', '-v']);
    compose(['up', '-d', '--wait'], {
      ...fresh,
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'change-me-now',
      KONG_ADMIN_URL: 'http://kong:8001',
      SEED_SAMPLE: 'true',
    });
  }
});

// Known minor findings remain executable until their UI fixes land. Playwright
// reports an unexpected pass when a fix makes one of these expectations succeed.
test('JSO-399: reloading the saved gateway retains the sample choice', async ({
  page,
}) => {
  test.setTimeout(180000);
  compose(['down', '-v']);
  try {
    compose(['up', '-d', '--wait'], {
      ...fresh,
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'change-me-now',
    });
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill('admin@example.com');
    await page.getByLabel('Password', { exact: true }).fill('change-me-now');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/setup\/gateway$/);
    await page.getByRole('button', { name: 'Save connection' }).click();
    await expect(
      page.getByRole('heading', { name: 'Add the sample API?' }),
    ).toBeVisible();
    await page.reload();
    test.fail(true, 'JSO-399: reload currently loses the sample panel');
    await expect(
      page.getByRole('heading', { name: 'Add the sample API?' }),
    ).toBeVisible({ timeout: 5000 });
  } finally {
    compose(['down', '-v']);
    compose(['up', '-d', '--wait'], {
      ...fresh,
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'change-me-now',
      KONG_ADMIN_URL: 'http://kong:8001',
      SEED_SAMPLE: 'true',
    });
  }
});

test('JSO-405: first-load gateway outage retains import source fields', async ({
  page,
}) => {
  test.fail(true, 'JSO-405: first-load outage currently removes the form');
  test.setTimeout(60000);
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: true }).fill('admin@example.com');
  await page.getByLabel('Password', { exact: true }).fill('change-me-now');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  compose(['stop', 'kong']);
  try {
    await page.goto('/admin/apis');
    await expect(
      page.getByRole('alert').filter({ hasText: 'Gateway unavailable' }),
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel('OpenAPI file', { exact: true })).toBeAttached(
      { timeout: 5000 },
    );
  } finally {
    compose(['start', '--wait', 'kong']);
  }
});

test('JSO-406: gateway wizard has a single connection heading', async ({
  page,
}) => {
  test.setTimeout(180000);
  compose(['down', '-v']);
  try {
    compose(['up', '-d', '--wait'], {
      ...fresh,
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'change-me-now',
    });
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill('admin@example.com');
    await page.getByLabel('Password', { exact: true }).fill('change-me-now');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/setup\/gateway$/);
    await expect(
      page.getByRole('heading', { name: 'Connect your Kong', exact: true }),
    ).toBeVisible();
    // The connection form arrives after the page heading. Wait for its loaded
    // state so absence cannot pass before the duplicate heading has rendered.
    await expect(
      page.getByLabel('Admin API URL', { exact: true }),
    ).toBeVisible();
    test.fail(
      true,
      'JSO-406: the empty gateway state repeats the connection heading',
    );
    await expect(
      page.getByRole('heading', { name: 'Connect a Kong', exact: true }),
    ).toHaveCount(0, { timeout: 5000 });
  } finally {
    compose(['down', '-v']);
    compose(['up', '-d', '--wait'], {
      ...fresh,
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'change-me-now',
      KONG_ADMIN_URL: 'http://kong:8001',
      SEED_SAMPLE: 'true',
    });
  }
});
