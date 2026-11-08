// SPDX-License-Identifier: Apache-2.0
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { Header } from './header';
const state = vi.hoisted(() => ({
  pathname: '/',
  user: null as null | { email: string; role: string },
  demo: false,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('./providers', () => ({ usePortal: () => ({ user: state.user }) }));
vi.mock('../lib/demo', () => ({
  isDemo: () => state.demo,
  QUICKSTART_URL: 'https://example.com/quickstart',
}));
beforeEach(() => {
  state.pathname = '/';
  state.user = null;
  state.demo = false;
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
  [
    '/dashboard/apps/one',
    { role: 'admin', email: 'admin@example.com' },
    ['APIs', 'My apps', 'Admin'],
    'My apps',
  ],
  [
    '/admin/apis',
    { role: 'admin', email: 'admin@example.com' },
    ['APIs', 'My apps', 'Admin'],
    'Admin',
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
