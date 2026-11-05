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
}));
vi.mock('../lib/client', () => ({
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
});
