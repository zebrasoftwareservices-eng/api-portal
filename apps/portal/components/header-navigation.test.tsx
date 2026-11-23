// SPDX-License-Identifier: Apache-2.0
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import type { PublicNavigation } from '@portal/sdk';
import { Header } from './header';

const state = vi.hoisted(() => ({
  pathname: '/',
  user: null as null | { email: string; role: string },
  sessionState: 'signed-out',
  demo: false,
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

const navigation: PublicNavigation = {
  isDefault: false,
  header: [
    { kind: 'link', label: 'Status', href: 'https://status.example' },
    { kind: 'builtin', key: 'apis' },
    { kind: 'page', label: 'Guide', href: '/pages/guide' },
    { kind: 'page', label: 'Terms', href: '/pages/terms' },
    { kind: 'link', label: 'Bad', href: 'javascript:alert(1)' },
    { kind: 'builtin', key: 'my-apps' },
    { kind: 'link', label: 'Blog', href: 'https://blog.example' },
  ],
  footer: [],
};

beforeEach(() => {
  state.pathname = '/';
  state.user = null;
  state.sessionState = 'signed-out';
  state.demo = false;
});

it('shows a saved header in order and hides My apps, unsafe URLs and the overflow', async () => {
  const user = userEvent.setup();
  render(<Header navigation={navigation} />);
  const nav = within(screen.getByRole('navigation', { name: 'Main navigation' }));
  expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual([
    'Status',
    'APIs',
    'Guide',
    'Sign in',
    'Sign up',
  ]);
  expect(screen.queryByRole('link', { name: 'Bad' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'My apps' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'More' }));
  expect(screen.getByRole('menuitem', { name: 'Blog' })).toHaveAttribute('href', 'https://blog.example');
});

it('marks the current page link and keeps My apps for a developer', () => {
  state.pathname = '/pages/guide';
  state.user = { role: 'developer', email: 'dev@example.com' };
  state.sessionState = 'signed-in';
  const shorter: PublicNavigation = {
    isDefault: false,
    header: [
      { kind: 'page', label: 'Guide', href: '/pages/guide' },
      { kind: 'builtin', key: 'apis' },
      { kind: 'builtin', key: 'my-apps' },
    ],
    footer: [],
  };
  render(<Header navigation={shorter} />);
  const nav = within(screen.getByRole('navigation', { name: 'Main navigation' }));
  expect(nav.getByRole('link', { name: 'Guide' })).toHaveAttribute('aria-current', 'page');
  expect(nav.getByRole('link', { name: 'My apps' })).toHaveAttribute('href', '/dashboard');
  expect(nav.getAllByRole('link').map((link) => link.textContent)?.slice(0, 3)).toEqual(['Guide', 'APIs', 'My apps']);
});

it('shows saved links to an admin outside the admin area and hides them inside it', () => {
  state.user = { role: 'admin', email: 'admin@example.com' };
  state.sessionState = 'signed-in';
  const { rerender } = render(<Header navigation={navigation} />);
  const links = within(screen.getByRole('navigation', { name: 'Portal links' }));
  expect(links.getByRole('link', { name: 'Guide' })).toBeInTheDocument();
  expect(links.queryByRole('link', { name: 'My apps' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  state.pathname = '/admin/pages';
  rerender(<Header navigation={navigation} />);
  expect(screen.queryByRole('navigation', { name: 'Portal links' })).not.toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Admin account' })).toBeInTheDocument();
});

it('keeps page links visible when the session is unknown', () => {
  state.sessionState = 'unknown';
  render(<Header navigation={navigation} />);
  expect(screen.getByRole('link', { name: 'Guide' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'My apps' })).not.toBeInTheDocument();
});
