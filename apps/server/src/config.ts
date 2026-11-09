// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
export const DEV_AUTH_SECRET = 'INSECURE-local-auth-secret-change-me-123456';
export const DEV_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z
    .url()
    .default('postgres://portal:portal@localhost:5432/portal'),
  BETTER_AUTH_SECRET: z.string().min(32).default(DEV_AUTH_SECRET),
  PORTAL_ENCRYPTION_KEY: z
    .string()
    .refine(
      (v) => Buffer.from(v, 'base64').length === 32,
      'Must encode 32 bytes',
    )
    .default(DEV_ENCRYPTION_KEY),
  PORTAL_LINT_RULESET: z.string().optional(),
  PORTAL_PROXY_HOST: z.string().min(1).default('localhost'),
  PORTAL_PUBLIC_URL: z.url().default('http://localhost:3000'),
  KONG_ADMIN_URL: z.url().optional(),
  PORTAL_BUNDLED_KONG_ADMIN_URL: z.url().optional(),
  KONG_ADMIN_TOKEN: z.string().optional(),
  KONG_PROXY_INTERNAL_URL: z.url().default('http://localhost:8000'),
  KONG_PROXY_PUBLIC_URL: z.url().default('http://localhost:8000'),
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  SEED_SAMPLE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const c = envSchema.parse(
    Object.fromEntries(
      Object.entries(env).map(([key, value]) => [
        key,
        value === '' ? undefined : value,
      ]),
    ),
  );
  if (Boolean(c.ADMIN_EMAIL) !== Boolean(c.ADMIN_PASSWORD))
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set together.');
  if (
    c.NODE_ENV === 'production' &&
    (c.BETTER_AUTH_SECRET === DEV_AUTH_SECRET ||
      c.PORTAL_ENCRYPTION_KEY === DEV_ENCRYPTION_KEY ||
      c.ADMIN_PASSWORD === 'change-me-now' ||
      c.DATABASE_URL === 'postgres://portal:portal@localhost:5432/portal')
  )
    throw new Error('Production requires non-default secrets');
  return c;
}
export type Config = ReturnType<typeof loadConfig>;
