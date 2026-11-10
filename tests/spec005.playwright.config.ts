// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '../apps/portal/e2e',
  testMatch: 'setup-gateways.test.ts',
  use: { baseURL: 'http://localhost:3000' },
  workers: 1,
  reporter: 'list',
});
