// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./release-tags.mjs', import.meta.url));
test('extracts exact release and prerelease versions', () => {
  assert.equal(execFileSync(process.execPath, [script, 'refs/tags/v1.2.3'], { encoding: 'utf8' }), '1.2.3\n');
  assert.equal(execFileSync(process.execPath, [script, 'refs/tags/v1.2.3-rc.4'], { encoding: 'utf8' }), '1.2.3-rc.4\n');
});
test('rejects branches, latest and incomplete versions', () => {
  for (const ref of ['refs/heads/main', 'refs/tags/latest', 'refs/tags/v1.2'])
    assert.notEqual(spawnSync(process.execPath, [script, ref]).status, 0);
});
