// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import VersionPage, {
  generateMetadata,
} from '../app/apis/[slug]/versions/[version]/page';
import Changelog from '../app/apis/[slug]/changelog/page';
import { demoData } from '../lib/demo-data';
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../lib/server', () => ({
  serverClient: async () => ({ GET: get }),
  currentUser: async () => null,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('./reference', () => ({
  Reference: ({ version }: { version: string }) => <p>Reference {version}</p>,
}));
vi.mock('./demo-reference', () => ({
  DemoReference: () => <p>Demo reference</p>,
}));
vi.mock('../lib/client', () => ({ quietApi: { GET: vi.fn() } }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const api = {
  slug: 'orders',
  title: 'Orders API',
  version: '2',
  gatewayBaseUrl: 'https://example.com',
  versions: [
    {
      version: '2',
      isLatest: true,
      publishedAt: '2026-11-08T00:00:00Z',
      documentUrl: '',
    },
    {
      version: '1',
      isLatest: false,
      publishedAt: '2026-11-07T00:00:00Z',
      documentUrl: '',
    },
  ],
};
it('shows the older version notice and the requested reference', async () => {
  get.mockImplementation((path: string) =>
    Promise.resolve({ data: path === '/v1/apis/{slug}' ? api : {} }),
  );
  render(
    await VersionPage({
      params: Promise.resolve({ slug: 'orders', version: '1' }),
    }),
  );
  expect(screen.getByText(/You're reading version 1/)).toHaveTextContent(
    'The latest is 2.',
  );
  expect(
    screen.getByRole('link', { name: 'View latest version' }),
  ).toHaveAttribute('href', '/apis/orders');
  expect(screen.getByText('Reference 1')).toBeVisible();
});
it.each(['missing', '%invalid'])(
  'returns not-found for unknown or malformed version %s',
  async (version) => {
    get.mockResolvedValue({ data: api });
    await expect(
      VersionPage({
        params: Promise.resolve({ slug: 'orders', version }),
      }),
    ).rejects.toThrow('NOT_FOUND');
  },
);
it('renders changelog in import order with plain notes and first-version copy', async () => {
  get.mockImplementation((path: string) =>
    Promise.resolve({
      data: path.endsWith('changelog')
        ? {
            items: [
              {
                version: '2',
                publishedAt: '2026-11-08T00:00:00Z',
                releaseNote: '<b>Release</b>',
                changes: null,
              },
              {
                version: '1',
                publishedAt: '2026-11-07T00:00:00Z',
                releaseNote: null,
                changes: null,
              },
            ],
          }
        : api,
    }),
  );
  render(await Changelog({ params: Promise.resolve({ slug: 'orders' }) }));
  expect(screen.getAllByRole('article')[0]).toHaveTextContent('<b>Release</b>');
  expect(screen.getByText('First version.')).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'View 1 reference' }),
  ).toHaveAttribute('href', '/apis/orders/versions/1');
});
it('serves demo changelog and version routes without server calls', async () => {
  vi.stubEnv('PORTAL_DEMO_ACTIVE', 'true');
  vi.stubEnv(
    'PORTAL_DEMO_SAMPLE_API',
    JSON.stringify({
      info: { title: 'Sample API', version: '1.0.0' },
      servers: [{ url: 'http://localhost:8000/sample' }],
    }),
  );
  expect(demoData().changelog).toHaveLength(1);
  render(await Changelog({ params: Promise.resolve({ slug: 'sample' }) }));
  expect(screen.getByText('First release of the sample API.')).toBeVisible();
  expect(get).not.toHaveBeenCalled();
  await expect(
    VersionPage({ params: Promise.resolve({ slug: 'sample', version: '2' }) }),
  ).rejects.toThrow('NOT_FOUND');
});

it.each(['1.0.0%2Bbuild.1', '1.0.0+build.1'])(
  'resolves the plus-version route %s to its published document',
  async (routeVersion) => {
    const version = '1.0.0+build.1';
    const plusApi = {
      ...api,
      versions: [...api.versions, { ...api.versions[1], version }],
    };
    get.mockImplementation((path: string) =>
      Promise.resolve({ data: path === '/v1/apis/{slug}' ? plusApi : {} }),
    );
    render(
      await VersionPage({
        params: Promise.resolve({ slug: 'orders', version: routeVersion }),
      }),
    );
    expect(screen.getByText(`Reference ${version}`)).toBeVisible();
    expect(get).toHaveBeenCalledWith(
      '/v1/apis/{slug}/versions/{version}/openapi.json',
      { params: { path: { slug: 'orders', version } } },
    );
    expect(
      await generateMetadata({
        params: Promise.resolve({ slug: 'orders', version: routeVersion }),
      }),
    ).toEqual({ title: `Orders API ${version}` });
  },
);
it('links the changelog plus-version entry to its encoded stable route', async () => {
  const version = '1.0.0+build.1';
  get.mockImplementation((path: string) =>
    Promise.resolve({
      data: path.endsWith('changelog')
        ? {
            items: [
              { version, publishedAt: '2026-11-08T00:00:00Z', changes: null },
            ],
          }
        : api,
    }),
  );
  render(await Changelog({ params: Promise.resolve({ slug: 'orders' }) }));
  expect(
    screen.getByRole('link', { name: `View ${version} reference` }),
  ).toHaveAttribute('href', '/apis/orders/versions/1.0.0%2Bbuild.1');
});
