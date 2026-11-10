// SPDX-License-Identifier: Apache-2.0
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { randomBytes, createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { and, eq, gt, asc, like, inArray } from 'drizzle-orm';
import {
  user,
  account,
  apps,
  teams,
  teamMembers,
  emailChangeRequests,
  verification,
  type Database,
} from '@portal/db';
import {
  GatewayUnavailableError,
  type GatewayAdapter,
} from '@portal/adapter-sdk';
import { sql } from 'drizzle-orm';
import { type Auth, requireUser } from './auth.js';
import { limitLock, readAccountSettings, type Tx } from './auth-limits.js';
import { securityProblem } from './security-problems.js';
import { ensurePersonalTeam, currentTeamId } from './teams.js';
import { Problem } from './problem.js';
import {
  storedTokenUnavailable,
  type GatewayConnection,
} from './gateway-connection.js';
import type { EnqueueMail } from './mail/queue.js';
import type { Config } from './config.js';
const emailSchema = z.strictObject({
  newEmail: z
    .email()
    .max(254)
    .transform((s) => s.trim().toLowerCase()),
});
function uniqueViolation(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    (('code' in error && error.code === '23505') ||
      ('cause' in error && uniqueViolation(error.cause)))
  );
}
export async function userView(
  db: Database,
  current: {
    id: string;
    email: string;
    name: string;
    role: string;
    emailVerified: boolean;
  },
) {
  await db.transaction((tx) => ensurePersonalTeam(tx, current.id));
  const [pending] = await db
    .select()
    .from(emailChangeRequests)
    .where(
      and(
        eq(emailChangeRequests.userId, current.id),
        gt(emailChangeRequests.expiresAt, new Date()),
      ),
    );
  return {
    ...current,
    currentTeamId: await currentTeamId(db, current.id),
    pendingEmail: pending?.newEmail ?? null,
    verificationRequired: (await readAccountSettings(db)).requireVerifiedEmail,
  };
}
async function checkPassword(
  db: Database,
  auth: Auth,
  current: { id: string; email: string },
  password: string,
  reply: FastifyReply,
) {
  // Returning the outcome commits failed attempts; throwing here would roll back the hit.
  const valid = await db.transaction(async (tx) => {
    const limit = await limitLock(tx, 'sign-in-failure', current.email, reply);
    const [credential] = await tx
      .select()
      .from(account)
      .where(
        and(
          eq(account.userId, current.id),
          eq(account.providerId, 'credential'),
        ),
      );
    const ok =
      !!credential?.password &&
      (await (
        await auth.$context
      ).password.verify({ hash: credential.password, password }));
    if (!ok) await limit.hit();
    return ok;
  });
  if (!valid) throw securityProblem(403, 'invalid-password');
}
export async function deleteAccount(
  db: Database,
  connection: GatewayAdapter | GatewayConnection,
  current: { id: string; role: string },
) {
  const checkAdmin = async (tx: Database | Tx) => {
    if (current.role !== 'admin') return;
    const admins = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.role, 'admin'));
    if (!admins.some((a) => a.id !== current.id))
      throw securityProblem(409, 'last-admin');
  };
  const teamOwnership = async (tx: Database | Tx, lock = false) => {
    // Lock teams in a stable order before membership and user locks, matching invitations.
    const query = tx
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(
        sql`${teams.id} in (select team_id from team_members where user_id = ${current.id})`,
      )
      .orderBy(asc(teams.id));
    const rows = await (lock ? query.for('update') : query);
    const blocked: { id: string; name: string }[] = [];
    const sole: string[] = [];
    for (const team of rows) {
      const members = await tx
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.teamId, team.id));
      if (members.length === 1) sole.push(team.id);
      else if (
        members.some((m) => m.userId === current.id && m.role === 'admin') &&
        !members.some((m) => m.userId !== current.id && m.role === 'admin')
      )
        blocked.push(team);
    }
    if (blocked.length) {
      const problem = securityProblem(409, 'team-needs-admin');
      throw new Problem(
        problem.status,
        problem.code,
        problem.message,
        undefined,
        { teams: blocked },
      );
    }
    return sole;
  };
  await checkAdmin(db);
  const soleTeams = await teamOwnership(db);
  const unavailable = () =>
    new Problem(
      503,
      'gateway-unavailable',
      "The API gateway didn't respond, so your keys can't be removed yet. Your account was not deleted. Try again in a moment.",
    );
  // No connection means there are no gateway credentials to revoke. A stored
  // connection with an unreadable token must still prevent account deletion.
  const gateway = 'load' in connection ? await connection.load(db) : null;
  if (gateway && !gateway.adapter) throw storedTokenUnavailable();
  const adapter = 'load' in connection ? gateway?.adapter : connection;
  if (adapter) {
    try {
      if (!(await adapter.health()).reachable) throw unavailable();
    } catch {
      throw unavailable();
    }
  }
  const remove = async (tx: Tx, app: { id: string }) => {
    await tx.execute(sql`select pg_advisory_xact_lock_shared(71833002)`);
    try {
      await adapter?.deleteConsumer(app);
    } catch (error) {
      if (error instanceof GatewayUnavailableError) throw unavailable();
      throw error;
    }
    await tx.delete(apps).where(eq(apps.id, app.id));
  };
  const owned = await db
    .select({ id: apps.id })
    .from(apps)
    .where(inArray(apps.teamId, soleTeams));
  for (const app of owned)
    await db.transaction(async (tx) => {
      const sole = await teamOwnership(tx, true);
      const [locked] = await tx
        .select({ id: apps.id })
        .from(apps)
        .where(and(eq(apps.id, app.id), inArray(apps.teamId, sole)))
        .for('update');
      if (locked) await remove(tx, locked);
    });
  await db.transaction(async (tx) => {
    // Serialize final deletions, including two admins deleting simultaneously.
    await tx.execute(sql`select pg_advisory_xact_lock(71833004)`);
    const sole = await teamOwnership(tx, true);
    await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.role, 'admin'))
      .orderBy(asc(user.id))
      .for('update');
    await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, current.id))
      .for('update');
    await checkAdmin(tx);
    const late = await tx
      .select({ id: apps.id })
      .from(apps)
      .where(inArray(apps.teamId, sole))
      .for('update');
    for (const app of late) await remove(tx, app);
    for (const teamId of sole)
      await tx.delete(teams).where(eq(teams.id, teamId));
    await tx.delete(user).where(eq(user.id, current.id));
  });
}
export function registerAccount(
  server: FastifyInstance,
  db: Database,
  auth: Auth,
  connection: GatewayConnection,
  config: Config,
  enqueue: EnqueueMail,
) {
  server.get('/api/v1/me', async (request) => {
    const current = await requireUser(auth, request);
    return userView(db, {
      id: current.id,
      email: current.email,
      name: current.name,
      role: current.role,
      emailVerified: current.emailVerified,
    });
  });
  server.patch('/api/v1/me', async (request) => {
    const current = await requireUser(auth, request);
    const { name } = z
      .strictObject({ name: z.string().trim().min(1).max(100) })
      .parse(request.body);
    await db
      .update(user)
      .set({ name, updatedAt: new Date() })
      .where(eq(user.id, current.id));
    return userView(db, {
      id: current.id,
      email: current.email,
      name,
      role: current.role,
      emailVerified: current.emailVerified,
    });
  });
  server.post('/api/v1/me/email', async (request, reply) => {
    const current = await requireUser(auth, request);
    // Normalize before validating, matching the boundary contract.
    const raw = request.body as { newEmail?: unknown } | undefined;
    const { newEmail } = emailSchema.parse(
      typeof raw?.newEmail === 'string'
        ? { ...raw, newEmail: raw.newEmail.trim().toLowerCase() }
        : raw,
    );
    const token = randomBytes(32).toString('base64url');
    await db.transaction(async (tx) => {
      await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, current.id))
        .for('update');
      const [taken] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, newEmail));
      if (taken) throw securityProblem(409, 'email-unavailable');
      const limit = await limitLock(
        tx,
        'verification-email',
        current.id,
        reply,
      );
      await limit.hit();
      const values = {
        newEmail,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      };
      await tx
        .insert(emailChangeRequests)
        .values({ id: uuidv7(), userId: current.id, ...values })
        .onConflictDoUpdate({
          target: emailChangeRequests.userId,
          set: values,
        });
    });
    await enqueue({
      template: 'confirm-email',
      userId: current.id,
      to: newEmail,
      link: new URL(`/confirm-email?token=${token}`, config.PORTAL_PUBLIC_URL)
        .href,
    });
    return reply.code(202).send(
      await userView(db, {
        id: current.id,
        email: current.email,
        name: current.name,
        role: current.role,
        emailVerified: current.emailVerified,
      }),
    );
  });
  server.post('/api/v1/me/email/confirm', async (request) => {
    const { token } = z
      .strictObject({ token: z.string().min(1).max(200) })
      .parse(request.body);
    try {
      const changed = await db.transaction(async (tx) => {
        const tokenHash = createHash('sha256').update(token).digest('hex');
        const [candidate] = await tx
          .select({ userId: emailChangeRequests.userId })
          .from(emailChangeRequests)
          .where(eq(emailChangeRequests.tokenHash, tokenHash));
        if (!candidate) throw securityProblem(400, 'link-expired');
        const [previous] = await tx
          .select()
          .from(user)
          .where(eq(user.id, candidate.userId))
          .for('update');
        if (!previous) throw securityProblem(400, 'link-expired');
        const [pending] = await tx
          .select()
          .from(emailChangeRequests)
          .where(
            and(
              eq(
                emailChangeRequests.tokenHash,
                createHash('sha256').update(token).digest('hex'),
              ),
              gt(emailChangeRequests.expiresAt, new Date()),
            ),
          )
          .for('update');
        if (!pending) throw securityProblem(400, 'link-expired');
        const [updated] = await tx
          .update(user)
          .set({
            email: pending.newEmail,
            emailVerified: true,
            updatedAt: new Date(),
          })
          .where(eq(user.id, pending.userId))
          .returning();
        await tx
          .delete(emailChangeRequests)
          .where(eq(emailChangeRequests.id, pending.id));
        await tx
          .delete(verification)
          .where(
            and(
              like(verification.identifier, 'reset-password:%'),
              eq(verification.value, pending.userId),
            ),
          );
        return updated!;
      });
      return userView(db, {
        id: changed.id,
        email: changed.email,
        name: changed.name,
        role: changed.role,
        emailVerified: changed.emailVerified,
      });
    } catch (error) {
      if (uniqueViolation(error))
        throw securityProblem(409, 'email-unavailable');
      throw error;
    }
  });
  server.delete('/api/v1/me', async (request, reply) => {
    const current = await requireUser(auth, request);
    const { password } = z
      .strictObject({ password: z.string().min(1).max(128) })
      .parse(request.body);
    await checkPassword(db, auth, current, password, reply);
    await deleteAccount(db, connection, current);
    const context = await auth.$context;
    const cookie = context.authCookies.sessionToken;
    reply.header(
      'set-cookie',
      `${cookie.name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookie.options.secure ? '; Secure' : ''}`,
    );
    return reply.code(204).send();
  });
}
