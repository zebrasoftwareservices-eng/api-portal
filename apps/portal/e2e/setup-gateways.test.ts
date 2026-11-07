// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// Owns the Compose test stack. Run before the environment-path e2e suite:
// pnpm exec playwright test --config tests/spec005.playwright.config.ts
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
    ['compose', '-f', 'deploy/docker-compose.yml', ...args],
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
    await expect(page.getByLabel('Setup token', { exact: true })).toHaveCount(
      0,
    );
    expect(
      (await request.get('http://localhost:4000/api/v1/health')).ok(),
    ).toBe(true);
    expect(
      (await (await request.get('http://localhost:4000/api/v1/apis')).json())
        .items,
    ).toEqual([]);
    expect(
      (
        await request.post('http://localhost:4000/api/auth/sign-up/email', {
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
        (await (await request.get(`http://localhost:8001/${entity}`)).json())
          .data,
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
    await page.goto('/setup/gateway');
    await page
      .getByLabel('Admin API URL', { exact: true })
      .fill('http://localhost:1');
    await page.getByRole('button', { name: 'Test connection' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: /couldn.t|can.t|disabled/i }),
    ).toContainText('server');
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
    await expect(
      page.getByRole('link', { name: 'View Sample HTTP API' }),
    ).toBeVisible();
    const catalog = await (await page.request.get('/api/v1/apis')).json();
    const sample = catalog.items.find(
      (a: { slug: string }) => a.slug === 'sample',
    );
    const connection = (
      await (await page.request.get('/api/v1/admin/gateways')).json()
    ).items[0];
    expect(connection.managedBy).toBe('admin');
    const developer = await browser.newContext({
      baseURL: 'http://localhost:3000',
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
          await request.get('http://localhost:8000/sample/get', {
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
          await (await request.get(`http://localhost:8001/${entity}`)).json()
        ).data.sort((a: { id: string }, b: { id: string }) =>
          a.id.localeCompare(b.id),
        );
      return values;
    };
    const beforeRemoval = await snapshot();
    const trafficBeforeRemoval = (
      await request.get('http://localhost:8000/sample/get')
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
    expect(
      (await request.get('http://localhost:8000/sample/get')).status(),
    ).toBe(trafficBeforeRemoval);
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
