// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const password = 'QA-password-123';
async function account(request: import('@playwright/test').APIRequestContext) {
  const email = `backlog-${crypto.randomUUID()}@example.com`;
  expect(
    (
      await request.post('/api/auth/sign-up/email', {
        data: { name: 'Backlog QA', email, password },
      })
    ).status(),
  ).toBe(200);
  return email;
}

test('JSO-179 wrong password clears and focuses password', async ({
  page,
  context,
}) => {
  const email = await account(context.request);
  await context.clearCookies();
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
});

test('JSO-163 JSO-181 JSO-214 account dropdown and mobile app labels', async ({
  page,
  context,
}) => {
  const email = await account(context.request);
  const apis = (await (await context.request.get('/api/v1/apis')).json()).items;
  expect(
    (
      await context.request.post('/api/v1/apps', {
        data: { name: 'Labels QA', apiIds: [apis[0].id] },
      })
    ).status(),
  ).toBe(201);
  await page.goto('/dashboard');
  await expect(
    page.getByRole('navigation', { name: 'Breadcrumb', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('header summary')).toHaveCount(0);
  await page
    .getByRole('button', { name: `Account menu for ${email}`, exact: true })
    .click();
  await expect(page.getByRole('menu')).toContainText(email);
  await expect(
    page.getByRole('menuitem', { name: 'Sign out', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.locator('.app-cards dt')).toHaveText([
    'APIs',
    'Active keys',
    'Created',
  ]);
});

for (const timezoneId of ['America/Los_Angeles', 'UTC']) {
  test.describe(`JSO-166 ${timezoneId}`, () => {
    test.use({ timezoneId });
    test('app header, keys and admin table use browser date', async ({
      page,
      context,
    }) => {
      await account(context.request);
      const id = crypto.randomUUID();
      const createdAt = '2026-11-03T05:24:00.000Z';
      await page.route(`**/api/v1/apps/${id}`, (route) =>
        route.fulfill({
          json: {
            id,
            name: 'Date QA',
            createdAt,
            subscriptions: [],
            credentials: [
              { id: crypto.randomUUID(), status: 'active', createdAt },
            ],
          },
        }),
      );
      await page.goto(`/dashboard/apps/${id}`);
      const date = timezoneId === 'UTC' ? 'Nov 3, 2026' : 'Nov 2, 2026';
      await expect(page.locator('time')).toHaveText([date, date]);
      await context.clearCookies();
      expect(
        (
          await context.request.post('/api/auth/sign-in/email', {
            data: { email: 'admin@example.com', password: 'change-me-now' },
          })
        ).status(),
      ).toBe(200);
      await page.route('**/api/v1/apis', (route) =>
        route.fulfill({
          json: {
            items: [
              {
                id,
                slug: 'date-qa',
                title: 'Date QA',
                version: '1',
                publishedAt: createdAt,
                gatewayServiceId: crypto.randomUUID(),
                baseUrl: 'http://example.com',
              },
            ],
          },
        }),
      );
      await page.goto('/admin/apis');
      await expect(page.locator('time')).toHaveText([date]);
    });
  });
}

test('JSO-180 expired create-key session redirects with explanation', async ({
  page,
  context,
}) => {
  await account(context.request);
  const apis = (await (await context.request.get('/api/v1/apis')).json()).items;
  const result = await context.request.post('/api/v1/apps', {
    data: { name: 'Expired QA', apiIds: [apis[0].id] },
  });
  const { app } = await result.json();
  await page.goto(`/dashboard/apps/${app.id}`);
  await expect(
    page.getByRole('button', { name: 'Create key', exact: true }),
  ).toBeVisible();
  await context.clearCookies();
  await page.getByRole('button', { name: 'Create key', exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  await expect(
    page.getByText('Your session has ended. Sign in to continue.', {
      exact: true,
    }),
  ).toBeVisible();
});

for (const path of ['/', '/apis/sample', '/dashboard']) {
  test(`JSO-189 JSO-190 JSO-191 real server outage and recovery ${path}`, async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    await account(context.request);
    const compose = (...args: string[]) =>
      execFileSync('node', ['scripts/worktree-compose.mjs', ...args], {
        stdio: 'pipe',
      });
    try {
      compose('stop', 'server');
      await page.goto(path);
      await expect(
        page.getByRole('heading', {
          name: "We can't reach the portal server",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByRole('banner')).toBeVisible();
      await expect(
        page.getByRole('banner').getByText(/Sign in|Sign up/),
      ).toHaveCount(0);
      await expect(
        page.getByRole('banner').getByRole('button', { name: /@example.com/ }),
      ).toHaveCount(0);
      const marker = crypto.randomUUID();
      await page.evaluate((value) => {
        (window as unknown as Record<string, string>).__qaOutageMarker = value;
      }, marker);
      const navigations: string[] = [];
      let documentRequests = 0;
      page.on('request', (request) => {
        if (
          request.isNavigationRequest() &&
          request.frame() === page.mainFrame()
        )
          documentRequests++;
      });
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) navigations.push(frame.url());
      });
      compose('start', '--wait', 'server');
      await page
        .getByRole('button', { name: 'Try again', exact: true })
        .click();
      await expect(
        page
          .getByRole('heading', {
            name:
              path === '/'
                ? 'APIs'
                : path === '/dashboard'
                  ? 'My apps'
                  : 'Sample HTTP API',
            exact: true,
          })
          .first(),
      ).toBeVisible({ timeout: 5000 });
      // Next can update same-document history during refresh; a reload loses the marker
      // and performs a main-frame document request. Scalar can also set a hash.
      test.info().annotations.push({
        type: 'same-document navigations',
        description: JSON.stringify(navigations),
      });
      expect(documentRequests).toBe(0);
      expect(
        await page.evaluate(
          () => (window as unknown as Record<string, string>).__qaOutageMarker,
        ),
      ).toBe(marker);
    } finally {
      compose('start', '--wait', 'server');
    }
  });
}

test('JSO-192 JSO-182 JSO-161 JSO-215 key dialog fits, announces and restores focus', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await account(context.request);
  const apis = (await (await context.request.get('/api/v1/apis')).json()).items;
  const { app } = await (
    await context.request.post('/api/v1/apps', {
      data: { name: 'Dialog QA', apiIds: [apis[0].id] },
    })
  ).json();
  await page.goto(`/dashboard/apps/${app.id}`);
  await page.getByRole('button', { name: 'Create key', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  const saved = dialog.getByRole('button', {
    name: "I've saved it",
    exact: true,
  });
  await expect(saved).toBeInViewport({ ratio: 1 });
  await dialog
    .getByRole('button', { name: 'Copy header line', exact: true })
    .click();
  await expect(
    dialog
      .locator('[aria-live="polite"]')
      .filter({ hasText: 'Header line copied.' }),
  ).toBeVisible();
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('Denied'));
  });
  await dialog
    .getByRole('button', { name: 'Copy header line', exact: true })
    .click();
  await expect(
    dialog
      .locator('[aria-live="polite"]')
      .filter({ hasText: "Couldn't copy the header line." }),
  ).toBeVisible();
  await expect(
    dialog.getByText('Header line copied.', { exact: true }),
  ).toHaveCount(0);
  await saved.click();
  await expect(dialog).toBeHidden();
  await expect
    .soft(page.getByRole('heading', { name: 'Try your key', exact: true }))
    .toBeFocused();
  await page.keyboard.press('Tab');
  await expect
    .soft(page.getByRole('link', { name: /^Open .* reference$/ }).first())
    .toBeFocused();
  const revoke = page
    .getByRole('button', { name: 'Revoke', exact: true })
    .first();
  for (const method of ['cancel', 'escape']) {
    await revoke.click();
    if (method === 'cancel')
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Cancel', exact: true })
        .click();
    else await page.keyboard.press('Escape');
    await expect(revoke).toBeFocused();
  }
});

test('JSO-227 rejected sign-out shows recovery toast', async ({
  page,
  context,
}) => {
  const email = await account(context.request);
  await page.goto('/dashboard');
  await page.route('**/api/auth/sign-out', (route) =>
    route.fulfill({ status: 503, json: { message: 'Unavailable' } }),
  );
  await page
    .getByRole('button', { name: `Account menu for ${email}`, exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByText("We couldn't sign you out. Try again.", { exact: true }),
  ).toBeVisible();
});

test('JSO-223 JSO-183 not-found titles do not leak route titles or permissions', async ({
  page,
  context,
}) => {
  await account(context.request);
  for (const path of [
    '/quickstart-required',
    '/admin/apis',
    `/dashboard/apps/${crypto.randomUUID()}`,
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole('heading', { name: /not found/i }),
    ).toBeVisible();
    await expect.soft(page).toHaveTitle('Developer Portal');
  }
});

test('JSO-175 operation-only Authentication Value accepts a key that reaches a real request', async ({
  page,
  context,
  playwright,
  baseURL,
}) => {
  test.setTimeout(60000);
  const admin = await playwright.request.newContext({ baseURL });
  const id = crypto.randomUUID();
  const slug = `op-auth-${id}`;
  const kong = process.env.KONG_ADMIN_URL ?? 'http://localhost:8001';
  const proxy = process.env.KONG_PROXY_PUBLIC_URL ?? 'http://localhost:8000';
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
        await admin.put(`${kong}/services/${id}`, {
          data: { name: slug, url: 'http://httpbin:8080' },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await admin.post(`${kong}/services/${id}/routes`, {
          data: { paths: [`/${slug}`] },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await admin.post(`${kong}/services/${id}/plugins`, {
          data: { name: 'key-auth', config: { hide_credentials: false } },
        })
      ).ok(),
    ).toBe(true);
    const document = {
      openapi: '3.1.0',
      info: { title: 'Operation auth QA', version: '1' },
      components: {
        securitySchemes: {
          key: { type: 'apiKey', in: 'header', name: 'apikey' },
        },
      },
      paths: {
        '/get': {
          get: {
            summary: 'Operation auth request',
            security: [{ key: [] }],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };
    const imported = await admin.post('/api/v1/admin/apis', {
      data: {
        slug,
        gatewayServiceId: id,
        spec: { content: JSON.stringify(document) },
      },
    });
    expect(imported.status()).toBe(201);
    const api = await imported.json();
    await account(context.request);
    const created = await context.request.post('/api/v1/apps', {
      data: { name: 'Operation auth QA', apiIds: [api.id] },
    });
    expect(created.status()).toBe(201);
    const { credential } = await created.json();
    await expect
      .poll(
        async () =>
          (
            await context.request.get(`${proxy}/${slug}/get`, {
              headers: { apikey: credential.key },
            })
          ).status(),
        { timeout: 15000 },
      )
      .toBe(200);
    await page.goto(`/apis/${slug}`);
    await expect(page.locator('main .alert')).toContainText('Authentication');
    const value = page.getByRole('textbox', { name: 'Value', exact: true });
    await expect(value).toHaveValue('');
    await value.fill(credential.key);
    await page
      .getByRole('button', { name: /Test Request/ })
      .first()
      .click();
    const response = page.waitForResponse((r) =>
      r.url().includes('/api/v1/try-it?'),
    );
    await page
      .getByRole('button', {
        name: `Send get request to ${proxy}/${slug}/get`,
        exact: true,
      })
      .click();
    const sent = await response;
    expect(sent.request().headers()['apikey']).toBe(credential.key);
    expect(sent.status()).toBe(200);
  } finally {
    await admin.dispose();
  }
});
