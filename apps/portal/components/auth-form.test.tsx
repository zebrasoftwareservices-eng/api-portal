// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthForm } from './auth-form';
const mocks = vi.hoisted(() => ({
  signup: vi.fn(),
  signin: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  get: vi.fn(),
}));
vi.mock('../lib/client', () => ({
  api: { GET: mocks.get },
  auth: { signUp: { email: mocks.signup }, signIn: { email: mocks.signin } },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
describe('account forms', () => {
  beforeEach(() => vi.resetAllMocks());
  it.each(['sign-up', 'sign-in'] as const)(
    'keeps %s inert until hydration attaches its submit handler',
    (mode) => {
      const container = document.createElement('div');
      container.innerHTML = renderToString(<AuthForm mode={mode} />);
      document.body.append(container);
      const fieldset = container.querySelector('fieldset')!;
      expect(fieldset).toBeDisabled();
      for (const input of container.querySelectorAll('input'))
        expect(input).toBeDisabled();
      expect(container.querySelector('button[type=submit]')).toBeDisabled();
      render(<AuthForm mode={mode} />, { container, hydrate: true });
      expect(fieldset).not.toBeDisabled();
      expect(container.querySelector('button[type=submit]')).toBeEnabled();
    },
  );
  it('validates without calling auth and keeps the continuation for existing accounts', async () => {
    const user = userEvent.setup();
    render(<AuthForm mode="sign-up" next="/dashboard/apps/new?api=sample" />);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(mocks.signup).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await user.type(screen.getByLabelText('Name'), 'Ana');
    await user.type(screen.getByLabelText('Email'), 'ana@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    mocks.signup.mockResolvedValue({
      error: { code: 'USER_ALREADY_EXISTS', status: 422 },
    });
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(
      await screen.findByRole('link', { name: 'Sign in instead' }),
    ).toHaveAttribute(
      'href',
      '/sign-in?next=%2Fdashboard%2Fapps%2Fnew%3Fapi%3Dsample',
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });
  it.each(['sign-up', 'sign-in'] as const)(
    'preserves %s values after a server failure and permits a clean retry',
    async (mode) => {
      const user = userEvent.setup();
      const submitAuth = mode === 'sign-up' ? mocks.signup : mocks.signin;
      submitAuth
        .mockRejectedValueOnce(new TypeError('Network unavailable'))
        .mockResolvedValueOnce({ data: { user: { id: 'user' } } });
      render(<AuthForm mode={mode} />);
      if (mode === 'sign-up')
        await user.type(screen.getByLabelText('Name'), 'Ana');
      await user.type(screen.getByLabelText('Email'), 'ana@example.com');
      await user.type(screen.getByLabelText('Password'), 'password123');
      const submit = screen.getByRole('button', {
        name: mode === 'sign-up' ? 'Create account' : 'Sign in',
      });
      await user.click(submit);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        "Can't reach the portal server. Check your connection and try again.",
      );
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Email')).toHaveValue('ana@example.com');
      expect(screen.getByLabelText('Password')).toHaveValue('password123');
      if (mode === 'sign-up')
        expect(screen.getByLabelText('Name')).toHaveValue('Ana');
      expect(submit).toBeEnabled();
      await user.click(submit);
      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith('/dashboard'),
      );
      expect(submitAuth).toHaveBeenCalledTimes(2);
      expect(submitAuth).toHaveBeenLastCalledWith({
        ...(mode === 'sign-up' ? { name: 'Ana' } : {}),
        email: 'ana@example.com',
        password: 'password123',
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );
  it('does not redirect off origin after signing in', async () => {
    const user = userEvent.setup();
    mocks.signin.mockResolvedValue({ data: { user: { id: 'user' } } });
    render(<AuthForm mode="sign-in" next="//evil.example" />);
    await user.type(screen.getByLabelText('Email'), 'ana@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/dashboard'),
    );
  });
  it.each([false, true])(
    'lands an admin without a next target according to gateway presence: %s',
    async (exists) => {
      mocks.signin.mockResolvedValue({
        data: { user: { id: 'admin', role: 'admin' } },
      });
      mocks.get.mockResolvedValue({
        data: { items: exists ? [{ id: 'gw' }] : [] },
      });
      render(<AuthForm mode="sign-in" />);
      const user = userEvent.setup();
      await user.type(screen.getByLabelText('Email'), 'admin@example.com');
      await user.type(screen.getByLabelText('Password'), 'password123');
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith(
          exists ? '/dashboard' : '/setup/gateway',
        ),
      );
    },
  );
});
