// SPDX-License-Identifier: Apache-2.0
import { expect, test, type APIRequestContext } from '@playwright/test';

const password = 'QA-password-123';

async function signIn(
  request: APIRequestContext,
  email: string,
  userPassword = password,
) {
  return request.post('/api/auth/sign-in/email', {
    data: { email, password: userPassword },
  });
}

async function signUp(request: APIRequestContext, email: string) {
  const response = await request.post('/api/auth/sign-up/email', {
    data: { name: 'Sidebar QA', email, password },
  });
  expect(response.status()).toBe(200);
}

test('024 AC 1–3, 6, 9–10: admin shell navigation and invalid account limits', async ({
  page,
  context,
}) => {
  expect(
    (await signIn(context.request, 'admin@example.com', 'change-me-now')).status(),
  ).toBe(200);

  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/gateways$/);
  const sidebar = page.getByRole('navigation', { name: 'Admin', exact: true });
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Admin' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect(await sidebar.locator('a').allTextContents()).toEqual([
    'APIs',
    'Products',
    'Apps',
    'Requests',
    'Insights',
    'Tracing',
    'APIs',
    'Gateways',
    'Mail',
    'Accounts',
    'Theme',
    'Pages',
    'Navigation',
  ]);
  await expect(sidebar.getByRole('link', { name: 'Gateways' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(
    sidebar.getByRole('button', { name: 'Admin' }).locator('svg'),
  ).not.toHaveCSS('transform', 'none');
  await expect(sidebar.getByText('Profile')).toHaveCount(0);
  await expect(sidebar.getByText('Sign out')).toHaveCount(0);

  await page.goto('/apis');
  await expect(page.getByRole('heading', { name: 'APIs', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /View reference for Sample HTTP API/ })).toHaveAttribute(
    'href',
    '/apis/sample',
  );
  await expect(page.getByText('Products', { exact: true })).toHaveCount(1);
  await sidebar.getByRole('link', { name: 'Products' }).click();
  await expect(page).toHaveURL(/\/admin\/products$/);
  await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeVisible();

  await page.goto('/');
  for (const action of ['My apps', 'Teams', 'Create app', 'Subscribe'])
    await expect(page.getByText(action, { exact: true })).toHaveCount(0);
  const account = page.getByRole('button', {
    name: 'Account menu for admin@example.com',
  });
  await expect(account).toHaveAttribute('aria-expanded', 'false');
  await expect(account.locator('svg.chevron-menu')).toHaveCount(1);
  await account.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Profile' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'My apps' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Teams' })).toHaveCount(0);

  await page.goto('/admin/settings/accounts');
  const maximum = page.getByLabel('Failed sign-ins: maximum attempts');
  const window = page.getByLabel('Failed sign-ins: window in minutes');
  await expect(maximum).toHaveValue('10');
  await expect(window).toHaveValue('15');
  await expect(maximum.locator('xpath=..')).toContainText('attempts');
  await expect(window.locator('xpath=..')).toContainText('minutes');
  let writes = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'PUT' &&
      new URL(request.url()).pathname === '/api/v1/admin/settings/accounts'
    )
      writes += 1;
  });
  for (const [field, bad] of [
    [maximum, '0'],
    [maximum, '-1'],
    [maximum, 'not-a-number'],
    [window, '0'],
    [window, '-1'],
    [window, 'not-a-number'],
  ] as const) {
    await field.fill(bad);
    await page.getByRole('button', { name: 'Save account settings' }).click();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await field.fill(field === maximum ? '10' : '15');
  }
  expect(writes).toBe(0);
  await page.reload();
  await expect(maximum).toHaveValue('10');
  await expect(window).toHaveValue('15');
  await expect(page.getByRole('button', { name: 'Save account settings' })).toHaveCSS(
    'justify-self',
    'start',
  );
});

test('024 AC 4–5: admin Apps exposes hints only and detail stays read-only', async ({
  page,
  context,
}) => {
  const email = `sidebar-app-${crypto.randomUUID()}@example.com`;
  await signUp(context.request, email);
  const catalog = await (await context.request.get('/api/v1/apis')).json();
  const sample = catalog.items.find((api: { slug: string }) => api.slug === 'sample');
  expect(sample).toBeTruthy();
  const created = await context.request.post('/api/v1/apps', {
    data: { name: 'Sidebar QA app', apiIds: [sample.id] },
  });
  expect(created.status()).toBe(201);
  const first = await created.json();
  const secondResponse = await context.request.post(
    `/api/v1/apps/${first.app.id}/credentials`,
  );
  expect(secondResponse.status()).toBe(201);
  const second = await secondResponse.json();
  expect(
    (
      await context.request.delete(
        `/api/v1/apps/${first.app.id}/credentials/${first.credential.id}`,
      )
    ).status(),
  ).toBe(204);

  await context.clearCookies();
  expect(
    (await signIn(context.request, 'admin@example.com', 'change-me-now')).status(),
  ).toBe(200);
  await page.goto('/admin/apps');
  const row = page.getByRole('row').filter({ hasText: email });
  await expect(row).toContainText('Sidebar QA app');
  await expect(row).toContainText(email);
  await expect(row).toContainText(second.key.slice(-4));
  if (first.credential.key.slice(-4) !== second.key.slice(-4))
    await expect(row).not.toContainText(first.credential.key.slice(-4));
  await expect(page.locator('body')).not.toContainText(second.key);
  await row.getByRole('link', { name: /View Sidebar QA app/ }).click();
  await expect(page.getByRole('heading', { name: 'Sidebar QA app' })).toBeVisible();
  await expect(page.getByText(`…${second.key.slice(-4)}`)).toBeVisible();
  await expect(page.locator('body')).not.toContainText(second.key);
  for (const action of ['Reveal', 'Regenerate', 'Create key', 'Cancel subscription'])
    await expect(page.getByText(action, { exact: false })).toHaveCount(0);
  await expect(page.getByText(/revoke it on the product.s access screen/i)).toBeVisible();
});

test('024 AC 8: developer keeps developer navigation and cannot enter admin', async ({
  page,
  context,
}) => {
  const email = `sidebar-developer-${crypto.randomUUID()}@example.com`;
  await signUp(context.request, email);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'My apps' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'My apps' })).toBeVisible();
  const teamSwitcher = page.getByRole('button', {
    name: /^Team: .+\. Switch team$/,
  });
  await expect(teamSwitcher).toBeVisible();
  await teamSwitcher.click();
  await expect(page.getByRole('menuitem', { name: 'Team settings' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Admin', exact: true })).toHaveCount(0);
  await expect(page.getByText('Insights', { exact: true })).toHaveCount(0);
  expect((await context.request.get('/api/v1/admin/apps')).status()).toBe(403);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible();
});
