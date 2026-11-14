// SPDX-License-Identifier: Apache-2.0
export type Template =
  | 'verify'
  | 'reset-password'
  | 'confirm-email'
  | 'test'
  | 'team-invitation'
  | 'access-approved'
  | 'access-rejected'
  | 'subscription-assigned'
  | 'subscription-revoked';
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export function renderMail(
  template: Template,
  data: {
    name: string;
    email: string;
    link: string;
    portalUrl: string;
    productName?: string;
    planName?: string;
    appName?: string;
    note?: string | null;
    teamName?: string;
    inviterName?: string;
    role?: string;
    expiresAt?: string;
    source?: string;
    adminEmail?: string;
  },
) {
  const host = new URL(data.portalUrl).host;
  const content = {
    'access-approved': {
      subject: `Access approved on ${host}`,
      body: `Your request for ${data.productName} / ${data.planName} was approved. Open ${data.appName} to reveal your API key.${data.note ? '\n\nNote from the administrator: ' + data.note : ''}`,
      label: 'Open subscription',
      footer: 'Your API key is available in the portal only.',
    },
    'access-rejected': {
      subject: `Access request rejected on ${host}`,
      body: `Your request for ${data.productName} / ${data.planName} was rejected.${data.note ? '\n\n' + data.note : ''}`,
      label: 'View requests',
      footer: 'Contact your portal administrator if you need help.',
    },
    'subscription-assigned': {
      subject: `Subscription assigned on ${host}`,
      body: `An administrator assigned ${data.appName} (${data.productName} / ${data.planName}) to ${data.teamName}. Open the subscription to reveal its API key.`,
      label: 'Open subscription',
      footer: 'Your API key is available in the portal only.',
    },
    'subscription-revoked': {
      subject: `Subscription revoked on ${host}`,
      body: `The subscription ${data.appName} (${data.productName} / ${data.planName}) for ${data.teamName} was revoked. Its API keys no longer work.`,
      label: 'Open subscription',
      footer: 'Contact your portal administrator if you need help.',
    },
    'team-invitation': {
      subject: `Join ${data.teamName} on ${host}`,
      body: `${data.inviterName} invited you to join ${data.teamName} as ${data.role}. Sign in or create an account with ${data.email} to accept.`,
      label: 'Accept invitation',
      footer: `This invitation expires at ${data.expiresAt}. If you were not expecting it, you can ignore this email.`,
    },
    verify: {
      subject: `Verify your email for ${host}`,
      body: `Hi ${data.name},\n\nConfirm that ${data.email} is your address for the developer portal at ${host}.`,
      label: 'Verify email address',
      footer:
        "The link works for 24 hours. If you didn't create an account, you can ignore this email.",
    },
    'reset-password': {
      subject: `Reset your password for ${host}`,
      body: `Someone asked to reset the password for ${data.email} on the developer portal at ${host}.`,
      label: 'Reset password',
      footer:
        "The link works once, for 1 hour. If you didn't ask for this, ignore this email. Your password stays the same.",
    },
    'confirm-email': {
      subject: `Confirm your new email for ${host}`,
      body: `Hi ${data.name},\n\nConfirm that you want to sign in to the developer portal at ${host} with ${data.email}.`,
      label: 'Confirm new email',
      footer:
        "The link works for 24 hours. Until you open it, you sign in with your current address. If you didn't ask for this, ignore this email and nothing changes.",
    },
    test: {
      subject: `Test email from ${host}`,
      body: `This is a test email from the developer portal at ${host}. If you can read it, the portal can send email with the ${data.source} mail settings.`,
      label: '',
      footer: `Sent by ${data.adminEmail} from the Mail settings page.`,
    },
  }[template];
  const text = [
    content.body,
    content.label ? `${content.label}\n${data.link}` : '',
    content.footer,
  ]
    .filter(Boolean)
    .join('\n\n');
  const html = `<div style="max-width:560px;margin:auto;font-family:system-ui;color:#18181b">${content.body
    .split('\n\n')
    .map((p) => `<p>${escape(p)}</p>`)
    .join(
      '',
    )}${content.label ? `<p><a style="background:#18181b;color:#fafafa;padding:12px 20px;display:inline-block" href="${escape(data.link)}">${content.label}</a></p><p><a href="${escape(data.link)}">${escape(data.link)}</a></p>` : ''}<p style="color:#71717a">${escape(content.footer)}</p></div>`;
  return { subject: content.subject, text, html };
}
