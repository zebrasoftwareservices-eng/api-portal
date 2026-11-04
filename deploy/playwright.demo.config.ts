// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const baseURL = 'http://127.0.0.1:3100';

// An independent production build, with no control-plane server or Docker.
export default defineConfig({
  testDir: './e2e-demo',
  use: { baseURL },
  workers: 1,
  reporter: 'list',
  webServer: {
    cwd: resolve(__dirname, '..'),
    command:
      'env -u SERVER_URL pnpm exec turbo run build --filter=@portal/portal && env -u SERVER_URL pnpm --filter @portal/portal start',
    env: {
      PORTAL_DEMO_MODE: 'on',
      PORT: '3100',
      NEXT_INTERNAL_PORT: '3101',
      HOSTNAME: '127.0.0.1',
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
