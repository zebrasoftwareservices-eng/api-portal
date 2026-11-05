// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// The same regression is imported by journeys.ts for the real Compose portal.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'reference-snippets.test.ts',
  use: { baseURL: 'http://127.0.0.1:3200' },
  workers: 1,
  reporter: 'list',
  webServer: {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    command:
      'env -u SERVER_URL pnpm exec turbo run build --filter=@portal/portal && env -u SERVER_URL pnpm --filter @portal/portal start',
    env: {
      PORTAL_DEMO_MODE: 'on',
      PORT: '3200',
      NEXT_INTERNAL_PORT: '3201',
      HOSTNAME: '127.0.0.1',
    },
    url: 'http://127.0.0.1:3200',
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
