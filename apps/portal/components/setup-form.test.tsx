// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SetupForm } from './setup-form';
const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('../lib/client', () => ({
  api: { POST: mocks.post, GET: mocks.get },
  retrySeconds: () => 0,
  networkProblem: () => ({
    type: '/network',
    status: 0,
    title: 'Network unavailable',
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
async function fill() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), 'admin@example.com');
  await user.type(screen.getByLabelText('Password'), 'password123');
  return user;
}
describe('first admin setup', () => {
  beforeEach(() => vi.resetAllMocks());
  it('prevents native submissions before hydration', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <SetupForm setupTokenRequired={false} />,
    );
    expect(container.querySelector('fieldset')).toBeDisabled();
  });
  it('asks for a token only when required and preserves it after rejection', async () => {
    mocks.post.mockResolvedValue({
      error: {
        type: '/problems/setup-token-invalid',
        status: 403,
        title: 'Setup token not accepted',
        detail: 'No admin was created.',
      },
      response: new Response(null, { status: 403 }),
    });
    render(<SetupForm setupTokenRequired />);
    const user = await fill();
    expect(screen.getByLabelText('Setup token')).toHaveAttribute(
      'spellcheck',
      'false',
    );
    await user.type(screen.getByLabelText('Setup token'), 'wrong-token');
    await user.click(
      screen.getByRole('button', { name: 'Create admin account' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No admin was created.',
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Setup token')).toHaveFocus(),
    );
    expect(screen.getByLabelText('Setup token')).toHaveValue('wrong-token');
  });
  it.each([false, true])(
    'routes a new signed-in admin according to existing gateway: %s',
    async (exists) => {
      mocks.post.mockResolvedValue({ data: { role: 'admin' } });
      mocks.get.mockImplementation((path: string) =>
        Promise.resolve({
          data:
            path === '/v1/me'
              ? { role: 'admin' }
              : { items: exists ? [{ id: 'gw' }] : [] },
        }),
      );
      render(<SetupForm setupTokenRequired={false} />);
      const user = await fill();
      expect(screen.queryByLabelText('Setup token')).not.toBeInTheDocument();
      await user.click(
        screen.getByRole('button', { name: 'Create admin account' }),
      );
      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith(
          exists ? '/admin/apis' : '/setup/gateway',
        ),
      );
    },
  );
  it('replaces the form when another admin claimed setup first', async () => {
    mocks.post.mockResolvedValue({
      error: {
        type: '/problems/setup-complete',
        status: 409,
        title: 'This portal already has an admin',
      },
      response: new Response(null, { status: 409 }),
    });
    render(<SetupForm setupTokenRequired={false} />);
    const user = await fill();
    await user.click(
      screen.getByRole('button', { name: 'Create admin account' }),
    );
    expect(
      await screen.findByRole('link', { name: 'Sign in' }),
    ).toHaveAttribute('href', '/sign-in');
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });
});
