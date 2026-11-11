// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from '@playwright/test';
import demo from '../deploy/playwright.demo.config';

const isDemo = process.env.SPEC003_DEMO === 'on';
export default defineConfig({
  ...(isDemo ? demo : {}),
  testDir: '../apps/portal/e2e',
  testMatch: isDemo ? 'backlog-regressions.test.ts' : 'backlog-*.test.ts',
  use: { baseURL: isDemo ? 'http://127.0.0.1:3100' : process.env.PORTAL_PUBLIC_URL },
  workers: 1,
  reporter: 'list',
});
