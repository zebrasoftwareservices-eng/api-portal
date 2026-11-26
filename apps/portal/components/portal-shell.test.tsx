// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { PublicNavigation } from '@portal/sdk';
import { DEFAULT_PUBLIC_NAVIGATION } from '../lib/portal-nav';
import { PortalShell } from './portal-shell';

const state = vi.hoisted(() => ({
  path: '/',
  user: null as null | { role: string; email: string },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => state.path,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('./providers', () => ({
  usePortal: () => ({ user: state.user, sessionState: state.user ? 'signed-in' : 'signed-out' }),
}));
vi.mock('../lib/client', () => ({
  api: { GET: vi.fn().mockResolvedValue({ data: { items: [] }, response: { status: 200 } }) },
}));
vi.mock('../lib/demo', () => ({ isDemo: () => false, QUICKSTART_URL: 'https://example.com/quickstart' }));

const saved: PublicNavigation = {
  isDefault: false,
  header: [{ kind: 'builtin', key: 'apis' }],
  footer: [
    { kind: 'page', label: 'Terms', href: '/pages/terms' },
    { kind: 'link', label: 'Bad', href: 'http://example.com' },
  ],
};

beforeEach(() => {
  state.path = '/';
  state.user = null;
});

it('keeps today\'s footer when navigation is the default', () => {
  render(<PortalShell navigation={DEFAULT_PUBLIC_NAVIGATION}><p>Home</p></PortalShell>);
  const footer = screen.getByText('Powered by Developer Portal · Apache 2.0').closest('footer');
  expect(footer).toHaveClass('container');
  expect(footer).not.toHaveClass('portal-footer');
  expect(screen.queryByRole('navigation', { name: 'Footer' })).not.toBeInTheDocument();
});

it('renders safe footer links and leaves them out of admin and setup', () => {
  const { rerender } = render(<PortalShell navigation={saved}><p>Home</p></PortalShell>);
  expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/pages/terms');
  expect(screen.queryByRole('link', { name: 'Bad' })).not.toBeInTheDocument();
  state.path = '/admin/pages';
  state.user = { role: 'admin', email: 'admin@example.com' };
  rerender(<PortalShell navigation={saved}><p>Admin</p></PortalShell>);
  expect(screen.queryByRole('navigation', { name: 'Footer' })).not.toBeInTheDocument();
  expect(screen.getByText('Powered by Developer Portal · Apache 2.0')).toBeInTheDocument();
  state.path = '/setup';
  rerender(<PortalShell navigation={saved}><p>Setup</p></PortalShell>);
  expect(screen.queryByRole('link', { name: 'Terms' })).not.toBeInTheDocument();
});
