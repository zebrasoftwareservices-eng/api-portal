// SPDX-License-Identifier: Apache-2.0
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ApiDetail } from '../lib/types';
import { VersionRow } from './version-row';
import { AdminVersions } from './admin-versions';
import { ImportProblem, LintFindings, LintWarnings } from './lint-findings';
import { ChangeList } from './change-list';
import { PlainReleaseNote } from './release-note';
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('../lib/client', () => ({
  api: { GET: mocks.get, POST: mocks.post, PUT: mocks.put },
  networkProblem: () => ({
    type: '/network',
    status: 0,
    title: 'Network failure',
  }),
}));
const detail: ApiDetail = {
  products: [],
  id: 'api',
  slug: 'orders',
  title: 'Orders API',
  version: '2.0.0',
  gatewayBaseUrl: 'https://example.com/orders',
  publishedAt: '2026-11-08T00:00:00Z',
  documentUrl: '/api/v1/apis/orders/openapi.json',
  markdownUrl: '/api/v1/apis/orders/reference.md',
  downloadUrl: '/api/v1/apis/orders/spec',
  gatewayService: { id: 'svc', name: 'orders' },
  versions: [
    {
      version: '2.0.0',
      isLatest: true,
      publishedAt: '2026-11-08T00:00:00Z',
      documentUrl: '',
      markdownUrl: '/api/v1/apis/orders/versions/2.0.0/reference.md',
      downloadUrl: '/api/v1/apis/orders/versions/2.0.0/spec',
    },
    {
      version: '1.0.0+build.1',
      isLatest: false,
      publishedAt: '2026-11-07T00:00:00Z',
      documentUrl: '',
      markdownUrl: '/api/v1/apis/orders/versions/1.0.0%2Bbuild.1/reference.md',
      downloadUrl: '/api/v1/apis/orders/versions/1.0.0%2Bbuild.1/spec',
    },
  ],
};
const finding = {
  rule: 'invalid-ref',
  severity: 'error' as const,
  message: 'Reference is missing',
  pointer: '/paths/~1orders',
  line: 42,
  column: 9,
  source: 'https://example.com/common.yaml',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue({
    data: { gateway: { reachable: false }, lint: { status: 'ok' } },
  });
});
it('keeps server version order, marks latest/current, and encodes plus signs in real menu links', async () => {
  const user = userEvent.setup();
  render(<VersionRow api={detail} />);
  await user.click(
    screen.getByRole('button', { name: 'Version 2.0.0, latest' }),
  );
  const items = screen.getAllByRole('menuitem');
  expect(items[0]).toHaveAttribute('aria-current', 'page');
  expect(items[0]).toHaveAttribute('href', '/apis/orders');
  expect(items[1]).toHaveAttribute(
    'href',
    '/apis/orders/versions/1.0.0%2Bbuild.1',
  );
  await user.keyboard('{Escape}');
  expect(
    screen.getByRole('button', { name: 'Version 2.0.0, latest' }),
  ).toHaveFocus();
});
it('uses a badge for one version', () => {
  render(
    <VersionRow api={{ ...detail, versions: detail.versions.slice(0, 1) }} />,
  );
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByText('v2.0.0')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Changelog' })).toBeVisible();
});
it('shows all lint locations, external source, counts and expandable warnings', async () => {
  const user = userEvent.setup();
  render(
    <>
      <ImportProblem
        problem={{
          type: '/problems/openapi-lint-failed',
          status: 422,
          title: 'Lint failed',
          errorCount: 2,
          errors: [finding],
        }}
      />
      <LintWarnings findings={[{ ...finding, severity: 'warning' }]} />
    </>,
  );
  const alert = screen.getByRole('alert');
  expect(alert).toHaveFocus();
  expect(alert).toHaveTextContent('2 errors stop this document');
  expect(alert).toHaveTextContent('Line 42, column 9');
  expect(alert).toHaveTextContent(finding.pointer);
  expect(alert).toHaveTextContent(finding.source);
  expect(alert).toHaveTextContent('first 1 of 2');
  const summary = screen.getByText(/1 lint warning/);
  expect(summary.closest('details')).not.toHaveAttribute('open');
  await user.click(summary);
  expect(summary.closest('details')).toHaveAttribute('open');
});
it('reveals remaining findings and focuses the first new item', async () => {
  const user = userEvent.setup();
  render(
    <LintFindings
      severity="error"
      findings={Array.from({ length: 12 }, (_, i) => ({
        ...finding,
        message: `Finding ${i}`,
      }))}
    />,
  );
  expect(screen.queryByText('Finding 10')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Show all 12' }));
  await waitFor(() =>
    expect(screen.getByText('Finding 10').closest('li')).toHaveFocus(),
  );
});
it('publishes a patch without changing latest, retains warnings, resets fields and encodes View links', async () => {
  const user = userEvent.setup();
  const next = {
    ...detail,
    versions: [
      ...detail.versions,
      {
        version: '1.1.0',
        isLatest: false,
        publishedAt: '2026-11-08T00:00:00Z',
        documentUrl: '',
      },
    ],
  };
  mocks.post.mockResolvedValue({
    data: {
      api: next,
      version: { version: '1.1.0' },
      lintWarnings: [{ ...finding, severity: 'warning' }],
    },
  });
  render(
    <AdminVersions
      initial={detail}
      initialUrl="https://example.com/openapi.yaml"
    />,
  );
  expect(
    screen.getByRole('link', { name: 'View version 1.0.0+build.1' }),
  ).toHaveAttribute('href', '/apis/orders/versions/1.0.0%2Bbuild.1');
  await user.type(screen.getByLabelText('Release note (optional)'), 'Patch');
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Publish version' }));
  await waitFor(() =>
    expect(mocks.post).toHaveBeenCalledWith('/v1/admin/apis/{slug}/versions', {
      params: { path: { slug: 'orders' } },
      body: {
        spec: { url: 'https://example.com/openapi.yaml' },
        releaseNote: 'Patch',
        makeLatest: false,
      },
    }),
  );
  const status = await screen.findByRole('status');
  expect(status).toHaveTextContent('Developers still see 2.0.0 first.');
  expect(status).toHaveFocus();
  expect(screen.getByLabelText('Release note (optional)')).toHaveValue('');
  expect(screen.getByText(/1 lint warning/)).toBeVisible();
});
it.each([false, true])(
  'retains a pre-hydration file and applies the size limit (oversized: %s)',
  async (oversized) => {
    const user = userEvent.setup();
    const container = document.createElement('div');
    document.body.append(container);
    container.innerHTML = renderToString(<AdminVersions initial={detail} />);
    const input = within(container).getByLabelText('OpenAPI file');
    const content = '{"openapi":"3.0.3","info":{"version":"3.0.0"}}';
    const file = new File([content], 'before-hydration.json', {
      type: 'application/json',
    });
    const read = vi.fn().mockResolvedValue(content);
    Object.defineProperty(file, 'text', { value: read });
    if (oversized)
      Object.defineProperty(file, 'size', { value: 5 * 1024 * 1024 + 1 });
    // The browser populated the native input before React could see a change.
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [file],
    });
    mocks.post.mockResolvedValue({
      data: {
        api: { ...detail, version: '3.0.0' },
        version: { version: '3.0.0' },
        lintWarnings: [],
      },
    });
    let root!: ReturnType<typeof hydrateRoot>;
    try {
      await act(async () => {
        root = hydrateRoot(container, <AdminVersions initial={detail} />);
      });
      await user.click(
        within(container).getByRole('button', { name: 'Publish version' }),
      );
      if (oversized) {
        expect(
          within(container).getByText(
            /This document is larger than 5 MiB, the import limit\./,
          ),
        ).toBeVisible();
        expect(mocks.post).not.toHaveBeenCalled();
        expect(read).not.toHaveBeenCalled();
      } else {
        expect(await within(container).findByRole('status')).toHaveTextContent(
          'Published version 3.0.0',
        );
        expect(mocks.post).toHaveBeenCalledWith(
          '/v1/admin/apis/{slug}/versions',
          {
            params: { path: { slug: 'orders' } },
            body: { spec: { content }, makeLatest: true },
          },
        );
      }
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  },
);
it('sets latest and moves focus when the row action disappears', async () => {
  const user = userEvent.setup();
  mocks.put.mockResolvedValue({
    data: {
      ...detail,
      version: '1.0.0+build.1',
      versions: detail.versions.map((v) => ({
        ...v,
        isLatest: v.version !== '2.0.0',
      })),
    },
  });
  render(<AdminVersions initial={detail} />);
  await user.click(
    screen.getByRole('button', { name: 'Set 1.0.0+build.1 as latest' }),
  );
  const status = await screen.findByRole('status');
  expect(status).toHaveTextContent('1.0.0+build.1 is now the latest');
  expect(status).toHaveFocus();
  expect(
    screen.queryByRole('button', { name: 'Set 1.0.0+build.1 as latest' }),
  ).toBeNull();
});
it('keeps the form on duplicate version and does not offer retry for a broken ruleset', async () => {
  const user = userEvent.setup();
  mocks.post
    .mockResolvedValueOnce({
      error: {
        type: '/problems/api-version-exists',
        status: 409,
        title: 'api version exists',
        detail: 'This API already has version 2.0.0.',
      },
    })
    .mockResolvedValueOnce({
      error: {
        type: '/problems/lint-ruleset-unavailable',
        status: 503,
        title: 'Unavailable',
        detail: '/etc/rules.yaml failed',
      },
    });
  render(
    <AdminVersions
      initial={detail}
      initialUrl="https://example.com/openapi.yaml"
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Publish version' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'This version already exists',
  );
  expect(screen.getByRole('alert')).not.toHaveTextContent('api version exists');
  expect(screen.getByLabelText('Document URL')).toHaveValue(
    'https://example.com/openapi.yaml',
  );
  expect(screen.getByLabelText('Document URL')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await user.click(screen.getByRole('button', { name: 'Publish version' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Imports are paused'),
  );
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
});
it('renders operation changes and notes safely as plain text', () => {
  render(
    <>
      <PlainReleaseNote note={'<script>bad()</script>\n**release**'} />
      <ChangeList
        version="2"
        changes={{
          comparedTo: '1',
          breaking: true,
          added: [
            { method: 'POST', path: '/orders', breaking: false, reasons: [] },
          ],
          removed: [
            { method: 'GET', path: '/orders', breaking: true, reasons: [] },
          ],
          changed: [],
        }}
      />
    </>,
  );
  expect(screen.getByText(/<script>/)).toBeVisible();
  expect(document.querySelector('script')).toBeNull();
  expect(screen.getByRole('heading', { name: 'Added (1)' })).toBeVisible();
  expect(
    within(
      screen.getByRole('heading', { name: 'Removed (1)' }).parentElement!,
    ).getByText('⚠ Breaking'),
  ).toBeVisible();
});
