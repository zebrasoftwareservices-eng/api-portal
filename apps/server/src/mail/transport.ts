// SPDX-License-Identifier: Apache-2.0
import nodemailer from 'nodemailer';
import type { SmtpSettings } from './settings.js';
import { securityProblem } from '../security-problems.js';
export function smtpProblem(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? error.code
      : undefined;
  return securityProblem(
    422,
    code === 'EAUTH'
      ? 'smtp-auth-failed'
      : [
            'ECONNECTION',
            'ETIMEDOUT',
            'EDNS',
            'ESOCKET',
            'ETLS',
            'ABORT_ERR',
          ].includes(String(code))
        ? 'smtp-unreachable'
        : 'smtp-rejected',
  );
}
export async function sendMail(
  settings: SmtpSettings,
  to: string,
  message: { subject: string; text: string; html: string },
) {
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.security === 'tls',
    ignoreTLS: settings.security === 'none',
    requireTLS: settings.security === 'starttls',
    auth: settings.username
      ? { user: settings.username, pass: settings.password ?? '' }
      : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 5000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      transport.sendMail({
        from: { name: settings.senderName, address: settings.senderAddress },
        to,
        ...message,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          transport.close();
          reject({ code: 'ABORT_ERR' });
        }, 15000);
      }),
    ]);
  } catch (error) {
    throw smtpProblem(error);
  } finally {
    clearTimeout(timer);
    transport.close();
  }
}
