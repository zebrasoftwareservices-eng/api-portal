// SPDX-License-Identifier: Apache-2.0
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { mailSettings, accountSettings, type Database } from '@portal/db';
import type { Config } from './config.js';
import { requireUser, type Auth } from './auth.js';
import { encrypt } from './crypto.js';
import {
  effectiveSettings,
  environmentSettings,
  settingsView,
} from './mail/settings.js';
import { renderMail } from './mail/templates.js';
import { sendMail } from './mail/transport.js';
import { readAccountSettings } from './auth-limits.js';
import { securityProblem } from './security-problems.js';
const mailSchema = z.strictObject({
  host: z.string().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  security: z.enum(['none', 'starttls', 'tls']),
  username: z.string().max(254).nullable().optional(),
  password: z.string().max(1024).nullable().optional(),
  senderName: z.string().min(1).max(100),
  senderAddress: z.email().max(254),
});
const limitSchema = z.strictObject({
  max: z.number().int().min(1).max(1000),
  windowMinutes: z.number().int().min(1).max(1440),
});
const accountsSchema = z.strictObject({
  requireVerifiedEmail: z.boolean(),
  rateLimits: z.strictObject({
    signInFailures: limitSchema,
    passwordResetEmails: limitSchema,
    verificationEmails: limitSchema,
  }),
});
export function registerAdminSettings(
  server: FastifyInstance,
  db: Database,
  auth: Auth,
  config: Config,
) {
  const mailView = async () => {
    const [saved] = await db.select().from(mailSettings);
    const environment = environmentSettings(config);
    return {
      source: saved ? 'saved' : environment ? 'environment' : 'none',
      saved: saved
        ? {
            host: saved.host,
            port: saved.port,
            security: saved.security,
            username: saved.username,
            hasPassword: !!saved.passwordCiphertext,
            senderName: saved.senderName,
            senderAddress: saved.senderAddress,
          }
        : null,
      environment: settingsView(environment),
      updatedAt: saved?.updatedAt.toISOString() ?? null,
    };
  };
  const accountsView = async () => {
    const s = await readAccountSettings(db);
    return {
      requireVerifiedEmail: s.requireVerifiedEmail,
      mailConfigured: !!(await effectiveSettings(db, config)),
      rateLimits: {
        signInFailures: {
          max: s.signInFailureMax,
          windowMinutes: s.signInFailureWindowMinutes,
        },
        passwordResetEmails: {
          max: s.resetEmailMax,
          windowMinutes: s.resetEmailWindowMinutes,
        },
        verificationEmails: {
          max: s.verificationEmailMax,
          windowMinutes: s.verificationEmailWindowMinutes,
        },
      },
    };
  };
  server.get('/api/v1/admin/settings/mail', async (request) => {
    await requireUser(auth, request, true);
    return mailView();
  });
  server.put('/api/v1/admin/settings/mail', async (request) => {
    const admin = await requireUser(auth, request, true);
    const input = mailSchema.parse(request.body);
    await db.transaction(async (tx) => {
      const [old] = await tx
        .select()
        .from(mailSettings)
        .where(eq(mailSettings.id, 1))
        .for('update');
      const { password, ...fields } = input;
      const values = {
        ...fields,
        username: fields.username ?? null,
        passwordCiphertext:
          password === undefined
            ? (old?.passwordCiphertext ?? null)
            : password === null
              ? null
              : encrypt(password, config.PORTAL_ENCRYPTION_KEY),
        updatedBy: admin.id,
        updatedAt: new Date(),
      };
      await tx
        .insert(mailSettings)
        .values({ id: 1, ...values })
        .onConflictDoUpdate({ target: mailSettings.id, set: values });
    });
    return mailView();
  });
  server.delete('/api/v1/admin/settings/mail', async (request) => {
    await requireUser(auth, request, true);
    await db.transaction(async (tx) => {
      await tx
        .select()
        .from(accountSettings)
        .where(eq(accountSettings.id, 1))
        .for('update');
      if (
        (await readAccountSettings(tx)).requireVerifiedEmail &&
        !environmentSettings(config)
      )
        throw securityProblem(409, 'mail-required');
      await tx.delete(mailSettings);
    });
    return mailView();
  });
  server.post('/api/v1/admin/settings/mail/test', async (request) => {
    const admin = await requireUser(auth, request, true);
    const { to } = z
      .strictObject({ to: z.email().max(254) })
      .parse(request.body);
    const settings = await effectiveSettings(db, config);
    if (!settings) throw securityProblem(409, 'mail-not-configured');
    const view = await mailView();
    await sendMail(
      settings,
      to,
      renderMail('test', {
        name: admin.name,
        email: to,
        link: '',
        portalUrl: config.PORTAL_PUBLIC_URL,
        source: view.source,
        adminEmail: admin.email,
      }),
    );
    return { to, source: view.source };
  });
  server.get('/api/v1/admin/settings/accounts', async (request) => {
    await requireUser(auth, request, true);
    return accountsView();
  });
  server.put('/api/v1/admin/settings/accounts', async (request) => {
    await requireUser(auth, request, true);
    const input = accountsSchema.parse(request.body);
    await db.transaction(async (tx) => {
      await tx
        .select()
        .from(accountSettings)
        .where(eq(accountSettings.id, 1))
        .for('update');
      // Lock shared with removal so requireVerifiedEmail cannot race away the last mail source.
      const [saved] = await tx.select().from(mailSettings);
      if (input.requireVerifiedEmail && !saved && !environmentSettings(config))
        throw securityProblem(409, 'mail-not-configured');
      const limits = input.rateLimits;
      await tx
        .update(accountSettings)
        .set({
          requireVerifiedEmail: input.requireVerifiedEmail,
          signInFailureMax: limits.signInFailures.max,
          signInFailureWindowMinutes: limits.signInFailures.windowMinutes,
          resetEmailMax: limits.passwordResetEmails.max,
          resetEmailWindowMinutes: limits.passwordResetEmails.windowMinutes,
          verificationEmailMax: limits.verificationEmails.max,
          verificationEmailWindowMinutes:
            limits.verificationEmails.windowMinutes,
          updatedAt: new Date(),
        })
        .where(eq(accountSettings.id, 1));
    });
    return accountsView();
  });
}
