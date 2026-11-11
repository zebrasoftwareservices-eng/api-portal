// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { layoutFromEnv } from '../scripts/worktree-ports.mjs';

// Owns only this worktree's disposable QA stack; leaves the seeded stack running.
test('AC9 fresh quickstart serves the sample catalog within five minutes', { timeout: 360000 }, async () => {
  const env = {
    ...process.env,
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_PASSWORD: 'change-me-now',
    KONG_ADMIN_URL: 'http://kong:8001',
    SEED_SAMPLE: 'true',
  };
  const compose = (...args: string[]) => execFileSync('node', ['scripts/worktree-compose.mjs', ...args], {
    env, stdio: 'inherit', timeout: 300000,
  });
  compose('down', '-v');
  const started = performance.now();
  compose('up', '-d', '--build', '--wait');
  const { portalUrl } = layoutFromEnv(process.cwd(), env);
  const response = await fetch(`${portalUrl}/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Sample HTTP API/);
  const catalog = await fetch(`${portalUrl}/api/v1/apis`);
  assert.equal(catalog.status, 200);
  assert.ok((await catalog.json()).items.some((api: { slug: string }) => api.slug === 'sample'));
  const elapsed = (performance.now() - started) / 1000;
  console.log(`Fresh seeded quickstart at ${portalUrl}: ${elapsed.toFixed(1)} seconds`);
  assert.ok(elapsed < 300, 'Fresh seeded catalog is ready within five minutes');
});
