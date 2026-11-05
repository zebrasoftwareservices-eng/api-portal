// SPDX-License-Identifier: Apache-2.0
// Verify the packaged runtime independently of the source checkout.
// Run after Compose builds: node deploy/server-image-smoke.mjs [image]
import { execFileSync } from 'node:child_process';
import process from 'node:process';

execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '--network',
    'none',
    '--workdir',
    '/app/apps/server',
    '--entrypoint',
    'node',
    process.argv[2] ?? 'portal-server',
    '--input-type=module',
    '-e',
    `
import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { parse } from 'yaml';
import { migrate } from '@portal/db';
import { KongAdapter } from '@portal/adapter-kong';

assert.equal(process.getuid(), 1000, 'Runtime uses the unprivileged node user');
assert.equal(typeof migrate, 'function', 'Database package resolves');
assert.equal(typeof KongAdapter, 'function', 'Gateway package resolves');
await access('dist/main.js');
const seed = parse(await readFile('seed/sample-api.openapi.yaml', 'utf8'));
assert.equal(seed.info.title, 'Sample HTTP API', 'Original seed is packaged');
const require = createRequire(import.meta.url);
const dbDirectory = dirname(require.resolve('@portal/db'));
const journal = JSON.parse(await readFile(resolve(dbDirectory, '../migrations/meta/_journal.json'), 'utf8'));
assert.ok(journal.entries.length > 0, 'Migration journal is packaged');
for (const entry of journal.entries) {
  await access(resolve(dbDirectory, '../migrations', entry.tag + '.sql'));
}
const packages = await readdir('/app/node_modules/.pnpm');
for (const prefix of ['@scalar+api-reference-react@', 'testcontainers@', '@testcontainers+', '@better-auth+cli@']) {
  assert.ok(!packages.some(name => name.startsWith(prefix)), 'Unrelated/dev dependency excluded: ' + prefix);
}
console.log('PASS: unprivileged production runtime, workspace imports, seed and all migrations; no Scalar UI/Testcontainers/auth CLI dependencies');
`,
  ],
  { stdio: 'inherit' },
);
