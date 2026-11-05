// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { DemoNotice } from './demo-notice';
import { QuickstartCommand } from './quickstart-command';
import { Header } from './header';
import { DemoReference } from './demo-reference';
import Catalog from '../app/page';
import ApiPage, { generateMetadata } from '../app/apis/[slug]/page';
import QuickstartRequired from '../app/quickstart-required/page';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { QUICKSTART_COMMAND, QUICKSTART_URL } from '../lib/demo';
const { scalar, serverClient } = vi.hoisted(() => ({
  scalar: vi.fn(),
  serverClient: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../lib/server', () => ({ serverClient, currentUser: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({}),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('./providers', () => ({ usePortal: () => ({ user: null }) }));
vi.mock('./reference', () => ({
  Scalar: (props: unknown) => {
    scalar(props);
    return <div>Reference</div>;
  },
  ReferenceBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it('shows the notice only in demo mode', () => {
  vi.stubEnv('PORTAL_DEMO_ACTIVE', 'false');
  const view = render(<DemoNotice />);
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  vi.stubEnv('PORTAL_DEMO_ACTIVE', 'true');
  view.rerender(<DemoNotice />);
  expect(screen.getByRole('region', { name: 'Demo notice' })).toHaveTextContent(
    'Sign-up, API keys, try-it and admin need the quickstart.',
  );
  expect(screen.getByRole('link')).toHaveAttribute('href', QUICKSTART_URL);
});
it('copies the command and announces the intended message', async () => {
  const user = userEvent.setup();
  const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  render(<QuickstartCommand />);
  await user.click(
    screen.getByRole('button', { name: 'Copy quickstart command' }),
  );
  expect(write).toHaveBeenCalledWith(QUICKSTART_COMMAND);
  expect(screen.getByText('Quickstart command copied.')).toBeInTheDocument();
});
it('leaves a manual copy instruction if clipboard access fails', async () => {
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
    new Error('blocked'),
  );
  render(<QuickstartCommand />);
  await user.click(
    screen.getByRole('button', { name: 'Copy quickstart command' }),
  );
  expect(
    screen.getByText(
      "Couldn't copy automatically. Select the command and copy it.",
    ),
  ).toBeInTheDocument();
});
it('replaces auth links in desktop and opened mobile navigation', async () => {
  vi.stubEnv('PORTAL_DEMO_ACTIVE', 'true');
  const user = userEvent.setup();
  render(<Header />);
  expect(
    screen.getAllByRole('link', { name: 'Run the quickstart' }),
  ).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Open menu' }));
  expect(
    screen.getByRole('navigation', { name: 'Mobile navigation' }),
  ).toHaveTextContent('Run the quickstart');
  expect(
    screen.queryByRole('link', { name: 'Sign in' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Sign up' }),
  ).not.toBeInTheDocument();
});
it('renders seeded catalog and reference without a server client', async () => {
  vi.stubEnv('PORTAL_DEMO_ACTIVE', 'true');
  vi.stubEnv(
    'PORTAL_DEMO_SAMPLE_API',
    JSON.stringify(
      parse(
        await readFile(
          resolve(process.cwd(), '../server/seed/sample-api.openapi.yaml'),
          'utf8',
        ),
      ),
    ),
  );
  const catalog = render(await Catalog());
  expect(screen.getByRole('link', { name: /Sample HTTP API/ })).toHaveAttribute(
    'href',
    '/apis/sample',
  );
  expect(screen.queryByText('How it works')).not.toBeInTheDocument();
  catalog.unmount();
  render(await ApiPage({ params: Promise.resolve({ slug: 'sample' }) }));
  expect(
    screen.getByRole('heading', { name: 'Sample HTTP API' }),
  ).toBeInTheDocument();
  expect(screen.getByText(/This reference is read-only/)).toBeInTheDocument();
  expect(screen.queryByText('Get an API key')).not.toBeInTheDocument();
  expect(serverClient).not.toHaveBeenCalled();
  expect(
    await generateMetadata({ params: Promise.resolve({ slug: 'sample' }) }),
  ).toEqual({ title: 'Sample HTTP API' });
});
it('rejects unknown demo APIs and labels their metadata', async () => {
  vi.stubEnv('PORTAL_DEMO_ACTIVE', 'true');
  await expect(
    ApiPage({ params: Promise.resolve({ slug: 'nope' }) }),
  ).rejects.toThrow('NEXT_NOT_FOUND');
  expect(
    await generateMetadata({ params: Promise.resolve({ slug: 'nope' }) }),
  ).toEqual({ title: 'API not found' });
  expect(serverClient).not.toHaveBeenCalled();
});
it('configures Scalar with inline content and all request paths disabled', () => {
  const document = { openapi: '3.0.3' };
  render(<DemoReference document={document} />);
  const { configuration } = scalar.mock.calls[0]![0];
  expect(configuration).toMatchObject({
    content: document,
    hideTestRequestButton: true,
    hideClientButton: true,
    showDeveloperTools: 'never',
    telemetry: false,
    agent: { disabled: true },
    withDefaultFonts: false,
    persistAuth: false,
  });
  expect(configuration).not.toHaveProperty('url');
  expect(configuration).not.toHaveProperty('proxyUrl');
  expect(configuration.customCss).toContain(
    '.scalar-reference-intro-auth, .scalar-reference-intro-server { display: none !important; }',
  );
});
it('only serves quickstart guidance in demo builds', () => {
  vi.stubEnv('PORTAL_DEMO_ACTIVE', 'false');
  expect(() => QuickstartRequired()).toThrow('NEXT_NOT_FOUND');
  vi.stubEnv('PORTAL_DEMO_ACTIVE', 'true');
  render(<QuickstartRequired />);
  expect(
    screen.getByRole('heading', { name: 'This feature needs the quickstart' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Go to APIs' })).toHaveAttribute(
    'href',
    '/',
  );
});
