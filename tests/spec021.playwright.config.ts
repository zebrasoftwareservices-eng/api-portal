// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '../apps/portal/e2e',
  testMatch: 'agent-docs.test.ts',
  use: { baseURL: process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:3000' },
  workers: 1,
  reporter: 'list',
});
