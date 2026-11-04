// SPDX-License-Identifier: Apache-2.0
// Tests gateway recovery (spec 001 AC 8) and no demo fallback (spec 002 AC 10).
// Always restarts the Compose services stopped by each check.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
const server = process.env.SMOKE_SERVER_URL ?? 'http://localhost:4000';
const admin = process.env.SMOKE_ADMIN_URL ?? 'http://localhost:8001';
const portal = process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:3000';
const catalog = await (await fetch(server + '/api/v1/apis')).json();
const sample = catalog.items.find((api) => api.slug === 'sample');
assert.ok(sample);
const suffix = crypto.randomUUID();
const signup = await fetch(server + '/api/auth/sign-up/email', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: `outage-${suffix}@example.com`,
    password: `Test-${suffix}`,
    name: 'Outage Developer',
  }),
});
assert.equal(signup.status, 200);
const cookie = signup.headers
  .getSetCookie()
  .map((v) => v.split(';')[0])
  .join('; ');
const payload = { name: `Outage ${suffix}`, apiIds: [sample.id] };
const create = () =>
  fetch(server + '/api/v1/apps', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
const compose = (...args) =>
  execFileSync(
    'docker',
    ['compose', '-f', 'deploy/docker-compose.yml', ...args],
    { stdio: 'ignore' },
  );
try {
  compose('stop', 'kong');
  const failed = await create();
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('retry-after'), '5');
  assert.equal((await failed.json()).type, '/problems/gateway-unavailable');
  const apps = await (
    await fetch(server + '/api/v1/apps', { headers: { cookie } })
  ).json();
  assert.equal(apps.items.length, 0, 'No partial app remains');
} finally {
  compose('up', '-d', '--wait', 'kong');
}
const created = await create();
assert.equal(created.status, 201);
const { app, credential } = await created.json();
const consumerResponse = await fetch(admin + '/consumers/portal-app-' + app.id);
assert.equal(consumerResponse.status, 200);
const consumer = await consumerResponse.json();
assert.equal(consumer.custom_id, app.id);
assert.ok(consumer.tags.includes('portal-app-' + app.id));
const keys = await (
  await fetch(admin + '/consumers/portal-app-' + app.id + '/key-auth')
).json();
assert.equal(keys.data.length, 1, 'Retry produces one credential');
assert.ok(keys.data[0].tags.includes('portal-cred-' + credential.id));
console.log(
  'PASS: Kong outage returns 503 with no partial app; retry creates one tagged consumer and credential',
);

// Read the rendered page: Next may stream a 200 before its error boundary renders.
// A fresh browser also rules out a previously loaded catalog masking the outage.
const browser = await chromium.launch();
try {
  compose('stop', 'server');
  const page = await browser.newPage();
  await page.goto(portal, { waitUntil: 'networkidle' });
  await expect(
    page.getByRole('heading', { name: 'Something went wrong', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Try again', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Go to APIs', exact: true }),
  ).toBeVisible();
  await expect(page.locator('a[href="/apis/sample"]')).toHaveCount(0);
  await expect(page.getByText(sample.title, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Demo notice' })).toHaveCount(
    0,
  );
  await expect(page.getByText('This is a demo', { exact: false })).toHaveCount(
    0,
  );
} finally {
  try {
    compose('up', '-d', '--wait', 'server');
  } finally {
    await browser.close();
  }
}
console.log(
  'PASS: Server outage renders the portal error page without a sample catalog or demo notice',
);
