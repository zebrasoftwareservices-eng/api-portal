// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const started = performance.now();
const result = spawnSync(
  'docker',
  [
    'compose',
    '-f',
    'deploy/docker-compose.yml',
    'up',
    '--build',
    '-d',
    '--wait',
  ],
  { stdio: 'inherit', timeout: 300_000 },
);
assert.ifError(result.error);
assert.equal(result.status, 0, 'Compose starts successfully');
const remaining = 300_000 - (performance.now() - started);
assert.ok(remaining > 0, 'Compose starts within five minutes');
const response = await fetch('http://localhost:3000', {
  signal: AbortSignal.timeout(Math.ceil(remaining)),
});
assert.equal(response.status, 200, 'Portal home page responds');
assert.ok(
  (await response.text()).includes('Sample HTTP API'),
  'Seeded catalog is rendered',
);
const elapsed = ((performance.now() - started) / 1000).toFixed(1);
const summary = `Quickstart: ${elapsed}s (Compose build/start and seeded home page)\n`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
assert.ok(Number(elapsed) < 300, 'Loaded home page within five minutes');
