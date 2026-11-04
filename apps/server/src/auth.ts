// SPDX-License-Identifier: Apache-2.0
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { uuidv7 } from 'uuidv7';
import { schema, type Database } from '@portal/db';
import type { Config } from './config.js';
import type { FastifyRequest } from 'fastify';
import { Problem } from './problem.js';
export function createAuth(db: Database, config: Config) {
  return betterAuth({
    baseURL: config.PORTAL_PUBLIC_URL,
    basePath: '/api/auth',
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: [config.PORTAL_PUBLIC_URL],
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      requireEmailVerification: false,
    },
    user: {
      additionalFields: {
        role: {
          type: 'string',
          required: true,
          defaultValue: 'developer',
          input: false,
        },
      },
    },
    advanced: { database: { generateId: () => uuidv7() } },
  });
}
export type Auth = ReturnType<typeof createAuth>;
export function headersFor(request: FastifyRequest) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value !== undefined)
      headers.set(key, Array.isArray(value) ? value.join(',') : value);
  }
  return headers;
}
export async function requireUser(
  auth: Auth,
  request: FastifyRequest,
  admin = false,
) {
  const session = await auth.api.getSession({ headers: headersFor(request) });
  if (!session)
    throw new Problem(401, 'unauthenticated', 'Sign in to continue.');
  if (admin && session.user.role !== 'admin')
    throw new Problem(403, 'forbidden', 'Administrator access is required.');
  return session.user;
}
