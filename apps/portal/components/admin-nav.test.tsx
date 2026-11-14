// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdminNav } from './admin-nav';
const mocks = vi.hoisted(() => ({
  path: '/admin/apis',
  push: vi.fn(),
  get: vi.fn().mockResolvedValue({ data: { items: [] } }),
}));
vi.mock('../lib/client', () => ({ api: { GET: mocks.get } }));
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.path,
  useRouter: () => ({ push: mocks.push }),
}));
const items = [
  ['/admin/apis', 'APIs'],
  ['/admin/products', 'Products'],
  ['/admin/requests', 'Requests'],
  ['/admin/gateways', 'Gateways'],
  ['/admin/settings/mail', 'Mail'],
  ['/admin/settings/accounts', 'Accounts'],
] as const;
describe('shared admin navigation', () => {
  it.each([...items, ['/admin/apis/api-id/versions', 'APIs'] as const])(
    'marks the current section on %s and offers all six destinations',
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
  it('navigates between all six sections with the mobile select', async () => {
    mocks.path = '/admin/gateways';
    const actor = userEvent.setup();
    render(<AdminNav />);
    for (const [href, name] of items) {
      await actor.selectOptions(
        screen.getByRole('combobox', { name: 'Admin section' }),
        name,
      );
      expect(mocks.push).toHaveBeenLastCalledWith(href);
    }
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
