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
  expect(
    (
      await request.post('/api/v1/admin/tracing/selections', {
        data: { kind: 'api', targetId: sample.id },
      })
    ).status(),
  ).toBeLessThan(202);

  await page.goto('/admin/tracing');
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
  const latest = page
    .getByRole('heading', { name: 'Latest traced call' })
    .locator('..');
  await expect(
    latest.getByRole('table', { name: /Spans of the latest traced call/ }),
  ).toBeVisible({
    timeout: 30_000,
  });
  await expect(latest).toContainText('GET');
  await expect(latest).toContainText('/sample/get');
  await expect(latest).not.toContainText('abc123');
  await expect(latest).toContainText('Slowest');
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
