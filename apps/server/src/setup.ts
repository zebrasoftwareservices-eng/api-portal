// SPDX-License-Identifier: Apache-2.0
import { createHash, timingSafeEqual } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import { eq, sql } from 'drizzle-orm';
import { user, account, type Database } from '@portal/db';
import type { FastifyInstance } from 'fastify';
import type { Auth } from './auth.js';
import { headersFor } from './auth.js';
import { Problem } from './problem.js';
const firstAdmin = z.strictObject({
  email: z.email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(80).default('Administrator'),
  setupToken: z.string().max(128).optional(),
});
export async function adminExists(db: Database) {
  const [admin] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, 'admin'))
    .limit(1);
  return Boolean(admin);
}
export async function createFirstAdmin(
  db: Database,
  auth: Auth,
  input: z.input<typeof firstAdmin>,
  expectedToken?: string,
) {
  const values = firstAdmin.parse(input);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(71833003)`);
    const [admin] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.role, 'admin'))
      .limit(1);
    if (admin)
      throw new Problem(
        409,
        'setup-complete',
        "The first admin has already been created. A portal has only one first admin, so this one wasn't created.",
      );
    if (
      expectedToken &&
      !timingSafeEqual(
        createHash('sha256').update(expectedToken).digest(),
        createHash('sha256')
          .update(values.setupToken ?? '')
          .digest(),
      )
    )
      throw new Problem(
        403,
        'setup-token-invalid',
        'The setup token is missing or wrong. No admin was created.',
      );
    const email = values.email.toLowerCase();
    const [existing] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email));
    if (existing)
      throw new Problem(
        400,
        'validation',
        'This email already belongs to a user. Use another email.',
        [
          {
            pointer: '/email',
            message:
              'An account with this email already exists. Use a different email.',
          },
        ],
      );
    const id = uuidv7();
    const password = await (await auth.$context).password.hash(values.password);
    await tx
      .insert(user)
      .values({
        id,
        email,
        name: values.name,
        role: 'admin',
        emailVerified: true,
      });
    await tx.insert(account).values({
      id: uuidv7(),
      accountId: id,
      providerId: 'credential',
      userId: id,
      password,
    });
    return { id, email, name: values.name, role: 'admin' as const };
  });
}
export async function registerSetup(
  server: FastifyInstance,
  db: Database,
  auth: Auth,
  production: boolean,
  setupToken?: string,
) {
  server.get('/api/v1/setup', async () => {
    const adminRequired = !(await adminExists(db));
    return { adminRequired, setupTokenRequired: production && adminRequired };
  });
  await server.register(async (app) => {
    await app.register(rateLimit, {
      max: 10,
      timeWindow: '1 minute',
      errorResponseBuilder: () =>
        new Problem(
          429,
          'rate-limited',
          'Too many requests. Try again in a moment.',
        ),
    });
    app.post('/api/v1/setup/admin', async (request, reply) => {
      const input = firstAdmin.parse(request.body);
      // A production app must never accidentally admit a claim without a startup token.
      if (production && !setupToken && !(await adminExists(db)))
        throw new Problem(
          403,
          'setup-token-invalid',
          'The setup token is unavailable. Restart the server and use the token from its startup log.',
        );
      const admin = await createFirstAdmin(
        db,
        auth,
        input,
        production ? setupToken : undefined,
      );
      try {
        const signedIn = await auth.api.signInEmail({
          body: { email: admin.email, password: input.password },
          headers: headersFor(request),
          returnHeaders: true,
        });
        const cookies = signedIn.headers.getSetCookie();
        if (cookies.length) reply.header('set-cookie', cookies);
      } catch {
        app.log.warn('First admin created; automatic sign-in failed');
      }
      return reply.code(201).send(admin);
    });
  });
}
