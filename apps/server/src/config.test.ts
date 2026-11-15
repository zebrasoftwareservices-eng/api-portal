// SPDX-License-Identifier: Apache-2.0
import { expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError, loadConfig } from './config.js';
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

it('loads production secrets from files and injects an encoded database password', () => {
  const dir = mkdtempSync(join(tmpdir(), 'portal-config-'));
  const secret = (name: string, value: string) => {
    const path = join(dir, name);
    writeFileSync(path, `${value}\n`);
    return path;
  };
  const config = loadConfig({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://portal@postgres:5432/portal',
    DATABASE_PASSWORD_FILE: secret('db', 'p@ss word'),
    BETTER_AUTH_SECRET_FILE: secret('auth', 'a'.repeat(48)),
    PORTAL_ENCRYPTION_KEY_FILE: secret('encryption', Buffer.alloc(32, 9).toString('base64')),
  });
  expect(config.DATABASE_URL).toBe('postgres://portal:p%40ss%20word@postgres:5432/portal');
});

it('reports setting names and never a rejected secret value', () => {
  const rejected = 'do-not-print-this-secret';
  try {
    loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: `postgres://portal:${rejected}@postgres:5432/portal`,
      BETTER_AUTH_SECRET: rejected,
      PORTAL_ENCRYPTION_KEY: rejected,
    });
    throw new Error('expected configuration failure');
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    expect(String(error)).not.toContain(rejected);
    expect((error as ConfigError).settings).toContain('PORTAL_ENCRYPTION_KEY');
  }
});

it('rejects conflicting, unreadable and incomplete production secret inputs without exposing values', () => {
  const encryptionKey = Buffer.alloc(32, 8).toString('base64');
  const authSecret = 'b'.repeat(48);
  const cases: Array<[NodeJS.ProcessEnv, string[], string]> = [
    [
      { BETTER_AUTH_SECRET: authSecret, BETTER_AUTH_SECRET_FILE: '/not/read' },
      ['BETTER_AUTH_SECRET', 'BETTER_AUTH_SECRET_FILE'],
      'conflicting-settings',
    ],
    [
      { PORTAL_ENCRYPTION_KEY_FILE: '/definitely/missing/qa-secret' },
      ['PORTAL_ENCRYPTION_KEY_FILE'],
      'unreadable-file',
    ],
    [
      {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://portal@postgres:5432/portal',
        BETTER_AUTH_SECRET: authSecret,
        PORTAL_ENCRYPTION_KEY: encryptionKey,
      },
      ['DATABASE_PASSWORD'],
      'missing-setting',
    ],
    [
      {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://portal:private-db-value@postgres:5432/portal',
        DATABASE_PASSWORD: 'different-private-value',
        BETTER_AUTH_SECRET: authSecret,
        PORTAL_ENCRYPTION_KEY: encryptionKey,
      },
      ['DATABASE_URL', 'DATABASE_PASSWORD'],
      'conflicting-settings',
    ],
  ];

  for (const [env, settings, code] of cases) {
    try {
      loadConfig(env);
      throw new Error('expected configuration failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).settings).toEqual(settings);
      expect((error as ConfigError).code).toBe(code);
      expect(String(error)).not.toContain('private-db-value');
      expect(String(error)).not.toContain('different-private-value');
    }
  }
});
it('requires admin credentials together', () => {
  expect(() => loadConfig({ ADMIN_EMAIL: 'admin@example.com' })).toThrow(
    'must be set together',
  );
  expect(() => loadConfig({ ADMIN_PASSWORD: 'long-enough' })).toThrow(
    'must be set together',
  );
});
it('defaults plan counters to cluster and accepts only supported policies', () => {
  expect(loadConfig({}).PORTAL_RATE_LIMIT_POLICY).toBe('cluster');
  expect(
    loadConfig({ PORTAL_RATE_LIMIT_POLICY: 'local' }).PORTAL_RATE_LIMIT_POLICY,
  ).toBe('local');
  expect(() => loadConfig({ PORTAL_RATE_LIMIT_POLICY: 'redis' })).toThrow();
});

it('validates usage retention and ingest configuration', () => {
  expect(loadConfig({}).PORTAL_USAGE_RETENTION_DAYS).toBe(400);
  expect(loadConfig({ PORTAL_USAGE_RETENTION_DAYS: '62' }).PORTAL_USAGE_RETENTION_DAYS).toBe(62);
  expect(() => loadConfig({ PORTAL_USAGE_RETENTION_DAYS: '61' })).toThrow();
  expect(() => loadConfig({ PORTAL_USAGE_INGEST_URL: 'invalid' })).toThrow();
});
