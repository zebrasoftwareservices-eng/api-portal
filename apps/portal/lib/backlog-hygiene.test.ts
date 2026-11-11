// @vitest-environment node
// SPDX-License-Identifier: Apache-2.0
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
it('JSO-229 runs server image smoke in CI and documents demo testing without duplicate config', () => {
  expect(read('.github/workflows/ci.yml')).toContain(
    'node deploy/server-image-smoke.mjs',
  );
  expect(read('AGENTS.md')).toContain('pnpm test:e2e:demo');
  expect(
    existsSync(
      fileURLToPath(
        new URL('apps/portal/playwright.reference.config.ts', root),
      ),
    ),
  ).toBe(false);
});
it('JSO-230 regenerates Next types and ignores generated development files', () => {
  const pkg = JSON.parse(read('apps/portal/package.json'));
  expect(pkg.scripts.typecheck).toBe('next typegen && tsc --noEmit');
  expect(read('apps/portal/.gitignore')).toContain('next-env.d.ts');
  expect(read('apps/portal/.gitignore')).toContain('AGENTS.md');
});
