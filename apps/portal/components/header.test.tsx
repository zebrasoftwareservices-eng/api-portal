// SPDX-License-Identifier: Apache-2.0
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { Header } from './header';
const state = vi.hoisted(() => ({
  pathname: '/',
  user: null as null | { email: string; role: string },
  demo: false,
  sessionState: 'signed-out',
}));
vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('./providers', () => ({
  usePortal: () => ({ user: state.user, sessionState: state.sessionState }),
}));
vi.mock('../lib/demo', () => ({
  isDemo: () => state.demo,
  QUICKSTART_URL: 'https://example.com/quickstart',
}));
beforeEach(() => {
  state.pathname = '/';
  state.user = null;
  state.demo = false;
  state.sessionState = 'signed-out';
});
it.each([
  ['/', null, ['APIs', 'Sign in', 'Sign up'], 'APIs'],
  [
    '/apis/orders',
    { role: 'developer', email: 'dev@example.com' },
    ['APIs', 'My apps'],
    'APIs',
  ],
  [
    '/dashboard',
    { role: 'developer', email: 'dev@example.com' },
    ['APIs', 'My apps'],
    'My apps',
  ],
] as const)(
  'uses consistent navigation on %s',
  (pathname, user, labels, current) => {
    state.pathname = pathname;
    state.user = user;
    render(<Header />);
    const nav = within(
      screen.getByRole('navigation', { name: 'Main navigation' }),
    );
    expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual(
      labels,
    );
    expect(nav.getByRole('link', { name: current })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  },
);
it('gives admins an account-only top bar without developer links', () => {
  state.user = { role: 'admin', email: 'admin@example.com' };
  render(<Header />);
  expect(screen.getByRole('navigation', { name: 'Admin account' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'My apps' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
});
it.each(['escape', 'close'] as const)(
  'starts on Close menu, traps focus and restores focus with %s',
  async (method) => {
    const user = userEvent.setup();
    state.user = { role: 'developer', email: 'dev@example.com' };
    render(<Header />);
    const trigger = screen.getByRole('button', { name: 'Open menu' });
    trigger.focus();
    await user.keyboard('{Enter}');
    const dialog = within(screen.getByRole('dialog'));
    const close = dialog.getByRole('button', { name: 'Close menu' });
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('dialog')).toContainElement(
      document.activeElement as HTMLElement,
    );
    await user.tab();
    expect(close).toHaveFocus();
    if (method === 'escape') await user.keyboard('{Escape}');
    else await user.click(close);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  },
);
it('keeps demo navigation limited to APIs and the quickstart', () => {
  state.demo = true;
  state.user = { role: 'developer', email: 'dev@example.com' };
  render(<Header />);
  expect(
    within(screen.getByRole('navigation'))
      .getAllByRole('link')
      .map((link) => link.textContent),
  ).toEqual(['APIs', 'Run the quickstart']);
});

it('JSO-191 shows public navigation without claiming a session during an outage', () => {
  state.sessionState = 'unknown';
  render(<Header />);
  expect(screen.getByRole('link', { name: 'APIs' })).toBeInTheDocument();
  expect(screen.queryByText('Sign in')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /Account menu/ }),
  ).not.toBeInTheDocument();
});
it('JSO-163 opens an accessible account menu and returns focus on Escape', async () => {
  const user = userEvent.setup();
  state.user = { role: 'developer', email: 'dev@example.com' };
  render(<Header />);
  const trigger = screen.getByRole('button', {
    name: 'Account menu for dev@example.com',
  });
  trigger.focus();
  await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(trigger).toHaveFocus();
});

vi.mock('../lib/client', () => {
  throw new Error('Sign-out chunk failed to load');
});
it('JSO-227 handles a failed sign-out import and closes the menu', async () => {
  const { toast } = await import('@portal/ui');
  const failure = vi.spyOn(toast, 'error');
  const user = userEvent.setup();
  state.user = { role: 'developer', email: 'dev@example.com' };
  render(<Header />);
  const trigger = screen.getByRole('button', {
    name: 'Account menu for dev@example.com',
  });
  await user.click(trigger);
  await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
  expect(failure).toHaveBeenCalledWith("We couldn't sign you out. Try again.");
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
