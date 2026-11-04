// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    alias: {
      '@portal/sdk': fileURLToPath(
        new URL('../../packages/sdk/src/index.ts', import.meta.url),
      ),
    },
  },
  esbuild: { jsx: 'automatic' },
  test: {
    testTimeout: 15000,
    name: 'portal',
    environment: 'jsdom',
    setupFiles: ['./test-setup.ts'],
    include: ['components/**/*.test.tsx', 'lib/**/*.test.ts'],
  },
});
