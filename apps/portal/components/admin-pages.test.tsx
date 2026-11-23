// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { AdminPageEditor, AdminPages } from './admin-pages';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/pages',
}));
vi.mock('../lib/navigate', () => ({ assignLocation: vi.fn() }));
vi.mock('../lib/client', () => ({
  quietApi: { GET: mocks.get, POST: mocks.post, PUT: mocks.put, DELETE: mocks.del },
}));

const summary = {
  id: '018f1a2a-7b3c-7d4e-8f5a-123456789abc',
  slug: 'getting-started',
  title: 'Getting started',
  visibility: 'public' as const,
  status: 'published' as const,
  navigation: [{ area: 'header' as const, label: 'Start here' }, { area: 'footer' as const, label: 'Getting started' }],
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-23T00:00:00.000Z',
};
const detail = { ...summary, body: 'Hello', description: null, seoTitle: null, ogImageUrl: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockImplementation((path: string) => {
    if (path === '/v1/admin/pages') return Promise.resolve({ data: { items: [summary] }, response: { status: 200 } });
    return Promise.resolve({ data: detail, response: { status: 200 } });
  });
});

it('lists pages with status, audience and where they are linked', async () => {
  render(<AdminPages />);
  expect(await screen.findByRole('link', { name: 'Getting started' })).toHaveAttribute('href', `/admin/pages/${summary.id}`);
  expect(screen.getByText('Published')).toBeInTheDocument();
  expect(screen.getByText('Header, Footer')).toBeInTheDocument();
  expect(screen.getByText('●')).toHaveAttribute('aria-hidden', 'true');
});

it('shows the empty state when there are no pages', async () => {
  mocks.get.mockResolvedValue({ data: { items: [] }, response: { status: 200 } });
  render(<AdminPages />);
  expect(await screen.findByRole('heading', { name: 'No pages yet' })).toBeInTheDocument();
});

it('fills the slug from the title and keeps an invalid slug without saving', async () => {
  const user = userEvent.setup();
  render(<AdminPageEditor />);
  await user.type(screen.getByLabelText('Title'), 'Getting started');
  expect(screen.getByLabelText('Slug')).toHaveValue('getting-started');
  await user.clear(screen.getByLabelText('Slug'));
  await user.type(screen.getByLabelText('Slug'), 'Bad Slug');
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(screen.getByLabelText('Slug')).toHaveValue('Bad Slug');
  expect(screen.getByRole('link', { name: /lowercase letters/ })).toBeInTheDocument();
  expect(mocks.post).not.toHaveBeenCalled();
});

it('names header and footer links before unpublishing and always asks before delete', async () => {
  const user = userEvent.setup();
  mocks.get.mockResolvedValue({ data: detail, response: { status: 200 } });
  render(<AdminPageEditor pageId={detail.id} />);
  await user.click(await screen.findByRole('button', { name: 'Unpublish' }));
  expect(await screen.findByText('Header: Start here')).toBeInTheDocument();
  expect(screen.getByText('Footer: Getting started')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  mocks.get.mockResolvedValue({ data: { ...detail, navigation: [] }, response: { status: 200 } });
  await user.click(screen.getByRole('button', { name: 'Delete page' }));
  expect(await screen.findByRole('heading', { name: 'Delete “Getting started”?' })).toBeInTheDocument();
  expect(screen.queryByText(/These links disappear/)).not.toBeInTheDocument();
});
