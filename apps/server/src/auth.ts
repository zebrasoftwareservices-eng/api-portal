// SPDX-License-Identifier: Apache-2.0
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { uuidv7 } from 'uuidv7';
import { schema, user, type Database } from '@portal/db';
import type { Config } from './config.js';
import type { FastifyRequest } from 'fastify';
import { mailQueue, type EnqueueMail } from './mail/queue.js';
import { Problem } from './problem.js';
export function createAuth(
  db: Database,
  config: Config,
  enqueue: EnqueueMail = mailQueue(config),
) {
  return betterAuth({
    baseURL: config.PORTAL_PUBLIC_URL,
    basePath: '/api/auth',
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: [config.PORTAL_PUBLIC_URL],
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    databaseHooks: {
      user: {
        create: {
          before: async () => {
            const [admin] = await db
              .select({ id: user.id })
              .from(user)
              .where(eq(user.role, 'admin'))
              .limit(1);
            if (!admin)
              throw new APIError('FORBIDDEN', {
                message:
                  'Create the first administrator through setup before signing up.',
              });
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      requireEmailVerification: false,
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await enqueue({
          template: 'reset-password',
          userId: user.id,
          to: user.email,
          link: (() => {
            const link = new URL(url);
            link.searchParams.set('callbackURL', '/reset-password');
            return link.href;
          })(),
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      expiresIn: 86400,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await enqueue({
          template: 'verify',
          userId: user.id,
          to: user.email,
          link: (() => {
            const link = new URL(url);
            link.searchParams.set('callbackURL', '/profile?verified=1');
            return link.href;
          })(),
        });
      },
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
