// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ForgotPassword,
  ResetPassword,
  ConfirmEmail,
} from './password-recovery';
import { SecretReplacementField, ResendVerification } from './account-shared';
import { AccountSettings } from './account-settings';
import { MailSettings } from './mail-settings';
import { Profile } from './profile';
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  reset: vi.fn(),
  verify: vi.fn(),
  change: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  setUser: vi.fn(),
  setReveal: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mocks.replace,
    refresh: mocks.refresh,
    push: mocks.push,
  }),
}));
vi.mock('../lib/client', () => ({
  auth: {
    requestPasswordReset: mocks.request,
    resetPassword: mocks.reset,
    sendVerificationEmail: mocks.verify,
    changePassword: mocks.change,
  },
  api: {
    GET: mocks.get,
    POST: mocks.post,
    PUT: mocks.put,
    PATCH: mocks.patch,
    DELETE: mocks.del,
  },
  quietApi: {
    GET: mocks.get,
    POST: mocks.post,
    PUT: mocks.put,
    PATCH: mocks.patch,
    DELETE: mocks.del,
  },
  retrySeconds: () => 120,
  networkProblem: () => ({
    type: '/problems/network',
    title: 'Connection failed',
    status: 0,
  }),
}));
vi.mock('./providers', () => ({
  usePortal: () => ({
    user: { id: 'u', name: 'Ana', email: 'ana@example.com' },
    setUser: mocks.setUser,
    setReveal: mocks.setReveal,
  }),
}));
const user = {
  id: 'u',
  name: 'Ana',
  email: 'ana@example.com',
  role: 'developer' as const,
  emailVerified: false,
  pendingEmail: null,
  verificationRequired: true,
};
const settings = {
  requireVerifiedEmail: false,
  mailConfigured: false,
  rateLimits: {
    signInFailures: { max: 10, windowMinutes: 15 },
    passwordResetEmails: { max: 3, windowMinutes: 60 },
    verificationEmails: { max: 3, windowMinutes: 60 },
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState({}, '', '/');
  mocks.get.mockImplementation((path: string) =>
    Promise.resolve({
      data:
        path === '/v1/me'
          ? user
          : path === '/v1/apps'
            ? { items: [] }
            : settings,
    }),
  );
});
describe('account security screens', () => {
  it.each([200, 429])(
    'uses the same reset confirmation on %s',
    async (status) => {
      mocks.request.mockResolvedValue(
        status === 200 ? {} : { error: { status } },
      );
      const actor = userEvent.setup();
      render(<ForgotPassword initialEmail="ana@example.com" />);
      await actor.click(
        screen.getByRole('button', { name: 'Send reset link' }),
      );
      expect(
        await screen.findByRole('heading', { name: 'Check your email' }),
      ).toHaveFocus();
      expect(screen.getByText(/If an account uses/)).toHaveTextContent(
        'ana@example.com',
      );
      expect(mocks.request).toHaveBeenCalledWith({
        email: 'ana@example.com',
        redirectTo: '/reset-password',
      });
      expect(screen.queryByText(/Too many/)).not.toBeInTheDocument();
    },
  );
  it('strips reset tokens, handles INVALID_TOKEN from POST and keeps the password unchanged', async () => {
    window.history.replaceState({}, '', '/reset-password?token=secret');
    mocks.reset.mockResolvedValue({
      error: { status: 400, code: 'INVALID_TOKEN' },
    });
    const actor = userEvent.setup();
    render(<ResetPassword initialToken="secret" />);
    expect(window.location.search).toBe('');
    await actor.type(screen.getByLabelText('New password'), 'new-password');
    await actor.click(screen.getByRole('button', { name: 'Change password' }));
    expect(
      await screen.findByRole('heading', { name: 'This link has expired' }),
    ).toHaveFocus();
    expect(
      screen.getByText(/Your password hasn't changed/),
    ).toBeInTheDocument();
  });
  it('requires a click to confirm an email and supports signed-out success', async () => {
    mocks.post.mockResolvedValue({
      data: { ...user, email: 'new@example.com' },
    });
    mocks.get.mockResolvedValue({ error: { status: 401 } });
    const actor = userEvent.setup();
    render(<ConfirmEmail initialToken="secret" />);
    expect(mocks.post).not.toHaveBeenCalled();
    await actor.click(
      screen.getByRole('button', { name: 'Confirm new email' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Email changed' }),
    ).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/sign-in',
    );
  });
  it('never masks or prefills the stored SMTP secret and supports replacement and removal', async () => {
    const changed = vi.fn();
    const actor = userEvent.setup();
    render(<SecretReplacementField hasSecret onChange={changed} />);
    expect(screen.getByText('A password is saved.')).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Password (optional)'),
    ).not.toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Replace password' }));
    expect(screen.getByLabelText('Password (optional)')).toHaveValue('');
    await actor.type(screen.getByLabelText('Password (optional)'), 'new');
    expect(changed).toHaveBeenLastCalledWith('new');
    await actor.click(
      screen.getByRole('button', { name: 'Keep saved password' }),
    );
    expect(changed).toHaveBeenLastCalledWith(undefined);
    await actor.click(screen.getByRole('button', { name: 'Remove password' }));
    expect(changed).toHaveBeenLastCalledWith(null);
  });
  it('disables resend until Retry-After after a 429', async () => {
    mocks.verify.mockResolvedValue({ error: { status: 429 } });
    const actor = userEvent.setup();
    render(<ResendVerification email="ana@example.com" />);
    await actor.click(
      screen.getByRole('button', { name: 'Send verification email' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Try again in 1 minutes' }),
    ).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      "You've asked for several emails",
    );
  });
  it('prevents requiring verification without mail and validates limits before saving', async () => {
    const actor = userEvent.setup();
    render(<AccountSettings />);
    expect(await screen.findByRole('switch')).toBeDisabled();
    const max = screen.getByLabelText('Failed sign-ins: maximum attempts');
    await actor.clear(max);
    await actor.type(max, '1001');
    await actor.click(
      screen.getByRole('button', { name: 'Save account settings' }),
    );
    expect(
      screen.getByText('Enter a number from 1 to 1000.'),
    ).toBeInTheDocument();
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it('shows environment values read-only and blocks a test with unsaved changes', async () => {
    mocks.get.mockResolvedValue({
      data: {
        source: 'environment',
        saved: null,
        environment: {
          host: 'mailpit',
          port: 1025,
          security: 'none',
          username: null,
          hasPassword: false,
          senderName: 'Portal',
          senderAddress: 'portal@example.com',
        },
      },
    });
    const actor = userEvent.setup();
    render(<MailSettings />);
    expect(
      await screen.findByText(
        "ⓘ Portal email uses the server's environment settings",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Host')).toHaveValue('');
    await actor.type(screen.getByLabelText('Host'), 'smtp.example.com');
    await actor.click(screen.getByRole('button', { name: 'Send test email' }));
    expect(mocks.post).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Send test email' }),
    ).toHaveAttribute('aria-disabled', 'true');
  });
  it.each(['environment', 'none', 'saved'] as const)(
    'clears the previous test result after settings update to %s',
    async (source) => {
      const smtp = {
        host: 'mailpit',
        port: 1025,
        security: 'none',
        username: null,
        hasPassword: true,
        senderName: 'Portal',
        senderAddress: 'portal@example.com',
      };
      mocks.get.mockResolvedValue({
        data: { source: 'saved', saved: smtp, environment: smtp },
      });
      mocks.post.mockResolvedValue({ data: { sent: true } });
      const updated = {
        source,
        saved: source === 'saved' ? { ...smtp } : null,
        environment: source === 'none' ? null : smtp,
      };
      mocks.del.mockResolvedValue({ data: updated });
      mocks.put.mockResolvedValue({ data: updated });
      const actor = userEvent.setup();
      render(<MailSettings />);
      await actor.click(
        await screen.findByRole('button', { name: 'Send test email' }),
      );
      const result = /Test email sent .* using the saved settings/;
      expect(await screen.findByText(result)).toBeInTheDocument();

      if (source === 'saved') {
        await actor.click(
          screen.getByRole('button', { name: 'Replace password' }),
        );
        await actor.type(
          screen.getByLabelText('Password (optional)'),
          'replacement',
        );
        await actor.click(
          screen.getByRole('button', { name: 'Save mail settings' }),
        );
        await waitFor(() => expect(mocks.put).toHaveBeenCalled());
      } else {
        await actor.click(
          screen.getByRole('button', { name: 'Remove saved settings' }),
        );
        await actor.click(
          screen.getByRole('button', { name: 'Remove settings' }),
        );
        await waitFor(() => expect(mocks.del).toHaveBeenCalled());
        expect(
          await screen.findByText(
            source === 'environment'
              ? "ⓘ Portal email uses the server's environment settings"
              : '⚠ Portal email is off',
          ),
        ).toBeInTheDocument();
      }
      await waitFor(() =>
        expect(screen.queryByText(result)).not.toBeInTheDocument(),
      );
      if (source !== 'none') {
        await actor.click(
          screen.getByRole('button', { name: 'Send test email' }),
        );
        expect(
          await screen.findByText(
            new RegExp(`Test email sent .* using the ${source} settings`),
          ),
        ).toBeInTheDocument();
      }
    },
  );
  it('changes the name through the SDK and updates the header state', async () => {
    mocks.patch.mockResolvedValue({ data: { ...user, name: 'Ana Silva' } });
    const actor = userEvent.setup();
    render(<Profile />);
    const name = await screen.findByLabelText('Name');
    await actor.clear(name);
    await actor.type(name, 'Ana Silva');
    await actor.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() =>
      expect(mocks.setUser).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Ana Silva' }),
      ),
    );
  });
  it('keeps the account deletion dialog open on gateway failure with safe initial focus', async () => {
    mocks.del.mockResolvedValue({
      error: {
        type: '/problems/gateway-unavailable',
        status: 503,
        title: 'Gateway unavailable',
        detail: 'Your account was not deleted.',
      },
      response: new Response(),
    });
    const actor = userEvent.setup();
    render(<Profile />);
    await screen.findByLabelText('Name');
    await actor.click(screen.getByRole('button', { name: 'Delete account…' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await actor.type(
      screen.getByLabelText('Password', { exact: true }),
      'password123',
    );
    await actor.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(
      await screen.findByText('Your account was not deleted.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

it.each([
  ['smtp-unreachable', "Can't reach the mail server"],
  ['smtp-auth-failed', 'The mail server rejected the sign-in'],
  ['smtp-rejected', 'The mail server refused the message'],
])(
  'shows the %s test-email refusal without reflecting the password',
  async (code, title) => {
    mocks.get.mockResolvedValue({
      data: {
        source: 'saved',
        saved: {
          host: 'smtp.example.com',
          port: 587,
          security: 'starttls',
          username: 'portal',
          hasPassword: true,
          senderName: 'Portal',
          senderAddress: 'portal@example.com',
        },
        environment: null,
      },
    });
    mocks.post.mockResolvedValue({
      error: {
        type: `/problems/${code}`,
        title,
        status: 422,
        detail: 'Check your mail settings and try again.',
      },
    });
    const actor = userEvent.setup();
    render(<MailSettings />);
    await actor.click(
      await screen.findByRole('button', { name: 'Send test email' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(title);
    expect(
      screen.queryByLabelText('Password (optional)'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('A password is saved.')).toBeInTheDocument();
  },
);
it('keeps the current email and uses neutral copy when an email change is refused', async () => {
  mocks.post.mockResolvedValue({
    error: {
      status: 409,
      type: '/problems/email-unavailable',
      title: "This address can't be used",
    },
    response: new Response(),
  });
  const actor = userEvent.setup();
  render(<Profile />);
  await screen.findByLabelText('Name');
  await actor.click(screen.getByRole('button', { name: 'Change email' }));
  await actor.type(screen.getByLabelText('New email'), 'taken@example.com');
  await actor.click(
    screen.getByRole('button', { name: 'Send confirmation link' }),
  );
  expect(
    await screen.findByText(
      "⚠ This address can't be used. Choose another one.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByText('ana@example.com')).toBeInTheDocument();
  expect(mocks.setUser).not.toHaveBeenCalled();
});
it('clears only the current password after INVALID_PASSWORD', async () => {
  mocks.change.mockResolvedValue({
    error: { status: 400, code: 'INVALID_PASSWORD' },
  });
  const actor = userEvent.setup();
  render(<Profile />);
  await screen.findByLabelText('Name');
  await actor.type(screen.getByLabelText('Current password'), 'incorrect');
  await actor.type(screen.getByLabelText('New password'), 'new-password');
  await actor.click(screen.getByRole('button', { name: 'Change password' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Current password')).toHaveValue(''),
  );
  expect(screen.getByLabelText('New password')).toHaveValue('new-password');
  expect(
    screen.getByText(
      '⚠ This password is incorrect. Your password is unchanged.',
    ),
  ).toBeInTheDocument();
});
