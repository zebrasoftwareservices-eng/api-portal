// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminNav } from './admin-nav';
const mocks = vi.hoisted(() => ({
  path: '/admin/apis',
  role: 'admin',
  assign: vi.fn(),
  get: vi.fn().mockResolvedValue({ data: { items: [] } }),
}));
vi.mock('../lib/client', () => ({ api: { GET: mocks.get } }));
vi.mock('../lib/navigate', () => ({ assignLocation: mocks.assign }));
vi.mock('./providers', () => ({
  usePortal: () => ({ user: { role: mocks.role } }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.path,
}));
beforeEach(() => {
  mocks.assign.mockReset();
  mocks.path = '/admin/apis';
  mocks.role = 'admin';
});
const items = [
  ['/admin/apis', 'APIs'],
  ['/admin/products', 'Products'],
  ['/admin/requests', 'Requests'],
  ['/admin/insights', 'Insights'],
  ['/admin/tracing', 'Tracing'],
  ['/admin/gateways', 'Gateways'],
  ['/admin/settings/mail', 'Mail'],
  ['/admin/settings/accounts', 'Accounts'],
  ['/admin/theme', 'Theme'],
] as const;
describe('shared admin navigation', () => {
  it.each([...items, ['/admin/apis/api-id/versions', 'APIs'] as const])(
    'marks the current section on %s and offers every destination',
    (path, label) => {
      mocks.path = path;
      render(<AdminNav />);
      for (const [href, name] of items) {
        const link = screen.getByRole('link', { name });
        expect(link).toHaveAttribute('href', href);
        if (name === label)
          expect(link).toHaveAttribute('aria-current', 'page');
        else expect(link).not.toHaveAttribute('aria-current');
      }
      expect(
        screen.getByRole('combobox', { name: 'Admin section' }),
      ).toHaveValue(items.find(([, name]) => name === label)?.[0]);
    },
  );
  it('navigates between every section with the mobile select', async () => {
    mocks.path = '/admin/gateways';
    const actor = userEvent.setup();
    render(<AdminNav />);
    for (const [href, name] of items) {
      await actor.selectOptions(
        screen.getByRole('combobox', { name: 'Admin section' }),
        name,
      );
      expect(mocks.assign).toHaveBeenLastCalledWith(href);
    }
  });
  it('hides Theme, Insights and Tracing from a developer', () => {
    mocks.role = 'developer';
    mocks.path = '/admin/apis';
    render(<AdminNav />);
    expect(
      screen.queryByRole('link', { name: 'Theme' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Insights' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Tracing' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'APIs' })).toBeInTheDocument();
    mocks.role = 'admin';
  });
});

it('includes the pending request count in the navigation accessible name', async () => {
  mocks.get.mockResolvedValueOnce({
    data: { items: [{ id: 'one' }, { id: 'two' }] },
  });
  render(<AdminNav />);
  expect(
    await screen.findByRole('link', { name: 'Requests, 2 pending' }),
  ).toHaveAttribute('href', '/admin/requests');
});

it.each(['/admin/insights', '/admin/tracing'])(
  'hides admin navigation and does not fetch pending requests for non-admin visitors at %s',
  (path) => {
    mocks.path = path;
    mocks.role = 'developer';
    mocks.get.mockClear();
    render(<AdminNav />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
    mocks.role = 'admin';
  },
);
