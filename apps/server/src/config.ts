// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { z } from 'zod';

export const DEV_AUTH_SECRET = 'INSECURE-local-auth-secret-change-me-123456';
export const DEV_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
const fileSecrets = ['DATABASE_URL', 'DATABASE_PASSWORD', 'BETTER_AUTH_SECRET', 'PORTAL_ENCRYPTION_KEY', 'KONG_ADMIN_TOKEN', 'SMTP_PASSWORD', 'ADMIN_PASSWORD'] as const;

export class ConfigError extends Error {
  constructor(message: string, readonly settings: string[], readonly code = 'invalid-setting') {
    super(message);
    this.name = 'ConfigError';
  }
}

export function resolveFileSecrets(env: NodeJS.ProcessEnv) {
  const resolved: NodeJS.ProcessEnv = { ...env };
  for (const setting of fileSecrets) {
    const fileSetting = `${setting}_FILE`;
    const value = resolved[setting];
    const path = resolved[fileSetting];
    if (value && path)
      throw new ConfigError(`Set ${setting} or ${fileSetting}, not both`, [setting, fileSetting], 'conflicting-settings');
    if (path) {
      try {
        resolved[setting] = readFileSync(path, 'utf8').replace(/\r?\n$/, '');
      } catch {
        throw new ConfigError(`${fileSetting}: cannot read ${path}`, [fileSetting], 'unreadable-file');
      }
    }
    delete resolved[fileSetting];
  }
  return resolved;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.url(),
  DATABASE_PASSWORD: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().min(32),
  PORTAL_ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, 'Must encode 32 bytes'),
  PORTAL_VERSION: z.string().min(1).default('dev'),
  PORTAL_RATE_LIMIT_POLICY: z.enum(['cluster', 'local']).default('cluster'),
  PORTAL_USAGE_INGEST_URL: z.url().optional(),
  PORTAL_TRACE_INGEST_URL: z.url().optional(),
  PORTAL_USAGE_RETENTION_DAYS: z.coerce.number().int().min(62).default(400),
  PORTAL_LINT_RULESET: z.string().optional(),
  PORTAL_PROXY_HOST: z.string().min(1).default('localhost'),
  PORTAL_PUBLIC_URL: z.url().default('http://localhost:3000'),
  KONG_ADMIN_URL: z.url().optional(),
  PORTAL_BUNDLED_KONG_ADMIN_URL: z.url().optional(),
  KONG_ADMIN_TOKEN: z.string().optional(),
  KONG_PROXY_INTERNAL_URL: z.url().default('http://localhost:8000'),
  KONG_PROXY_PUBLIC_URL: z.url().default('http://localhost:8000'),
  SMTP_HOST: z.string().min(1).max(253).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURITY: z.enum(['none', 'starttls', 'tls']).default('starttls'),
  SMTP_USERNAME: z.string().max(254).optional(),
  SMTP_PASSWORD: z.string().max(1024).optional(),
  SMTP_SENDER_NAME: z.string().min(1).max(100).default('Developer Portal'),
  SMTP_SENDER_ADDRESS: z.email().optional(),
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  SEED_SAMPLE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const normalized = Object.fromEntries(Object.entries(resolveFileSecrets(env)).map(([key, value]) => [key, value === '' ? undefined : value])) as NodeJS.ProcessEnv;
  const production = normalized.NODE_ENV === 'production';
  normalized.DATABASE_URL ??= production ? undefined : 'postgres://portal:portal@localhost:5432/portal';
  normalized.BETTER_AUTH_SECRET ??= production ? undefined : DEV_AUTH_SECRET;
  normalized.PORTAL_ENCRYPTION_KEY ??= production ? undefined : DEV_ENCRYPTION_KEY;
  const missing = ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'PORTAL_ENCRYPTION_KEY'].filter((setting) => !normalized[setting]);
  if (missing.length)
    throw new ConfigError(missing.map((setting) => `Missing required setting ${setting} (set ${setting} or ${setting}_FILE)`).join('\n'), missing, 'missing-setting');
  let c: z.infer<typeof envSchema>;
  try {
    c = envSchema.parse(normalized);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const settings = [...new Set(error.issues.map((issue) => String(issue.path[0] ?? 'environment')))];
      throw new ConfigError('Invalid configuration', settings, 'invalid-setting');
    }
    throw error;
  }
  const database = new URL(c.DATABASE_URL);
  if (c.DATABASE_PASSWORD && database.password)
    throw new ConfigError('Set DATABASE_PASSWORD only when DATABASE_URL has no password', ['DATABASE_URL', 'DATABASE_PASSWORD'], 'conflicting-settings');
  if (c.DATABASE_PASSWORD) database.password = c.DATABASE_PASSWORD;
  if (production && !database.password)
    throw new ConfigError('Missing required setting DATABASE_PASSWORD (set DATABASE_PASSWORD or DATABASE_PASSWORD_FILE)', ['DATABASE_PASSWORD'], 'missing-setting');
  c.DATABASE_URL = database.toString();
  if (Boolean(c.ADMIN_EMAIL) !== Boolean(c.ADMIN_PASSWORD))
    throw new ConfigError('ADMIN_EMAIL and ADMIN_PASSWORD must be set together', ['ADMIN_EMAIL', 'ADMIN_PASSWORD']);
  if (production && (c.BETTER_AUTH_SECRET === DEV_AUTH_SECRET || c.PORTAL_ENCRYPTION_KEY === DEV_ENCRYPTION_KEY || c.ADMIN_PASSWORD === 'change-me-now' || c.DATABASE_URL === 'postgres://portal:portal@localhost:5432/portal'))
    throw new ConfigError('Production requires non-default secrets', ['BETTER_AUTH_SECRET', 'PORTAL_ENCRYPTION_KEY', 'ADMIN_PASSWORD', 'DATABASE_URL']);
  if (production && env.PORTAL_RATE_LIMIT_RESET)
    throw new ConfigError('Production refuses PORTAL_RATE_LIMIT_RESET', ['PORTAL_RATE_LIMIT_RESET']);
  const config = { ...c };
  delete config.DATABASE_PASSWORD;
  return config;
}
export type Config = ReturnType<typeof loadConfig>;
