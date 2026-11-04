// SPDX-License-Identifier: Apache-2.0
// Run after docker compose up: node deploy/smoke.mjs
import assert from 'node:assert/strict';
const server = process.env.SMOKE_SERVER_URL ?? 'http://localhost:4000';
const kong = process.env.SMOKE_GATEWAY_URL ?? 'http://localhost:8000';
const call = async (path, options = {}) => fetch(server + path, options);
assert.equal((await call('/api/v1/health')).status, 200);
const catalog = await (await call('/api/v1/apis')).json();
const sample = catalog.items.find((api) => api.slug === 'sample');
assert.ok(sample, 'Sample API is seeded');
const suffix = crypto.randomUUID();
const signup = await call('/api/auth/sign-up/email', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: `smoke-${suffix}@example.com`,
    password: `Smoke-${suffix}`,
    name: 'Smoke Developer',
  }),
});
assert.equal(signup.status, 200, 'Developer signs up');
const cookie = signup.headers
  .getSetCookie()
  .map((v) => v.split(';')[0])
  .join('; ');
const headers = { cookie, 'content-type': 'application/json' };
const created = await call('/api/v1/apps', {
  method: 'POST',
  headers,
  body: JSON.stringify({ name: `Smoke ${suffix}`, apiIds: [sample.id] }),
});
assert.equal(created.status, 201, 'App creation succeeds');
const { app, credential } = await created.json();
assert.match(credential.key, /^pk_[A-Za-z0-9_-]{43}$/);
assert.equal(
  (await fetch(kong + '/sample/get')).status,
  401,
  'No key is rejected',
);
assert.equal(
  (await fetch(kong + '/sample/get', { headers: { apikey: credential.key } }))
    .status,
  200,
  'Key works through real Kong',
);
const proxied = await call(
  '/api/v1/try-it?scalar_url=' +
    encodeURIComponent(sample.gatewayBaseUrl + '/get'),
  { headers: { apikey: credential.key } },
);
assert.equal(proxied.status, 200, 'Try-it reaches real Kong');
const detail = await call('/api/v1/apps/' + app.id, { headers });
assert.equal(
  (await detail.text()).includes(credential.key),
  false,
  'Key is not shown again',
);
const revoke = () =>
  call(`/api/v1/apps/${app.id}/credentials/${credential.id}`, {
    method: 'DELETE',
    headers: { cookie },
  });
assert.equal((await revoke()).status, 204);
assert.equal((await revoke()).status, 204, 'Revocation is idempotent');
assert.equal(
  (await fetch(kong + '/sample/get', { headers: { apikey: credential.key } }))
    .status,
  401,
  'Revoked key is rejected',
);
console.log(
  'PASS: seed, signup, app/key creation, real Kong auth, try-it, one-time key and revocation',
);
