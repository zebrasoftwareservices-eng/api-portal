// SPDX-License-Identifier: Apache-2.0
import type { Db } from '../app-plans.js';
import { jobDb } from '../job-db.js';
import PgBoss from 'pg-boss';
import {
  user,
  apps,
  plans,
  products,
  accessRequests,
  teamMembers,
  emailChangeRequests,
  teamInvitations,
  teams,
  type Database,
} from '@portal/db';
import { eq, and, gt, or } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.js';
import { encrypt, decrypt } from '../crypto.js';
import { createHash } from 'node:crypto';
import { effectiveSettings } from './settings.js';
import { sendMail } from './transport.js';
import { renderMail, type Template } from './templates.js';
export type MailPayload =
  | {
      template: Extract<
        Template,
        'verify' | 'reset-password' | 'confirm-email'
      >;
      userId: string;
      to: string;
      link: string;
    }
  | {
      template: 'team-invitation';
      invitationId: string;
      to: string;
      link: string;
    }
  | { template: 'access-approved' | 'access-rejected'; requestId: string }
  | {
      template: 'subscription-assigned' | 'subscription-revoked';
      appId: string;
    };
export type EnqueueMail = (
  payload: MailPayload,
  transaction?: Db,
) => Promise<void>;
export function mailQueue(config: Config, sharedBoss?: PgBoss): EnqueueMail {
  return async (payload, transaction) => {
    const boss =
      sharedBoss ??
      new PgBoss({
        connectionString: config.DATABASE_URL,
        deleteAfterSeconds: 3600,
        archiveCompletedAfterSeconds: 60,
        archiveFailedAfterSeconds: 60,
      });
    if (!sharedBoss) {
      await boss.start();
      await boss.createQueue('send-email');
    }
    try {
      await boss.send(
        'send-email',
        {
          ...payload,
          ...('link' in payload
            ? { link: encrypt(payload.link, config.PORTAL_ENCRYPTION_KEY) }
            : {}),
        },
        {
          db: transaction ? jobDb(transaction) : undefined,
          singletonKey:
            payload.template === 'subscription-revoked'
              ? `revoke-mail:${payload.appId}`
              : undefined,
          retryLimit: 5,
          retryBackoff: true,
          retryDelay: 5,
          retentionSeconds: 3600,
        },
      );
    } finally {
      if (!sharedBoss) await boss.stop();
    }
  };
}
export async function processMail(
  db: Database,
  config: Config,
  log: FastifyBaseLogger,
  job: { id: string; data: MailPayload },
) {
  const { data } = job;
  if ('requestId' in data || 'appId' in data) {
    await processAccessMail(db, config, log, job.id, data);
    return;
  }
  let rendered: ReturnType<typeof renderMail>;
  if (data.template === 'team-invitation') {
    const [invitation] = await db
      .select()
      .from(teamInvitations)
      .where(eq(teamInvitations.id, data.invitationId));
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.cancelledAt ||
      invitation.expiresAt <= new Date()
    )
      return;
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, invitation.teamId));
    const [inviter] = invitation.invitedBy
      ? await db.select().from(user).where(eq(user.id, invitation.invitedBy))
      : [];
    if (!team) return;
    const link = decrypt(data.link, config.PORTAL_ENCRYPTION_KEY);
    rendered = renderMail(data.template, {
      name: '',
      email: data.to,
      link,
      portalUrl: config.PORTAL_PUBLIC_URL,
      teamName: team.name,
      inviterName: inviter?.name ?? 'A team Admin',
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
    });
  } else {
    const [recipient] = await db
      .select()
      .from(user)
      .where(eq(user.id, data.userId));
    if (!recipient || (data.template === 'verify' && recipient.emailVerified))
      return;
    const link = decrypt(data.link, config.PORTAL_ENCRYPTION_KEY);
    if (data.template === 'confirm-email') {
      const token = new URL(link).searchParams.get('token') ?? '';
      const [pending] = await db
        .select()
        .from(emailChangeRequests)
        .where(
          and(
            eq(emailChangeRequests.userId, data.userId),
            eq(
              emailChangeRequests.tokenHash,
              createHash('sha256').update(token).digest('hex'),
            ),
            gt(emailChangeRequests.expiresAt, new Date()),
          ),
        );
      if (!pending) return;
    }
    rendered = renderMail(data.template, {
      name: recipient.name,
      email: data.to,
      link,
      portalUrl: config.PORTAL_PUBLIC_URL,
    });
  }
  const metadata = {
    jobId: job.id,
    template: data.template,
    domain: data.to.split('@').pop(),
  };
  const settings = await effectiveSettings(db, config);
  if (!settings) {
    log.warn(metadata, 'mail not configured');
    return;
  }
  try {
    await sendMail(settings, data.to, rendered);
  } catch {
    log.warn(metadata, 'mail delivery failed');
    throw new Error('Mail delivery failed');
  }
}

async function processAccessMail(
  db: Database,
  config: Config,
  log: FastifyBaseLogger,
  jobId: string,
  data: Extract<MailPayload, { requestId: string } | { appId: string }>,
) {
  let recipients: { name: string; email: string }[] = [];
  let teamId: string,
    planId: string,
    appName: string,
    link: string,
    note: string | null = null;
  if ('requestId' in data) {
    const [request] = await db
      .select()
      .from(accessRequests)
      .where(eq(accessRequests.id, data.requestId));
    if (!request || !request.decidedAt || !request.requestedBy) return;
    if (
      (data.template === 'access-approved') !==
      (request.status === 'approved')
    )
      return;
    recipients = await db
      .select({ name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, request.requestedBy));
    teamId = request.teamId;
    planId = request.planId;
    appName = request.name;
    note = request.decisionNote;
    link = new URL(
      data.template === 'access-approved' && request.appId
        ? `/dashboard/apps/${request.appId}`
        : '/dashboard',
      config.PORTAL_PUBLIC_URL,
    ).href;
  } else {
    const [app] = await db.select().from(apps).where(eq(apps.id, data.appId));
    if (
      !app ||
      (data.template === 'subscription-revoked' && app.status !== 'revoked')
    )
      return;
    teamId = app.teamId;
    planId = app.planId;
    appName = app.name;
    recipients = await db
      .select({ name: user.name, email: user.email })
      .from(teamMembers)
      .innerJoin(user, eq(user.id, teamMembers.userId))
      .where(and(eq(teamMembers.teamId, teamId), sqlWriteRole()));
    link = new URL(`/dashboard/apps/${app.id}`, config.PORTAL_PUBLIC_URL).href;
  }
  const [context] = await db
    .select({ planName: plans.name, productName: products.name })
    .from(plans)
    .innerJoin(products, eq(products.id, plans.productId))
    .where(eq(plans.id, planId));
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!context || !team) return;
  const settings = await effectiveSettings(db, config);
  if (!settings) {
    log.warn({ jobId, template: data.template }, 'mail not configured');
    return;
  }
  for (const recipient of recipients) {
    const rendered = renderMail(data.template, {
      ...recipient,
      ...context,
      appName,
      teamName: team.name,
      note,
      link,
      portalUrl: config.PORTAL_PUBLIC_URL,
    });
    try {
      await sendMail(settings, recipient.email, rendered);
    } catch {
      log.warn({ jobId, template: data.template }, 'mail delivery failed');
      throw new Error('Mail delivery failed');
    }
  }
}
function sqlWriteRole() {
  return or(eq(teamMembers.role, 'admin'), eq(teamMembers.role, 'member'));
}
