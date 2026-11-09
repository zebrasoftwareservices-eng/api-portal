// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
// Node 25+ exposes a localStorage that is not jsdom's. The portal tests assert on jsdom storage.
const execArgv =
  Number(process.versions.node.split('.')[0]) >= 25
    ? ['--no-experimental-webstorage']
    : [];
export default defineConfig({
  resolve: {
    alias: {
      'server-only': fileURLToPath(
        new URL(
          './node_modules/next/dist/compiled/server-only/empty.js',
          import.meta.url,
        ),
      ),
      '@portal/sdk': fileURLToPath(
        new URL('../../packages/sdk/src/index.ts', import.meta.url),
      ),
    },
  },
  esbuild: { jsx: 'automatic' },
  test: {
    poolOptions: {
      threads: { execArgv },
      forks: { execArgv },
    },
    testTimeout: 15000,
    name: 'portal',
    environment: 'jsdom',
    setupFiles: ['./test-setup.ts'],
    include: ['components/**/*.test.tsx', 'lib/**/*.test.ts'],
  },
});
