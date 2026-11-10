// SPDX-License-Identifier: Apache-2.0
import PgBoss from 'pg-boss';
import { user, emailChangeRequests, type Database } from '@portal/db';
import { eq, and, gt } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.js';
import { encrypt, decrypt } from '../crypto.js';
import { createHash } from 'node:crypto';
import { effectiveSettings } from './settings.js';
import { sendMail } from './transport.js';
import { renderMail, type Template } from './templates.js';
export type MailPayload = {
  template: Exclude<Template, 'test'>;
  userId: string;
  to: string;
  link: string;
};
export type EnqueueMail = (payload: MailPayload) => Promise<void>;
export function mailQueue(config: Config, sharedBoss?: PgBoss): EnqueueMail {
  return async (payload) => {
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
          link: encrypt(payload.link, config.PORTAL_ENCRYPTION_KEY),
        },
        {
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
    await sendMail(
      settings,
      data.to,
      renderMail(data.template, {
        name: recipient.name,
        email: data.to,
        link,
        portalUrl: config.PORTAL_PUBLIC_URL,
      }),
    );
  } catch {
    log.warn(metadata, 'mail delivery failed');
    throw new Error('Mail delivery failed');
  }
}
