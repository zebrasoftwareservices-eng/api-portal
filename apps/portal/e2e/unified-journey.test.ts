// SPDX-License-Identifier: Apache-2.0
import { expect, test, type Page, type BrowserContext } from '@playwright/test';

const password = 'QA-password-123';
const noAccess =
  'If you get a 403, select Get an API key to create an app that includes this API.';
const unknownAccess =
  'If you get a 403, use a key from an app that includes this API.';
async function register(context: BrowserContext) {
  const email = `journey-${crypto.randomUUID()}@example.com`;
  const response = await context.request.post('/api/auth/sign-up/email', {
    data: { name: 'Journey QA', email, password },
  });
  expect(response.status()).toBe(200);
  return email;
}
async function mockApps(page: Page, items: unknown[]) {
  await page.route('**/api/v1/apps', (route) =>
    route.fulfill({ json: { items } }),
  );
}
function app(id: string, name: string, access = true, count = 1) {
  return {
    id,
    name,
    createdAt: '2026-01-02T12:00:00.000Z',
    subscriptions: Array.from({ length: access ? count : 0 }, (_, i) => ({
      apiId: crypto.randomUUID(),
      slug: i ? `extra-${i}` : 'sample',
      title: i ? `Extra API ${i}` : 'Sample HTTP API',
    })),
    credentials: [
      {
        id: crypto.randomUUID(),
        status: 'revoked',
        createdAt: '2026-01-02T12:00:00Z',
      },
    ],
  };
}
async function fits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
async function preselected(page: Page) {
  await expect(page).toHaveURL(/\/dashboard\/apps\/new\?api=sample$/);
  await expect(page.getByLabel('App name')).toBeFocused();
  await expect(
    page.getByRole('checkbox', {
      name: /Sample HTTP API v1\.0\.0 http:\/\/localhost:\d+\/sample$/,
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    page.getByRole('link', { name: 'My apps', exact: true }).last(),
  ).toBeVisible();
}

test('019 AC1: visitor, developer and admin navigation, current page and My apps naming', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const nav = page.getByRole('navigation', {
    name: 'Main navigation',
    exact: true,
  });
  for (const role of ['visitor', 'developer', 'admin']) {
    if (role === 'developer') await register(context);
    if (role === 'admin') {
      await context.clearCookies();
      expect(
        (
          await context.request.post('/api/auth/sign-in/email', {
            data: { email: 'admin@example.com', password: 'change-me-now' },
          })
        ).status(),
      ).toBe(200);
    }
    for (const path of [
      '/',
      '/apis/sample',
      ...(role !== 'visitor' ? ['/dashboard', '/dashboard/apps/new'] : []),
      ...(role === 'admin' ? ['/admin/apis'] : []),
    ]) {
      await page.goto(path);
      await expect(nav.getByRole('link')).toHaveText(
        role === 'visitor'
          ? ['APIs', 'Sign in', 'Sign up']
          : role === 'developer'
            ? ['APIs', 'My apps']
            : ['APIs', 'My apps', 'Admin'],
      );
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(nav.locator('[aria-current="page"]')).toHaveText(
        path.startsWith('/dashboard')
          ? 'My apps'
          : path.startsWith('/admin')
            ? 'Admin'
            : 'APIs',
      );
      await expect(page.getByRole('banner')).not.toContainText('Dashboard');
      if (path === '/dashboard') {
        await expect(
          page.getByRole('heading', { name: 'My apps', exact: true }),
        ).toBeVisible();
        await expect(page).toHaveTitle('My apps · Developer Portal');
      }
      if (path.startsWith('/dashboard'))
        await expect(page.locator('main')).not.toContainText('Your apps');
    }
  }
});

test('019 AC2: keyboard menu traps focus and returns it after Close and Escape', async ({
  page,
  context,
}) => {
  await register(context);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Open menu', exact: true });
  const close = page.getByRole('button', { name: 'Close menu', exact: true });
  for (const method of ['close', 'escape']) {
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('dialog').locator('summary')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    if (method === 'close') await close.click();
    else await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  }
  await trigger.press('Enter');
  await page
    .getByRole('dialog')
    .getByRole('link', { name: 'My apps', exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const path of [
  'new-account',
  'no-access',
  'existing-account',
  'sign-in-instead',
  'round-trip',
  'direct',
]) {
  test(`019 AC3: auth continuation ${path}`, async ({ page, context }) => {
    let email = '';
    if (
      ['no-access', 'existing-account', 'sign-in-instead', 'direct'].includes(
        path,
      )
    ) {
      email = await register(context);
      if (path !== 'no-access') await context.clearCookies();
    }
    if (path === 'direct') await page.goto('/dashboard/apps/new?api=sample');
    else {
      await page.goto('/apis/sample');
      await expect(page.locator('main .alert')).toContainText(noAccess);
      await page
        .getByRole('link', { name: 'Get an API key', exact: true })
        .click();
    }
    if (path === 'no-access') return preselected(page);
    if (['existing-account', 'round-trip'].includes(path)) {
      await page
        .locator('main')
        .getByRole('link', { name: 'Sign in', exact: true })
        .click();
    }
    if (path === 'sign-in-instead') {
      await page.getByLabel('Name', { exact: true }).fill('Duplicate');
      await page.getByLabel('Email', { exact: true }).fill(email);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page
        .getByRole('button', { name: 'Create account', exact: true })
        .click();
      await page
        .getByRole('link', { name: 'Sign in instead', exact: true })
        .click();
    }
    if (path === 'round-trip')
      await page
        .locator('main')
        .getByRole('link', { name: 'Create an account', exact: true })
        .click();
    const signingIn = [
      'existing-account',
      'sign-in-instead',
      'direct',
    ].includes(path);
    if (!signingIn)
      await page.getByLabel('Name', { exact: true }).fill('Journey QA');
    await page
      .getByLabel('Email', { exact: true })
      .fill(email || `journey-${crypto.randomUUID()}@example.com`);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page
      .getByRole('button', {
        name: signingIn ? 'Sign in' : 'Create account',
        exact: true,
      })
      .click();
    if (signingIn && path !== 'direct') {
      await expect(page).toHaveURL(/\/apis\/sample(?:#.*)?$/);
      await expect(
        page.getByRole('link', { name: 'Get an API key', exact: true }),
      ).toHaveAttribute('href', '/dashboard/apps/new?api=sample');
    } else await preselected(page);
  });
}

test('019 AC4,7,8: revoked-key access, long names, several apps and unfiltered highlights', async ({
  page,
  context,
}) => {
  await register(context);
  const items = [
    app('00000000-0000-4000-8000-000000000001', 'N'.repeat(80), true, 10),
    app('00000000-0000-4000-8000-000000000002', 'Second'),
    app('00000000-0000-4000-8000-000000000003', 'Other', false),
  ];
  await mockApps(page, [items[0]]);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/apis/sample');
  await expect(
    page.getByRole('link', { name: `Open in ${items[0]!.name}`, exact: true }),
  ).toHaveAttribute('href', `/dashboard/apps/${items[0]!.id}`);
  await expect(page.locator('main')).not.toContainText('Get an API key');
  await expect(page.locator('main .alert')).toContainText(
    `If you get a 403, select Open in ${items[0]!.name} and use one of its active keys.`,
  );
  await fits(page);
  await page.unroute('**/api/v1/apps');
  await mockApps(page, items);
  await page.goto('/apis/sample');
  await expect(page.locator('main .alert')).toContainText(
    'If you get a 403, select View your apps and use a key from an app with access.',
  );
  await page.getByRole('link', { name: 'View your apps', exact: true }).click();
  for (const width of [1280, 640, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await fits(page);
    const container =
      width === 1280 ? page.locator('.apps-table') : page.locator('.app-cards');
    await expect(container).toBeVisible();
    await expect(container.locator('.app-access-label')).toHaveCount(2);
    await expect(container.locator('.app-access-label').first()).toHaveText(
      '● Has access to Sample HTTP API',
    );
    if (width === 1280) {
      await expect(container.getByRole('columnheader')).toHaveText([
        'Name',
        'APIs',
        'Active keys',
        'Created',
      ]);
      await expect(container.locator('tbody tr td:first-child > a')).toHaveText(
        items.map((i) => i.name),
      );
    } else {
      await expect(container.getByRole('heading')).toHaveText(
        items.map((i) => i.name),
      );
      await expect(
        container.getByRole('link', { name: /^Open app/ }),
      ).toHaveCount(3);
      await expect(container.locator('li').first()).toContainText(
        'Extra API 9',
      );
      await expect(container.locator('li').first()).toContainText(
        'Active keys',
      );
      await expect(container.locator('li').first()).toContainText('Created');
      await expect(
        container.locator('li').first().locator('dd').nth(1),
      ).toHaveText('None');
      await expect(
        container.locator('li').first().locator('time'),
      ).toHaveAttribute('datetime', items[0]!.createdAt);
      await expect(container.getByRole('link').first()).toHaveAttribute(
        'href',
        `/dashboard/apps/${items[0]!.id}`,
      );
    }
  }
  await expect(page.getByRole('combobox')).toHaveCount(0);
  for (const url of ['/dashboard', '/dashboard?api=unknown']) {
    await page.goto(url);
    await expect(page.locator('.app-cards li')).toHaveCount(3);
    await expect(page.locator('.app-access-label')).toHaveCount(0);
    await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  }
  await page.route(`**/api/v1/apps/${items[0]!.id}`, (route) =>
    route.fulfill({ json: items[0] }),
  );
  await page.locator('.app-cards').getByRole('link').first().click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/apps/${items[0]!.id}$`));
  await expect(
    page.getByRole('heading', { name: items[0]!.name, exact: true }),
  ).toBeVisible();
});

test('019 AC5,7: delayed check keeps title, base URL and real reference available', async ({
  page,
  context,
}) => {
  await register(context);
  await page.clock.install();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route('**/api/v1/apps', async (route) => {
    await gate;
    await route.fulfill({ json: { items: [] } });
  });
  try {
    await page.goto('/apis/sample');
    await expect(
      page
        .getByRole('heading', { name: 'Sample HTTP API', exact: true })
        .first(),
    ).toBeVisible();
    await expect(
      page
        .getByText(
          `${process.env.KONG_PROXY_PUBLIC_URL ?? 'http://localhost:8000'}/sample`,
          { exact: true },
        )
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Test Request/ }).first(),
    ).toBeVisible();
    await page.clock.runFor(5000);
    await expect(page.locator('.access-action')).toHaveCount(0);
    await expect(
      page.getByText("Access status couldn't be confirmed", { exact: false }),
    ).toHaveCount(0);
    await expect(page.locator('main .alert')).toContainText(unknownAccess);
    release();
    await expect(page.locator('.access-action')).toHaveText('Get an API key');
    await expect(page.locator('main .alert')).toContainText(noAccess);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

for (const failure of [401, 403, 500, 503, 'network', 'timeout'] as const) {
  test(`019 AC5,6,7: access ${failure}, retry keeps real Scalar input and focus`, async ({
    page,
    context,
  }) => {
    await register(context);
    if (failure === 'timeout') await page.clock.install();
    let mode: 'fail' | 'success' | 'expired' = 'fail';
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    await page.route('**/api/v1/apps', async (route) => {
      if (mode === 'success') return route.fulfill({ json: { items: [] } });
      if (mode === 'expired') return route.fulfill({ status: 401, json: {} });
      if (failure === 'network') return route.abort();
      if (failure === 'timeout') {
        await gate;
        return route.fulfill({ json: { items: [] } }).catch(() => {});
      }
      return route.fulfill({
        status: failure,
        json: { status: failure, detail: 'PRIVATE DIAGNOSTIC' },
      });
    });
    try {
      await page.goto('/apis/sample');
      if (failure === 'timeout') await page.clock.runFor(10001);
      if (failure === 401) {
        await expect(page.locator('.access-action')).toHaveAttribute(
          'href',
          '/sign-up?next=%2Fdashboard%2Fapps%2Fnew%3Fapi%3Dsample',
        );
        await expect(
          page.getByText("Access status couldn't be confirmed", {
            exact: false,
          }),
        ).toHaveCount(0);
        await expect(page.locator('main .alert')).toContainText(noAccess);
        return;
      }
      const message = page.getByText("Access status couldn't be confirmed", {
        exact: false,
      });
      await expect(message).toBeVisible();
      await expect(page.locator('.access-action')).toHaveCount(0);
      await expect(page.locator('main')).not.toContainText(
        'PRIVATE DIAGNOSTIC',
      );
      await expect(page.locator('main .alert').last()).toContainText(
        unknownAccess,
      );
      await expect(
        page
          .getByRole('heading', { name: 'Sample HTTP API', exact: true })
          .first(),
      ).toBeVisible();
      await expect(
        page
          .getByText(
            `${process.env.KONG_PROXY_PUBLIC_URL ?? 'http://localhost:8000'}/sample`,
            { exact: true },
          )
          .first(),
      ).toBeVisible();
      // The sample's global security form has an unnamed region; its Value field is unique.
      const value = page.getByRole('textbox', { name: 'Value', exact: true });
      await value.fill('qa-preserved-value');
      const marker = await page.evaluate(() => {
        const key = crypto.randomUUID();
        (window as unknown as Record<string, string>).__qaMarker = key;
        return key;
      });
      if (failure === 'timeout') {
        release();
        await expect(message).toBeVisible();
        await expect(page.locator('.access-action')).toHaveCount(0);
      } else {
        await page
          .getByRole('button', { name: 'Try again', exact: true })
          .click();
        await expect(
          page.getByRole('button', { name: 'Try again', exact: true }),
        ).toHaveAttribute('aria-busy', 'false');
        await expect(message).toBeVisible();
      }
      mode = 'success';
      await page
        .getByRole('button', { name: 'Try again', exact: true })
        .click();
      await expect(page.locator('.access-action')).toBeFocused();
      await expect(value).toHaveValue('qa-preserved-value');
      await expect(message).toHaveCount(0);
      expect(
        await page.evaluate(
          () => (window as unknown as Record<string, string>).__qaMarker,
        ),
      ).toBe(marker);
      await expect(page).toHaveURL(/\/apis\/sample(?:#.*)?$/);
      await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });
}

test('019 AC6: retry 401 focuses signed-out action without a redirect', async ({
  page,
  context,
}) => {
  await register(context);
  let status = 500;
  await page.route('**/api/v1/apps', (route) =>
    route.fulfill({ status, json: {} }),
  );
  await page.goto('/apis/sample');
  await expect(
    page.getByText("Access status couldn't be confirmed", { exact: false }),
  ).toBeVisible();
  status = 401;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.access-action')).toBeFocused();
  await expect(page.locator('.access-action')).toHaveText('Get an API key');
  await expect(page).toHaveURL(/\/apis\/sample(?:#.*)?$/);
});

test('019 AC1,4,9: real app links work with and without active keys', async ({
  page,
  context,
  playwright,
  baseURL,
}) => {
  test.setTimeout(60000);
  // Seed our own catalog entries so this test also works on a fresh quickstart.
  const admin = await playwright.request.newContext({ baseURL });
  try {
    expect(
      (
        await admin.post('/api/auth/sign-in/email', {
          data: {
            email: 'admin@example.com',
            password: 'change-me-now',
          },
        })
      ).status(),
    ).toBe(200);
    for (let i = 0; i < 2; i++) {
      const id = crypto.randomUUID();
      expect(
        (
          await admin.put(
            `${process.env.KONG_ADMIN_URL ?? 'http://localhost:8001'}/services/${id}`,
            {
              data: { name: `journey-${id}`, url: 'http://httpbin:8080' },
            },
          )
        ).ok(),
      ).toBe(true);
      expect(
        (
          await admin.post(
            `${process.env.KONG_ADMIN_URL ?? 'http://localhost:8001'}/services/${id}/routes`,
            {
              data: { paths: [`/journey-${id}`] },
            },
          )
        ).ok(),
      ).toBe(true);
      const imported = await admin.post('/api/v1/admin/apis', {
        data: {
          slug: `journey-${id}`,
          gatewayServiceId: id,
          spec: {
            content: JSON.stringify({
              openapi: '3.1.0',
              info: { title: `Journey ${id}`, version: '1' },
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
    }
  } finally {
    await admin.dispose();
  }
  await register(context);
  const apis = (
    await (await context.request.get('/api/v1/apis')).json()
  ).items.slice(0, 3);
  expect(apis).toHaveLength(3);
  const created = await context.request.post('/api/v1/apps', {
    data: {
      name: 'API links QA',
      apiIds: apis.map((a: { id: string }) => a.id),
    },
  });
  expect(created.status()).toBe(201);
  const { app, credential } = await created.json();
  for (const active of [true, false]) {
    if (!active)
      expect(
        (
          await context.request.delete(
            `/api/v1/apps/${app.id}/credentials/${credential.id}`,
          )
        ).status(),
      ).toBe(204);
    await page.goto(`/dashboard/apps/${app.id}`);
    await expect(
      page
        .getByRole('navigation', { name: 'Main navigation' })
        .locator('[aria-current="page"]'),
    ).toHaveText('My apps');
    await expect(page.locator('main')).not.toContainText('Your apps');
    await expect(
      page.locator('main').getByRole('link', { name: 'My apps', exact: true }),
    ).toBeVisible();
    const links = page.getByRole('link', { name: /^Try this API/ });
    await expect(links).toHaveCount(3);
    for (const api of apis) {
      const link = page.locator(`#subscriptions a[href="/apis/${api.slug}"]`);
      await expect(link).toHaveAccessibleName(/^Try this API/);
      await expect(link).toContainText(api.title);
    }
    await expect(
      page.getByRole('heading', { name: 'Try your key', exact: true }),
    ).toHaveCount(active ? 1 : 0);
    await page
      .locator(`#subscriptions a[href="/apis/${apis[0].slug}"]`)
      .click();
    await expect(page).toHaveURL(new RegExp(`/apis/${apis[0].slug}(?:#.*)?$`));
    await page
      .getByRole('link', { name: 'Open in API links QA', exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/apps/${app.id}$`));
  }
});
