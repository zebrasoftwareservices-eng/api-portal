// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { and, eq, gt, lt, sql, asc } from 'drizzle-orm';
import {
  accountSettings,
  rateLimitHits,
  emailChangeRequests,
  user,
  type Database,
} from '@portal/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { type Auth, requireUser } from './auth.js';
import { securityProblem } from './security-problems.js';
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type Bucket =
  | 'sign-in-failure'
  | 'password-reset'
  | 'verification-email'
  | 'team-invitation';
export const hashSubject = (subject: string) =>
  createHash('sha256').update(subject.trim().toLowerCase()).digest('hex');
export async function readAccountSettings(db: Database | Tx) {
  const [row] = await db.select().from(accountSettings);
  if (!row) throw new Error('Account settings missing');
  return row;
}
export async function limitLock(
  tx: Tx,
  bucket: Bucket,
  subject: string,
  reply: FastifyReply,
  clock?: Date,
) {
  const subjectHash = hashSubject(subject);
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${bucket + subjectHash},0))`,
  );
  const now = clock ?? new Date();
  const settings = await readAccountSettings(tx);
  const [max, minutes] =
    bucket === 'team-invitation'
      ? [20, 60]
      : bucket === 'sign-in-failure'
        ? [settings.signInFailureMax, settings.signInFailureWindowMinutes]
        : bucket === 'password-reset'
          ? [settings.resetEmailMax, settings.resetEmailWindowMinutes]
          : [
              settings.verificationEmailMax,
              settings.verificationEmailWindowMinutes,
            ];
  const hits = await tx
    .select({ createdAt: rateLimitHits.createdAt })
    .from(rateLimitHits)
    .where(
      and(
        eq(rateLimitHits.bucket, bucket),
        eq(rateLimitHits.subjectHash, subjectHash),
        gt(rateLimitHits.createdAt, new Date(now.getTime() - minutes * 60000)),
      ),
    )
    .orderBy(asc(rateLimitHits.createdAt));
  if (hits.length >= max) {
    reply.header('Retry-After', retryAfter(hits[0]!.createdAt, minutes, now));
    throw securityProblem(429, 'rate-limited');
  }
  return {
    subjectHash,
    hit: async () => {
      const id = uuidv7();
      await tx.insert(rateLimitHits).values({ id, bucket, subjectHash });
      return id;
    },
  };
}
export function retryAfter(
  oldest: Date,
  windowMinutes: number,
  now = new Date(),
) {
  return Math.max(
    1,
    Math.ceil(
      (oldest.getTime() + windowMinutes * 60000 - now.getTime()) / 1000,
    ),
  );
}
export async function housekeeping(db: Database) {
  await db
    .delete(rateLimitHits)
    .where(lt(rateLimitHits.createdAt, new Date(Date.now() - 86400000)));
  await db
    .delete(emailChangeRequests)
    .where(lt(emailChangeRequests.expiresAt, new Date()));
}
export async function limitedAuth(
  db: Database,
  auth: Auth,
  request: FastifyRequest,
  reply: FastifyReply,
  pathname: string,
  run: () => Promise<Response>,
): Promise<Response> {
  if (request.method !== 'POST') return run();
  // Use the resolved URL sent to Better Auth (dot segments already removed),
  // then drop empty segments as Better Auth's router does.
  const route = '/' + pathname.split('/').filter(Boolean).join('/');
  if (route === '/api/auth/forget-password')
    return new Response(null, { status: 404 });
  if (
    ![
      '/api/auth/sign-in/email',
      '/api/auth/request-password-reset',
      '/api/auth/send-verification-email',
      '/api/auth/change-password',
    ].includes(route)
  )
    return run();
  const body =
    request.body && typeof request.body === 'object'
      ? (request.body as Record<string, unknown>)
      : {};
  let bucket: Bucket, subject: string;
  if (route === '/api/auth/change-password') {
    const current = await requireUser(auth, request);
    subject = current.email;
    bucket = 'sign-in-failure';
    request.body = { ...body, revokeOtherSessions: true };
  } else if (route === '/api/auth/sign-in/email') {
    if (typeof body.email !== 'string') return run();
    subject = body.email;
    bucket = 'sign-in-failure';
  } else if (route === '/api/auth/request-password-reset') {
    if (typeof body.email !== 'string') return run();
    subject = body.email;
    bucket = 'password-reset';
  } else if (route === '/api/auth/send-verification-email') {
    if (typeof body.email !== 'string') return run();
    const [recipient] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, body.email.trim().toLowerCase()));
    if (!recipient) return run();
    subject = recipient.id;
    bucket = 'verification-email';
  } else return run();
  // Reserve before dispatch, then release the connection: Better Auth uses the
  // same pool and must never run while this transaction holds a connection.
  const hitId = await db.transaction(async (tx) => {
    const limit = await limitLock(tx, bucket, subject, reply);
    return limit.hit();
  });
  const response = await run();
  if (bucket === 'sign-in-failure') {
    const result = (await response
      .clone()
      .json()
      .catch(() => ({}))) as { code?: string };
    if (response.status !== 401 && result.code !== 'INVALID_PASSWORD') {
      await db.transaction(async (tx) => {
        const subjectHash = hashSubject(subject);
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${bucket + subjectHash},0))`,
        );
        // Success clears the address's failures; other non-password refusals
        // release only this request's reservation.
        await tx
          .delete(rateLimitHits)
          .where(
            response.ok
              ? and(
                  eq(rateLimitHits.bucket, bucket),
                  eq(rateLimitHits.subjectHash, subjectHash),
                )
              : eq(rateLimitHits.id, hitId),
          );
      });
    }
  }
  return response;
}
