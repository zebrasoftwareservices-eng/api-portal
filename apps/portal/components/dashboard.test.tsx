// SPDX-License-Identifier: Apache-2.0
import { render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { Dashboard } from './dashboard';
import Page, { metadata } from '../app/dashboard/page';
import Loading from '../app/dashboard/loading';
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../lib/client', () => ({ api: { GET: get } }));
const apps = [
  {
    id: 'one',
    name: 'A'.repeat(80),
    subscriptions: [{ slug: 'orders', title: 'Orders API' }],
    credentials: [{ status: 'revoked' }],
    createdAt: '2026-11-01T00:00:00Z',
  },
  {
    id: 'two',
    name: 'Weather bot',
    subscriptions: [{ slug: 'weather', title: 'Weather API' }],
    credentials: [{ status: 'active' }],
    createdAt: '2026-11-02T00:00:00Z',
  },
  {
    id: 'three',
    name: 'Reporting',
    subscriptions: [{ slug: 'orders', title: 'Orders API' }],
    credentials: [],
    createdAt: '2026-11-03T00:00:00Z',
  },
];
beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ data: { items: apps } });
});
it('keeps the server problem title when loading apps fails outside admin import', async () => {
  get.mockResolvedValue({
    error: {
      type: '/problems/team-unavailable',
      title: 'Team unavailable',
      status: 503,
    },
  });
  render(<Dashboard />);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('⚠ Team unavailable');
  expect(alert).not.toHaveTextContent('Import failed');
});
it('keeps every app in order, highlights only matching apps, and shows the plan column', async () => {
  render(<Dashboard slug="orders" />);
  const table = within(await screen.findByRole('table', { name: 'My apps' }));
  expect(
    table.getAllByRole('columnheader').map((cell) => cell.textContent),
  ).toEqual(['Name', 'Plan', 'APIs', 'Active keys', 'Created']);
  const rows = table.getAllByRole('row').slice(1);
  expect(rows.map((row) => within(row).getByRole('link').textContent)).toEqual(
    apps.map((app) => app.name),
  );
  expect(rows[0]).toHaveTextContent('Has access to Orders API');
  expect(rows[0]).toHaveTextContent('None');
  expect(rows[1]).not.toHaveTextContent('Has access');
  expect(rows[2]).toHaveTextContent('Has access to Orders API');
  expect(table.getAllByText('Has access to Orders API')).toHaveLength(2);
  const cards = within(screen.getByRole('list'));
  const items = cards.getAllByRole('listitem');
  expect(items).toHaveLength(3);
  for (const [index, item] of items.entries()) {
    const card = within(item);
    expect(card.getByRole('heading', { level: 2 })).toHaveTextContent(
      apps[index]!.name,
    );
    expect(card.getAllByRole('link')).toHaveLength(1);
    expect(
      card.getByRole('link', { name: `Open app: ${apps[index]!.name}` }),
    ).toHaveAttribute('href', `/dashboard/apps/${apps[index]!.id}`);
    expect(card.getByText('Active keys')).toBeInTheDocument();
    expect(card.getByText('Created')).toBeInTheDocument();
  }
});
it.each([undefined, '', 'unknown'])(
  'shows the normal list with no label for %s',
  async (slug) => {
    render(<Dashboard slug={slug} />);
    await screen.findByRole('table');
    expect(screen.queryByText(/Has access/)).not.toBeInTheDocument();
  },
);
it('renders the My apps heading while loading and preserves empty and failure states', async () => {
  get.mockReturnValue(new Promise(() => {}));
  const view = render(<Dashboard />);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'My apps',
  );
  expect(screen.getByRole('status')).toHaveTextContent('Loading your apps…');
  view.unmount();
  get.mockResolvedValue({ data: { items: [] } });
  render(<Dashboard slug="orders" />);
  expect(await screen.findByText('Create your first app')).toBeInTheDocument();
});
it('reads only a single api query value and names the page and loading shell', async () => {
  expect(metadata.title).toBe('My apps');
  const element = await Page({
    searchParams: Promise.resolve({ api: ['orders', 'weather'] }),
  });
  expect(element.props.slug).toBeUndefined();
  expect(
    (await Page({ searchParams: Promise.resolve({ api: 'orders' }) })).props
      .slug,
  ).toBe('orders');
  render(<Loading />);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'My apps',
  );
});
