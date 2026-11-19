// SPDX-License-Identifier: Apache-2.0
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminSidebar } from './admin-sidebar';
import { AdminApps } from './admin-apps';
import { AdminAppDetail } from './admin-app-detail';
const mocks = vi.hoisted(() => ({ get: vi.fn(), pathname: '/admin/apps' }));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('../lib/client', () => ({
  api: { GET: mocks.get },
  networkProblem: () => ({ type: '/network', title: 'Network error', status: 0 }),
}));
vi.mock('../lib/navigate', () => ({ assignLocation: vi.fn() }));
describe('admin shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = '/admin/apps';
    mocks.get.mockImplementation((path: string) => Promise.resolve({ data: path.includes('access-requests') ? { items: [{ id: '1' }, { id: '2' }] } : { items: [], nextCursor: null } }));
  });
  it('renders the ordered sidebar, pending count, and longest current match', async () => {
    render(<AdminSidebar />);
    const nav = screen.getByRole('navigation', { name: 'Admin' });
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['APIs', 'Products', 'Apps', 'Requests', 'Insights']);
    expect(within(nav).getByRole('link', { name: 'Apps' })).toHaveAttribute('aria-current', 'page');
    expect(await within(nav).findByRole('link', { name: 'Requests, 2 pending' })).toHaveTextContent('2');
    expect(within(nav).getByRole('button', { name: 'Admin' })).toHaveAttribute('aria-expanded', 'false');
  });
  it('expands the Admin group on child pages', async () => {
    mocks.pathname = '/admin/settings/accounts';
    render(<AdminSidebar />);
    expect(screen.getByRole('button', { name: 'Admin' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Accounts' })).toHaveAttribute('aria-current', 'page');
  });
  it('shows key hints and never renders key material on the app list', async () => {
    mocks.get.mockResolvedValue({ data: { items: [{ id: 'app', name: 'checkout', status: 'active', team: { id: 'team', name: 'Platform', personal: false }, owner: { id: 'user', name: 'Ana', email: 'ana@example.com', role: 'admin' }, plan: { id: 'plan', name: 'Free', builtin: false, product: { id: 'product', slug: 'payments', name: 'Payments' }, rateLimit: null, rateLimitUnit: null, monthlyQuota: null }, activeKeyHints: ['9fQa'], createdAt: '2026-11-18T00:00:00Z' }], nextCursor: null } });
    render(<AdminApps />);
    expect(await screen.findByText('…9fQa')).toBeInTheDocument();
    expect(screen.getByText('Portal admin')).toBeInTheDocument();
    expect(screen.queryByText(/pk_/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View checkout (Platform)' })).toHaveAttribute('href', '/admin/apps/app');
  });
  it('keeps another team app read-only and sends revocation to product access', async () => {
    mocks.get.mockResolvedValue({
      data: {
        id: 'app',
        name: 'checkout',
        status: 'active',
        team: { id: 'team', name: 'Platform', personal: false },
        owner: { id: 'user', name: 'Ana', email: 'ana@example.com', role: 'developer' },
        plan: {
          id: 'plan',
          name: 'Free',
          builtin: false,
          product: { id: 'product', slug: 'payments', name: 'Payments' },
          rateLimit: null,
          rateLimitUnit: null,
          monthlyQuota: null,
        },
        activeKeyHints: ['9fQa'],
        credentials: [{
          id: 'credential',
          kind: 'key-auth',
          keyHint: '9fQa',
          status: 'active',
          createdAt: '2026-11-18T00:00:00Z',
          revokedAt: null,
        }],
        subscriptions: [{ apiId: 'api', slug: 'orders', title: 'Orders' }],
        origin: 'developer',
        keyIssued: true,
        description: null,
        revokedAt: null,
        createdAt: '2026-11-18T00:00:00Z',
      },
    });
    render(<AdminAppDetail appId="app" />);
    expect(await screen.findByText('…9fQa')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Manage access/ })).toHaveAttribute(
      'href',
      '/admin/products/payments',
    );
    for (const action of ['Reveal', 'Regenerate', 'Create key', 'Cancel subscription'])
      expect(screen.queryByText(action, { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText(/revoke it on the product.s access screen/i)).toBeInTheDocument();
  });
});
