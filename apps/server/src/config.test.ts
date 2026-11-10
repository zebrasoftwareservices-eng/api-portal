// SPDX-License-Identifier: Apache-2.0
import { expect, it } from 'vitest';
import { loadConfig } from './config.js';
it('starts without bootstrap settings and treats empty settings as unset', () => {
  const c = loadConfig({
    ADMIN_EMAIL: '',
    ADMIN_PASSWORD: '',
    KONG_ADMIN_URL: '',
    SEED_SAMPLE: '',
  });
  expect(c.ADMIN_EMAIL).toBeUndefined();
  expect(c.ADMIN_PASSWORD).toBeUndefined();
  expect(c.KONG_ADMIN_URL).toBeUndefined();
  expect(c.SEED_SAMPLE).toBe(false);
});
it('requires admin credentials together', () => {
  expect(() => loadConfig({ ADMIN_EMAIL: 'admin@example.com' })).toThrow(
    'must be set together',
  );
  expect(() => loadConfig({ ADMIN_PASSWORD: 'long-enough' })).toThrow(
    'must be set together',
  );
});
