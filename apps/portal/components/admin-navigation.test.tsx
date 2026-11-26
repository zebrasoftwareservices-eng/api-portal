// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { AdminNavigation } from './admin-navigation';

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock('../lib/client', () => ({
  quietApi: { GET: mocks.get, PUT: mocks.put, DELETE: mocks.del },
}));

const settings = {
  isDefault: true,
  updatedAt: null,
  header: [
    { kind: 'builtin' as const, key: 'apis' as const, hidden: false },
    { kind: 'builtin' as const, key: 'my-apps' as const, hidden: false },
  ],
  footer: [],
};
const page = {
  id: '018f1a2a-7b3c-7d4e-8f5a-123456789abc',
  slug: 'getting-started',
  title: 'Getting started',
  visibility: 'public' as const,
  status: 'published' as const,
  navigation: [],
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-23T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockImplementation((path: string) => {
    if (path === '/v1/admin/pages') return Promise.resolve({ data: { items: [page] }, response: { status: 200 } });
    return Promise.resolve({ data: settings, response: { status: 200 } });
  });
  mocks.put.mockResolvedValue({ data: { ...settings, isDefault: false }, response: { status: 200 } });
});

it('starts from APIs and My apps and does not store an untouched default', async () => {
  const user = userEvent.setup();
  render(<AdminNavigation />);
  expect(await screen.findByText('No footer links.')).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Show APIs' })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Reset to default' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Save navigation' }));
  expect(screen.getAllByText('No changes to save.').length).toBeGreaterThan(0);
  expect(mocks.put).not.toHaveBeenCalled();
});

it('refuses a javascript URL, keeps the typed address, and does not save', async () => {
  const user = userEvent.setup();
  render(<AdminNavigation />);
  await screen.findByText('No footer links.');
  const header = screen.getByRole('region', { name: 'Header' });
  await user.click(within(header).getByRole('button', { name: 'Add external link' }));
  const row = within(header).getAllByRole('group').at(-1);
  if (!row) throw new Error('expected a new header link');
  const address = within(row).getByLabelText(/^Web address/);
  await user.type(within(row).getByLabelText(/^Label/), 'Bad');
  await user.type(address, 'javascript:alert(1)');
  await user.click(screen.getByRole('button', { name: 'Save navigation' }));
  expect(screen.getByRole('link', { name: /full https:\/\/ address/ })).toBeInTheDocument();
  expect(address).toHaveValue('javascript:alert(1)');
  expect(within(row).getByLabelText(/^Label/)).toHaveValue('Bad');
  expect(mocks.put).not.toHaveBeenCalled();
});

it('refuses an empty label and keeps the row', async () => {
  const user = userEvent.setup();
  render(<AdminNavigation />);
  await screen.findByText('No footer links.');
  const footer = screen.getByRole('region', { name: 'Footer' });
  await user.click(within(footer).getByRole('button', { name: 'Add external link' }));
  const label = within(footer).getByLabelText(/^Label/);
  await waitFor(() => expect(label).toHaveFocus());
  const address = within(footer).getByLabelText(/^Web address/);
  await user.type(address, 'https://example.com/docs');
  await user.click(screen.getByRole('button', { name: 'Save navigation' }));
  expect(screen.getByRole('link', { name: 'Footer link 1: Enter a label.' })).toBeInTheDocument();
  expect(address).toHaveValue('https://example.com/docs');
  expect(mocks.put).not.toHaveBeenCalled();
});

it('saves a reordered header and announces the move', async () => {
  const user = userEvent.setup();
  render(<AdminNavigation />);
  await screen.findByText('No footer links.');
  await user.click(screen.getByRole('button', { name: 'Move My apps up' }));
  expect(screen.getByText(/My apps moved to position 1 of 2 in the header/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Save navigation' }));
  expect(mocks.put).toHaveBeenCalledWith('/v1/admin/navigation', expect.objectContaining({
    body: expect.objectContaining({
      header: [
        { kind: 'builtin', key: 'my-apps', hidden: false },
        { kind: 'builtin', key: 'apis', hidden: false },
      ],
    }),
  }));
});
