// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const started = performance.now();
// Synchronous Compose restarts block socket-close events in this process. Avoid
// retaining an HTTP connection across the fresh/environment container replacement.
const request = (url, options = {}) =>
  fetch(url, {
    ...options,
    headers: { ...options.headers, connection: 'close' },
  });
const fresh = {
  ...process.env,
  ADMIN_EMAIL: '',
  ADMIN_PASSWORD: '',
  KONG_ADMIN_URL: '',
  KONG_ADMIN_TOKEN: '',
  KONG_PROXY_INTERNAL_URL: 'http://kong:8000',
  KONG_PROXY_PUBLIC_URL: 'http://localhost:8000',
  SEED_SAMPLE: 'false',
};
function compose(args, env, timeout = 300_000) {
  const result = spawnSync(
    'docker',
    ['compose', '-f', 'deploy/docker-compose.yml', ...args],
    { stdio: 'inherit', timeout, env },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, `Compose ${args[0]} succeeds`);
}
compose(['up', '--build', '-d', '--wait'], fresh);
const remaining = 300_000 - (performance.now() - started);
assert.ok(remaining > 0, 'Compose starts within five minutes');
const response = await request('http://localhost:3000', {
  signal: AbortSignal.timeout(Math.ceil(remaining)),
});
assert.equal(response.status, 200, 'Setup page responds');
assert.equal(
  new URL(response.url).pathname,
  '/setup',
  'Every fresh portal page redirects to setup',
);
assert.equal(
  (await (await request('http://localhost:4000/api/v1/health')).json()).gateway,
  null,
);
assert.deepEqual(
  await (await request('http://localhost:4000/api/v1/setup')).json(),
  { adminRequired: true, setupTokenRequired: false },
);
assert.deepEqual(
  (await (await request('http://localhost:4000/api/v1/apis')).json()).items,
  [],
);
const signup = await request('http://localhost:4000/api/auth/sign-up/email', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: 'blocked@example.com',
    password: 'test-password-123',
    name: 'Blocked',
  }),
});
assert.equal(signup.status, 403, 'Sign-up cannot bypass first-admin setup');
for (const entity of ['services', 'routes', 'consumers', 'plugins']) {
  assert.deepEqual(
    (await (await request(`http://localhost:8001/${entity}`)).json()).data,
    [],
    `No ${entity} created in fresh Kong`,
  );
}
const elapsed = ((performance.now() - started) / 1000).toFixed(1);
const summary = `Quickstart: ${elapsed}s (fresh Compose build/start and setup page)\n`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
assert.ok(Number(elapsed) < 300, 'Reached setup within five minutes');

// The existing smoke, outage and browser suites exercise the declarative environment path.
// This script owns this test stack: start with a clean Compose project/volume.
compose(['down', '-v'], fresh);
compose(['up', '-d', '--wait'], {
  ...fresh,
  ADMIN_EMAIL: 'admin@example.com',
  ADMIN_PASSWORD: 'change-me-now',
  KONG_ADMIN_URL: 'http://kong:8001',
  SEED_SAMPLE: 'true',
});
const seeded = await (
  await request('http://localhost:4000/api/v1/apis')
).json();
assert.ok(
  seeded.items.some((api) => api.slug === 'sample'),
  'Environment path still seeds the sample',
);
