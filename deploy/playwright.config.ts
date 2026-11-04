// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from '@playwright/test';

// Start the quickstart before running this suite (CI does so in compose-smoke).
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:3000' },
  workers: 1,
  reporter: 'list',
});
