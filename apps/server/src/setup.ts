// SPDX-License-Identifier: Apache-2.0
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import { eq, sql } from 'drizzle-orm';
import { user, account, setupTokens, type Database } from '@portal/db';
import type { FastifyInstance } from 'fastify';
import type { Auth } from './auth.js';
import { headersFor } from './auth.js';
import { Problem } from './problem.js';
import { decrypt, encrypt } from './crypto.js';
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
  setupEncryptionKey?: string,
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
    if (setupEncryptionKey) {
      const [row] = await tx.select().from(setupTokens).limit(1).for('update');
      if (!row)
        throw new Problem(
          403,
          'setup-token-invalid',
          'The setup token is unavailable. Restart the server and use the token from its startup log.',
        );
      let expectedToken: string;
      try {
        expectedToken = decrypt(row.tokenCiphertext, setupEncryptionKey);
      } catch {
        throw new Problem(
          403,
          'setup-token-invalid',
          'The setup token is unavailable. Restart the server and use the token from its startup log.',
        );
      }
      if (!timingSafeEqual(
        createHash('sha256').update(expectedToken).digest(),
        createHash('sha256').update(values.setupToken ?? '').digest(),
      ))
        throw new Problem(
          403,
          'setup-token-invalid',
          'The setup token is missing or wrong. No admin was created.',
        );
    }
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
    await tx.delete(setupTokens);
    return { id, email, name: values.name, role: 'admin' as const };
  });
}

export async function prepareSetupToken(
  db: Database,
  encryptionKey: string,
  production: boolean,
) {
  if (!production) return undefined;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(71833003)`);
    const [admin] = await tx.select({ id: user.id }).from(user).where(eq(user.role, 'admin')).limit(1);
    if (admin) {
      await tx.delete(setupTokens);
      return undefined;
    }
    const [stored] = await tx.select().from(setupTokens).limit(1);
    if (stored) {
      try {
        return decrypt(stored.tokenCiphertext, encryptionKey);
      } catch {
        // A rotated encryption key makes the old token unusable; replace it atomically.
      }
    }
    const token = randomBytes(32).toString('hex');
    await tx.insert(setupTokens).values({ id: 1, tokenCiphertext: encrypt(token, encryptionKey) }).onConflictDoUpdate({
      target: setupTokens.id,
      set: { tokenCiphertext: encrypt(token, encryptionKey), createdAt: new Date() },
    });
    return token;
  });
}
export async function registerSetup(
  server: FastifyInstance,
  db: Database,
  auth: Auth,
  production: boolean,
  setupEncryptionKey?: string,
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
      const admin = await createFirstAdmin(
        db,
        auth,
        input,
        production ? setupEncryptionKey : undefined,
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
