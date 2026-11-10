// SPDX-License-Identifier: Apache-2.0
import { randomBytes, createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { and, eq, desc, asc, sql, isNull, gt, lte } from 'drizzle-orm';
import {
  teams,
  teamMembers,
  teamInvitations,
  apps,
  user,
  type Database,
} from '@portal/db';
import type { FastifyInstance } from 'fastify';
import { requireUser, type Auth } from './auth.js';
import { notFound } from './problem.js';
import { securityProblem } from './security-problems.js';
import { limitLock, type Tx } from './auth-limits.js';
import type { Config } from './config.js';
import type { EnqueueMail } from './mail/queue.js';
import { effectiveSettings } from './mail/settings.js';
export type TeamRole = typeof teamMembers.$inferSelect.role;
export const INVITATION_TTL_DAYS = 7;
const roleSchema = z.enum(['admin', 'member', 'read-only']);
const teamParams = z.object({ teamId: z.uuid() });
const tokenSchema = z.strictObject({ token: z.string().min(1).max(200) });
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export async function ensurePersonalTeam(db: Database | Tx, userId: string) {
  await db
    .insert(teams)
    .values({
      id: uuidv7(),
      name: 'Personal',
      personalOwnerId: userId,
      createdBy: userId,
    })
    .onConflictDoNothing({ target: teams.personalOwnerId });
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.personalOwnerId, userId));
  if (!team) throw notFound();
  await db
    .insert(teamMembers)
    .values({ teamId: team.id, userId, role: 'admin' })
    .onConflictDoNothing();
  return team.id;
}
export async function currentTeamId(db: Database | Tx, userId: string) {
  const [member] = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId))
    .orderBy(desc(teamMembers.selectedAt), asc(teamMembers.teamId))
    .limit(1);
  if (!member) throw notFound();
  return member.teamId;
}
export async function teamAccess(
  db: Database | Tx,
  teamId: string,
  userId: string,
  need: 'read' | 'write' | 'admin' = 'read',
) {
  const query = db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  const [membership] = await (need === 'read' ? query : query.for('share'));
  if (!membership) throw notFound();
  if (
    (need === 'admin' && membership.role !== 'admin') ||
    (need === 'write' && membership.role === 'read-only')
  )
    throw securityProblem(403, 'team-role-forbidden');
  return membership;
}
export async function appAccess(
  db: Database | Tx,
  appId: string,
  userId: string,
  need: 'read' | 'write' = 'read',
) {
  const [app] = await db.select().from(apps).where(eq(apps.id, appId));
  if (!app) throw notFound();
  const membership = await teamAccess(db, app.teamId, userId, need);
  if (need === 'write')
    await db
      .select({ id: apps.id })
      .from(apps)
      .where(eq(apps.id, appId))
      .for('update');
  return { app, role: membership.role };
}
async function selectTeam(db: Database | Tx, teamId: string, userId: string) {
  // Use a strictly newer timestamp even for rapid switches or transaction timestamps.
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`team-selection:${userId}`},0))`,
  );
  await db
    .update(teamMembers)
    .set({
      selectedAt: sql`greatest(clock_timestamp(), (select max(selected_at) + interval '1 microsecond' from team_members where user_id = ${userId}))`,
    })
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
}
async function summary(db: Database | Tx, teamId: string, userId: string) {
  const membership = await teamAccess(db, teamId, userId);
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) throw notFound();
  const [count] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId));
  return {
    id: team.id,
    name: team.name,
    personal: team.personalOwnerId === userId,
    role: membership.role,
    memberCount: count!.value,
    createdAt: team.createdAt.toISOString(),
  };
}
async function members(db: Database | Tx, teamId: string) {
  return db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: teamMembers.role,
      joinedAt: teamMembers.createdAt,
    })
    .from(teamMembers)
    .innerJoin(user, eq(user.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId))
    .orderBy(
      sql`case when ${teamMembers.role} = 'admin' then 0 else 1 end`,
      asc(user.name),
    );
}
function memberView(row: Awaited<ReturnType<typeof members>>[number]) {
  return { ...row, joinedAt: row.joinedAt.toISOString() };
}
const pending = () =>
  and(
    isNull(teamInvitations.acceptedAt),
    isNull(teamInvitations.cancelledAt),
    gt(teamInvitations.expiresAt, new Date()),
  );
async function invitationView(
  db: Database | Tx,
  row: typeof teamInvitations.$inferSelect,
) {
  const [inviter] = row.invitedBy
    ? await db.select().from(user).where(eq(user.id, row.invitedBy))
    : [];
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    invitedBy: inviter ? { userId: inviter.id, name: inviter.name } : null,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}
export function invitationState(
  row: Pick<
    typeof teamInvitations.$inferSelect,
    'cancelledAt' | 'acceptedAt' | 'expiresAt'
  >,
) {
  return row.cancelledAt
    ? 'cancelled'
    : row.acceptedAt
      ? 'accepted'
      : row.expiresAt <= new Date()
        ? 'expired'
        : 'pending';
}
export function registerTeams(
  server: FastifyInstance,
  db: Database,
  auth: Auth,
  config: Config,
  enqueue: EnqueueMail,
) {
  server.get('/api/v1/teams', async (request) => {
    const current = await requireUser(auth, request);
    await ensurePersonalTeam(db, current.id);
    const rows = await db
      .select({ id: teams.id })
      .from(teams)
      .innerJoin(teamMembers, eq(teams.id, teamMembers.teamId))
      .where(eq(teamMembers.userId, current.id))
      .orderBy(
        sql`${teams.personalOwnerId} is null`,
        asc(teams.name),
        asc(teams.id),
      );
    return {
      items: await Promise.all(
        rows.map((row) => summary(db, row.id, current.id)),
      ),
      currentTeamId: await currentTeamId(db, current.id),
    };
  });
  server.post('/api/v1/teams', async (request, reply) => {
    const current = await requireUser(auth, request);
    const { name } = z
      .strictObject({ name: z.string().trim().min(1).max(80) })
      .parse(request.body);
    const id = uuidv7();
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock_shared(71833004)`);
      await tx.insert(teams).values({ id, name, createdBy: current.id });
      await tx
        .insert(teamMembers)
        .values({ teamId: id, userId: current.id, role: 'admin' });
      await selectTeam(tx, id, current.id);
      return summary(tx, id, current.id);
    });
    return reply
      .code(201)
      .header('Location', `/api/v1/teams/${id}`)
      .send(result);
  });
  server.get('/api/v1/teams/:teamId', async (request) => {
    const current = await requireUser(auth, request);
    const { teamId } = teamParams.parse(request.params);
    const result = await summary(db, teamId, current.id);
    const invitations =
      result.role === 'admin'
        ? await db
            .select()
            .from(teamInvitations)
            .where(and(eq(teamInvitations.teamId, teamId), pending()))
            .orderBy(desc(teamInvitations.createdAt))
        : null;
    return {
      ...result,
      members: (await members(db, teamId)).map(memberView),
      invitations: invitations
        ? await Promise.all(invitations.map((row) => invitationView(db, row)))
        : null,
    };
  });
  server.put('/api/v1/me/current-team', async (request, reply) => {
    const current = await requireUser(auth, request);
    const { teamId } = z.strictObject({ teamId: z.uuid() }).parse(request.body);
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock_shared(71833004)`);
      await teamAccess(tx, teamId, current.id, 'read');
      await selectTeam(tx, teamId, current.id);
    });
    return reply.code(204).send();
  });
  for (const method of ['PATCH', 'DELETE'] as const)
    server.route({
      method,
      url: '/api/v1/teams/:teamId/members/:userId',
      handler: async (request, reply) => {
        const current = await requireUser(auth, request);
        const { teamId, userId } = teamParams
          .extend({ userId: z.uuid() })
          .parse(request.params);
        const role =
          method === 'PATCH'
            ? z.strictObject({ role: roleSchema }).parse(request.body).role
            : undefined;
        const result = await db.transaction(async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock_shared(71833004)`);
          await tx
            .select()
            .from(teams)
            .where(eq(teams.id, teamId))
            .for('update');
          await teamAccess(
            tx,
            teamId,
            current.id,
            method === 'DELETE' && userId === current.id ? 'read' : 'admin',
          );
          const rows = await members(tx, teamId);
          const target = rows.find((m) => m.userId === userId);
          if (!target) throw notFound();
          if (
            target.role === 'admin' &&
            role !== 'admin' &&
            rows.filter((m) => m.role === 'admin').length === 1
          )
            throw securityProblem(409, 'team-needs-admin');
          if (role) {
            await tx
              .update(teamMembers)
              .set({ role })
              .where(
                and(
                  eq(teamMembers.teamId, teamId),
                  eq(teamMembers.userId, userId),
                ),
              );
            return memberView({ ...target, role });
          }
          await tx
            .delete(teamMembers)
            .where(
              and(
                eq(teamMembers.teamId, teamId),
                eq(teamMembers.userId, userId),
              ),
            );
        });
        return method === 'DELETE' ? reply.code(204).send() : result;
      },
    });
  server.post('/api/v1/teams/:teamId/invitations', async (request, reply) => {
    const current = await requireUser(auth, request);
    const { teamId } = teamParams.parse(request.params);
    const input = z
      .strictObject({
        email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
        role: roleSchema,
      })
      .parse(request.body);
    const token = randomBytes(32).toString('base64url');
    const invitation = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock_shared(71833004)`);
      const [team] = await tx
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .for('update');
      await teamAccess(tx, teamId, current.id, 'admin');
      if (team!.personalOwnerId) throw securityProblem(409, 'personal-team');
      if (!(await effectiveSettings(tx, config)))
        throw securityProblem(409, 'mail-not-configured');
      const limit = await limitLock(tx, 'team-invitation', current.id, reply);
      if (
        (await members(tx, teamId)).some(
          (m) => m.email.trim().toLowerCase() === input.email,
        )
      )
        throw securityProblem(409, 'already-member');
      const [existing] = await tx
        .select()
        .from(teamInvitations)
        .where(
          and(
            eq(teamInvitations.teamId, teamId),
            eq(teamInvitations.email, input.email),
            pending(),
          ),
        );
      if (existing) throw securityProblem(409, 'invitation-pending');
      await tx
        .delete(teamInvitations)
        .where(
          and(
            eq(teamInvitations.teamId, teamId),
            eq(teamInvitations.email, input.email),
            isNull(teamInvitations.acceptedAt),
            isNull(teamInvitations.cancelledAt),
            lte(teamInvitations.expiresAt, new Date()),
          ),
        );
      const [row] = await tx
        .insert(teamInvitations)
        .values({
          id: uuidv7(),
          teamId,
          ...input,
          tokenHash: hashToken(token),
          invitedBy: current.id,
          expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 86400000),
        })
        .returning();
      await limit.hit();
      return row!;
    });
    await enqueue({
      template: 'team-invitation',
      invitationId: invitation.id,
      to: invitation.email,
      link: new URL(
        `/invitations/accept?token=${token}`,
        config.PORTAL_PUBLIC_URL,
      ).href,
    });
    return reply.code(201).send(await invitationView(db, invitation));
  });
  server.delete(
    '/api/v1/teams/:teamId/invitations/:invitationId',
    async (request, reply) => {
      const current = await requireUser(auth, request);
      const { teamId, invitationId } = teamParams
        .extend({ invitationId: z.uuid() })
        .parse(request.params);
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock_shared(71833004)`);
        await teamAccess(tx, teamId, current.id, 'admin');
        const [row] = await tx
          .select()
          .from(teamInvitations)
          .where(
            and(
              eq(teamInvitations.id, invitationId),
              eq(teamInvitations.teamId, teamId),
            ),
          )
          .for('update');
        if (!row) throw notFound();
        if (row.acceptedAt) throw securityProblem(409, 'invitation-used');
        if (!row.cancelledAt)
          await tx
            .update(teamInvitations)
            .set({ cancelledAt: new Date() })
            .where(eq(teamInvitations.id, invitationId));
      });
      return reply.code(204).send();
    },
  );
  server.post('/api/v1/invitations/preview', async (request) => {
    const { token } = tokenSchema.parse(request.body);
    const [row] = await db
      .select()
      .from(teamInvitations)
      .where(eq(teamInvitations.tokenHash, hashToken(token)));
    if (!row) throw notFound();
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, row.teamId));
    const view = await invitationView(db, row);
    return {
      teamName: team!.name,
      role: row.role,
      email: row.email,
      invitedByName: view.invitedBy?.name ?? null,
      expiresAt: view.expiresAt,
      state: invitationState(row),
    };
  });
  server.post('/api/v1/invitations/accept', async (request) => {
    const current = await requireUser(auth, request);
    const { token } = tokenSchema.parse(request.body);
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock_shared(71833004)`);
      const [candidate] = await tx
        .select()
        .from(teamInvitations)
        .where(eq(teamInvitations.tokenHash, hashToken(token)));
      if (!candidate) throw notFound();
      // Same team lock order as member mutations and account deletion.
      await tx
        .select()
        .from(teams)
        .where(eq(teams.id, candidate.teamId))
        .for('update');
      const [row] = await tx
        .select()
        .from(teamInvitations)
        .where(eq(teamInvitations.id, candidate.id))
        .for('update');
      if (!row) throw notFound();
      const state = invitationState(row);
      if (state !== 'pending')
        throw securityProblem(
          409,
          state === 'accepted'
            ? 'invitation-used'
            : state === 'cancelled'
              ? 'invitation-cancelled'
              : 'invitation-expired',
        );
      const [recipient] = await tx
        .select()
        .from(user)
        .where(eq(user.id, current.id))
        .for('update');
      if (
        !recipient ||
        recipient.email.trim().toLowerCase() !== row.email.trim().toLowerCase()
      )
        throw securityProblem(409, 'invitation-wrong-account');
      await tx
        .insert(teamMembers)
        .values({ teamId: row.teamId, userId: current.id, role: row.role })
        .onConflictDoNothing();
      await selectTeam(tx, row.teamId, current.id);
      await tx
        .update(teamInvitations)
        .set({ acceptedAt: new Date(), acceptedBy: current.id })
        .where(eq(teamInvitations.id, row.id));
      await tx
        .update(user)
        .set({ emailVerified: true, updatedAt: new Date() })
        .where(eq(user.id, current.id));
      return summary(tx, row.teamId, current.id);
    });
  });
}
