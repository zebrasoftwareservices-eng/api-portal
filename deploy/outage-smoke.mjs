// SPDX-License-Identifier: Apache-2.0
// Tests AC 8 against this run's local Compose gateway; always restarts Kong.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const server = process.env.SMOKE_SERVER_URL ?? 'http://localhost:4000';
const admin = process.env.SMOKE_ADMIN_URL ?? 'http://localhost:8001';
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
