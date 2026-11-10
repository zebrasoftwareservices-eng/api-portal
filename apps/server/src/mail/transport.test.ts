// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  close: vi.fn(),
  createTransport: vi.fn(),
}));
vi.mock('nodemailer', () => ({
  default: { createTransport: mocks.createTransport },
}));
import { sendMail, smtpProblem } from './transport.js';
import { renderMail } from './templates.js';
import { retryAfter, hashSubject } from '../auth-limits.js';
describe('SMTP boundary', () => {
  it.each(['ECONNECTION', 'ETIMEDOUT', 'EDNS', 'ESOCKET', 'ETLS', 'ABORT_ERR'])(
    'maps %s without leaking replies',
    (code) => {
      const p = smtpProblem({ code, message: 'password=secret' });
      expect(p.code).toBe('smtp-unreachable');
      expect(p.message).not.toContain('secret');
    },
  );
  it('maps authentication and message errors', () => {
    expect(smtpProblem({ code: 'EAUTH' }).code).toBe('smtp-auth-failed');
    expect(smtpProblem({ code: 'EENVELOPE' }).code).toBe('smtp-rejected');
  });
  it.each(['none', 'starttls', 'tls'])(
    'sets %s security and disables transport logs',
    async (security) => {
      mocks.createTransport.mockReturnValue({
        sendMail: mocks.sendMail.mockResolvedValue({}),
        close: mocks.close,
      });
      await sendMail(
        {
          host: 'localhost',
          port: 1025,
          security,
          username: null,
          password: null,
          senderName: 'Portal',
          senderAddress: 'portal@example.com',
        },
        'to@example.com',
        { subject: 'test', text: 'hello', html: '<p>hello</p>' },
      );
      expect(mocks.createTransport).toHaveBeenLastCalledWith(
        expect.objectContaining({
          secure: security === 'tls',
          ignoreTLS: security === 'none',
          requireTLS: security === 'starttls',
          connectionTimeout: 10000,
          greetingTimeout: 5000,
          socketTimeout: 15000,
          logger: false,
          debug: false,
        }),
      );
    },
  );
  it('enforces an overall 15 second deadline', async () => {
    vi.useFakeTimers();
    mocks.createTransport.mockReturnValue({
      sendMail: () => new Promise(() => {}),
      close: mocks.close,
    });
    const result = sendMail(
      {
        host: 'localhost',
        port: 1025,
        security: 'none',
        username: null,
        password: null,
        senderName: 'Portal',
        senderAddress: 'portal@example.com',
      },
      'to@example.com',
      { subject: 'test', text: 'hello', html: 'hello' },
    );
    const assertion = expect(result).rejects.toMatchObject({
      code: 'smtp-unreachable',
    });
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
    vi.useRealTimers();
  });
  it('escapes user supplied HTML in all templates', () => {
    for (const template of [
      'verify',
      'reset-password',
      'confirm-email',
      'test',
    ] as const) {
      const mail = renderMail(template, {
        name: '<script>bad</script>',
        email: 'person@example.com',
        link: 'https://portal.example/verify?token=test&other=1',
        portalUrl: 'https://portal.example',
        source: 'saved',
        adminEmail: 'admin@example.com',
      });
      expect(mail.html).not.toContain('<script>');
      expect(mail.subject).toContain('portal.example');
      expect(mail.text).toBeTruthy();
    }
  });
});
it('computes Retry-After at the window boundary and normalizes subjects', () => {
  const now = new Date('2026-01-01T00:01:00Z');
  expect(retryAfter(new Date('2026-01-01T00:00:00Z'), 15, now)).toBe(840);
  expect(retryAfter(new Date('2025-12-31'), 1, now)).toBe(1);
  expect(hashSubject(' PERSON@example.COM ')).toBe(
    hashSubject('person@example.com'),
  );
});
