// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';

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
  const services = await (
    await context.request.get('/api/v1/admin/gateway/services')
  ).json();
  const sampleService = services.items.find(
    (s: { name: string }) => s.name === 'portal-sample',
  );
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
    .selectOption({ index: 1 });
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
