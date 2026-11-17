// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Exercise the returning-visitor regression in both the demo and live suites.
import '../../apps/portal/e2e/reference-snippets.test';

// Resolve the portal's parser without adding a second dependency or seed copy.
const { parse } = createRequire(
  resolve(process.cwd(), 'apps/portal/package.json'),
)('yaml');
const seed = parse(
  readFileSync(
    resolve(process.cwd(), 'apps/server/seed/sample-api.openapi.yaml'),
    'utf8',
  ),
);
const command = 'docker compose -f deploy/docker-compose.yml up --build';
const quickstart =
  'https://github.com/zebrasoftwareservices-eng/api-portal#quickstart';
const gates = [
  '/sign-in',
  '/sign-up',
  '/dashboard',
  '/dashboard/apps/new',
  '/admin/apis',
  '/dashboard/apps/unknown',
  '/admin/unknown',
];

for (const width of [1280, 375]) {
  test.describe(`${width}px demo`, () => {
    test.use({ viewport: { width, height: 800 } });

    for (const path of [
      '/',
      '/apis/sample',
      '/apis/nope',
      '/quickstart-required',
      ...gates,
    ]) {
      test(`notice and safe navigation on ${path}`, async ({ page }) => {
        const response = await page.goto(path);
        if (gates.includes(path)) {
          expect(response?.status()).toBe(200);
          await expect(
            page.getByRole('heading', {
              name: 'This feature needs the quickstart',
              exact: true,
            }),
          ).toBeVisible();
          await expect(page.locator('main')).toContainText(command);
          await expect(
            page
              .locator('main')
              .getByRole('link', { name: 'Quickstart instructions on GitHub' }),
          ).toHaveAttribute('href', quickstart);
          await expect(page.locator('form')).toHaveCount(0);
        }
        const notice = page.getByRole('region', { name: 'Demo notice' });
        await expect(notice).toBeVisible();
        await expect(notice).toContainText('This is a demo');
        await expect(notice).toContainText(
          'Sign-up, API keys, try-it and admin need the quickstart.',
        );
        await expect(notice).toContainText(command);
        await expect(notice.getByRole('link')).toHaveAttribute(
          'href',
          quickstart,
        );
        await expect(
          page.getByRole('link', { name: /^Sign (in|up)$/i }),
        ).toHaveCount(0);
        await expect(
          page.getByRole('button', { name: 'Get an API key' }),
        ).toHaveCount(0);
        await expect(
          page.getByRole('link', { name: 'Get an API key' }),
        ).toHaveCount(0);
        if (width === 375)
          await page
            .getByRole('button', { name: 'Open menu', exact: true })
            .click();
        const nav = page.getByRole('navigation', {
          name: width === 375 ? 'Mobile navigation' : 'Main navigation',
          exact: true,
        });
        await expect(
          nav.getByRole('link', { name: 'Run the quickstart' }),
        ).toHaveAttribute('href', quickstart);
        if (width === 375)
          await page
            .getByRole('button', { name: 'Close menu', exact: true })
            .click();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
      });
    }

    test('catalog and reference use the original seed without live requests or errors', async ({
      page,
    }) => {
      const forbidden: string[] = [];
      const errors: string[] = [];
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (
          url.pathname.startsWith('/api/') ||
          url.hostname === 'localhost' ||
          url.hostname.endsWith('scalar.com')
        )
          forbidden.push(request.url());
      });
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/');
      const card = page.getByRole('link', {
        name: new RegExp(seed.info.title),
      });
      await expect(card).toHaveAttribute('href', '/apis/sample');
      await expect(card).toContainText(`v${seed.info.version}`);
      await expect(card).toContainText(seed.info.description);
      await expect(page.getByText('Loading…', { exact: true })).toHaveCount(0);
      await expect(page.getByText('How it works', { exact: true })).toHaveCount(
        0,
      );
      await card.click();
      await expect(
        page
          .getByRole('heading', { name: seed.info.title, exact: true })
          .first(),
      ).toBeVisible();
      for (const [path, methods] of Object.entries(seed.paths)) {
        for (const [method, operation] of Object.entries(
          methods as Record<string, { summary: string }>,
        )) {
          await expect(
            page.getByText(path, { exact: true }).first(),
          ).toBeVisible();
          await expect(
            page.getByRole('heading', { name: operation.summary, exact: true }),
          ).toBeVisible();
          await expect(page.locator('.scalar-api-reference')).toContainText(
            method.toUpperCase(),
          );
        }
      }
      await expect(page.locator('.scalar-api-reference')).toContainText(
        seed.info.version,
      );
      await expect(
        page.getByText('Base URL in a local quickstart', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(seed.servers[0].url, { exact: true }).first(),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /Test Request|^Send(?: |$)/i }),
      ).toHaveCount(0);
      await expect(page.locator('input:visible, textarea:visible')).toHaveCount(
        0,
      );
      await expect(page.locator('a[href*="client.scalar.com"]')).toHaveCount(0);
      await expect(page.getByText(/paste.*key|create an account/i)).toHaveCount(
        0,
      );
      await page.waitForLoadState('networkidle');
      // A persisted client choice must remain server-free on the next visit.
      await page
        .getByRole('tab', { name: 'Node.js', exact: true })
        .first()
        .click();
      await expect
        .poll(() =>
          page.evaluate(() =>
            localStorage.getItem('scalar-reference-selected-client-v2'),
          ),
        )
        .toBe('node/undici');
      await page.reload();
      await expect(
        page.getByRole('group', {
          name: 'Request Example for post/post',
          exact: true,
        }),
      ).toContainText('JSON.stringify({})');
      await page.waitForLoadState('networkidle');
      expect(forbidden).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}

test('JSO-217 JSO-223: unknown API has the portal not-found content and default title', async ({
  page,
}) => {
  await page.goto('/apis/nope');
  await expect(
    page.getByRole('heading', { name: 'API not found', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Go to APIs', exact: true }),
  ).toHaveAttribute('href', '/');
  await expect(page).toHaveTitle('Developer Portal');
});

test('demo API endpoints return 404 even for stale sessions and mutation requests', async ({
  request,
}) => {
  for (const path of [
    '/api/v1/health',
    '/api/v1/try-it?scalar_url=http%3A%2F%2Flocalhost%3A8000%2Fsample%2Fget',
    '/api/v1/me',
  ]) {
    expect(
      (
        await request.get(path, {
          headers: { cookie: 'better-auth.session_token=expired' },
        })
      ).status(),
    ).toBe(404);
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const path of [
      '/api/v1/apps',
      '/api/auth/sign-in/email',
      '/api/auth/sign-up/email',
      '/api/v1/try-it',
    ]) {
      expect(
        (
          await request.post(path, {
            headers: { cookie: 'better-auth.session_token=expired' },
            data: { name: '', apiIds: ['invalid'] },
          })
        ).status(),
      ).toBe(404);
    }
  }
});

test('013 AC 10: demo renders the shipped theme with no control plane', async ({
  page,
}) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole('heading', { name: 'APIs', exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.locator('header a.brand')).toHaveText('Developer Portal');
  await expect(page.locator('img.brand-logo')).toHaveCount(0);
  await expect(page.locator('link[href*="custom.css"]')).toHaveCount(0);
  // SERVER_URL is unset, so /api is proxied at localhost:4000 and the proxy returns 502.
  expect((await page.request.get('/api/v1/theme')).status()).toBe(502);
});

test('019 AC10: demo catalog and API never check app access', async ({
  page,
}) => {
  const appRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v1/apps')
      appRequests.push(request.url());
  });
  for (const path of ['/', '/apis/sample']) {
    await page.goto(path);
    await expect(
      page
        .getByRole('navigation', { name: 'Main navigation', exact: true })
        .getByRole('link'),
    ).toHaveText(['APIs', 'Run the quickstart']);
    await expect(
      page.getByRole('link', {
        name: /My apps|Get an API key|Open in |View your apps/,
      }),
    ).toHaveCount(0);
    await expect(page.locator('.access-action')).toHaveCount(0);
    if (path !== '/')
      await expect(page.locator('.scalar-api-reference')).toBeVisible();
  }
  expect(appRequests).toEqual([]);
});
