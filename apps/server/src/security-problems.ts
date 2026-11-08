// SPDX-License-Identifier: Apache-2.0
import { Problem } from './problem.js';
export const securityCopy = {
  'email-not-verified': [
    'Verify your email address',
    'The portal admin requires a verified email address before you create apps or keys. Select Send verification email, then open the link we send you. Nothing was created.',
  ],
  'invalid-password': [
    'Incorrect password',
    'This password is incorrect. Nothing was changed.',
  ],
  'last-admin': [
    "You're the only admin",
    "You're the only admin of this portal, so your account can't be deleted. Make another account an admin first. Your account was not deleted.",
  ],
  'email-unavailable': [
    "Email address can't be used",
    "This address can't be used. Choose another one.",
  ],
  'link-expired': [
    'Link expired',
    'This link has expired or was already used. Nothing was changed. Request a new link.',
  ],
  'mail-required': [
    'Mail is required',
    '"Require a verified email" is on and the server has no environment mail settings, so removing these would stop all portal email. Turn off "Require a verified email" first, or set the SMTP_* environment variables.',
  ],
  'mail-not-configured': [
    'Set up mail first',
    'There are no mail settings, so nobody could receive a verification email. Save SMTP settings on the Mail page, then try again.',
  ],
  'smtp-unreachable': [
    "Can't reach the mail server",
    "The portal couldn't connect to the mail server. Check the host, port and security setting, and that the server allows connections from the portal.",
  ],
  'smtp-auth-failed': [
    'The mail server rejected the sign-in',
    "The mail server didn't accept the username and password. Check them and save again.",
  ],
  'smtp-rejected': [
    'The mail server refused the message',
    'The portal signed in, but the mail server refused the sender or recipient. Check that the sender address is allowed to send from this account.',
  ],
  'rate-limited': [
    'Too many requests',
    'Too many attempts in a short time. Try again later.',
  ],
} as const;
export function securityProblem(
  status: number,
  code: keyof typeof securityCopy,
) {
  return new Problem(status, code, securityCopy[code][1]);
}
