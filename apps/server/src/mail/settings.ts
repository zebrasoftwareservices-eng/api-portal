// SPDX-License-Identifier: Apache-2.0
import { mailSettings, type Database } from '@portal/db';
import type { Tx } from '../auth-limits.js';
import type { Config } from '../config.js';
import { decrypt } from '../crypto.js';
export interface SmtpSettings {
  host: string;
  port: number;
  security: string;
  username: string | null;
  password: string | null;
  senderName: string;
  senderAddress: string;
}
export function environmentSettings(c: Config): SmtpSettings | null {
  return c.SMTP_HOST && c.SMTP_SENDER_ADDRESS
    ? {
        host: c.SMTP_HOST,
        port: c.SMTP_PORT,
        security: c.SMTP_SECURITY,
        username: c.SMTP_USERNAME || null,
        password: c.SMTP_PASSWORD || null,
        senderName: c.SMTP_SENDER_NAME,
        senderAddress: c.SMTP_SENDER_ADDRESS,
      }
    : null;
}
export async function effectiveSettings(db: Database | Tx, config: Config) {
  const [saved] = await db.select().from(mailSettings);
  return saved
    ? {
        ...saved,
        password: saved.passwordCiphertext
          ? decrypt(saved.passwordCiphertext, config.PORTAL_ENCRYPTION_KEY)
          : null,
      }
    : environmentSettings(config);
}
export function settingsView(s: SmtpSettings | null) {
  if (!s) return null;
  return {
    host: s.host,
    port: s.port,
    security: s.security,
    username: s.username,
    hasPassword: !!s.password,
    senderName: s.senderName,
    senderAddress: s.senderAddress,
  };
}
