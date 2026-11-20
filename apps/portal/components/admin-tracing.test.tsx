// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AdminTracing,
  coversCopy,
  formatMs,
  TraceWaterfall,
  TracingSettingsDialog,
} from './admin-tracing';
import type { Trace, TracingState } from '../lib/tracing-api';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  latest: vi.fn(),
  save: vi.fn(),
  test: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  targets: vi.fn(),
}));
vi.mock('../lib/tracing-api', () => ({ tracingApi: mocks }));

const tracing: TracingState = {
  supported: true,
  configured: true,
  settings: {
    traceEndpoint: 'http://server:4000/api/v1/internal/traces/kong',
    instrumentations: ['request', 'router'],
    samplingRate: 1,
  },
  selections: [],
  lastTest: null,
  apply: { status: 'applied' },
};
const trace: Trace = {
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  startedAt: '2026-11-20T00:00:00Z',
  receivedAt: '2026-11-20T00:00:01Z',
  durationMs: 38.4,
  request: { method: 'GET', path: '/orders/42', statusCode: 200 },
  api: { id: 'api', slug: 'sample', name: 'Sample API' },
  spans: [
    {
      spanId: 'root',
      parentSpanId: null,
      name: 'kong',
      label: 'request',
      plugin: null,
      startOffsetMs: 0,
      durationMs: 38.4,
      status: 'ok',
      slowest: false,
    },
    {
      spanId: 'plugin',
      parentSpanId: 'root',
      name: 'kong.access.plugin.key-auth',
      label: 'plugin',
      plugin: 'key-auth',
      startOffsetMs: 0.6,
      durationMs: 21,
      status: 'ok',
      slowest: true,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue({ data: tracing });
  mocks.targets.mockResolvedValue({ data: { items: [] } });
  mocks.latest.mockResolvedValue({ data: { trace: null } });
});

it('shows the three tracing cards and the not-yet-traced state', async () => {
  render(<AdminTracing />);
  expect(
    await screen.findByRole('heading', { name: 'Kong settings' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: "What's traced" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Latest traced call' }),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Add an API, developer or team above, then make a call.'),
  ).toBeInTheDocument();
});

it('renders the focused admin-only state after a 403', async () => {
  mocks.get.mockResolvedValue({ error: { status: 403 } });
  render(<AdminTracing />);
  expect(
    await screen.findByRole('heading', {
      name: "You don't have access to Tracing",
    }),
  ).toHaveFocus();
  expect(screen.queryByText("What's traced")).not.toBeInTheDocument();
});

it('keeps Save enabled after a failed Test and shows cause-specific guidance', async () => {
  mocks.test.mockResolvedValue({
    error: {
      status: 422,
      cause: 'endpoint-unreachable',
      detail: 'probe timed out',
    },
  });
  render(
    <TracingSettingsDialog
      open
      tracing={tracing}
      onOpenChange={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Test' }));
  expect(
    await screen.findByText(/Kong can't reach the trace endpoint/),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  expect(screen.getByText(/You can still save/)).toBeInTheDocument();
});

describe('waterfall', () => {
  it('uses server labels, exposes timing as text, and marks the slowest span', () => {
    render(<TraceWaterfall trace={trace} />);
    expect(
      screen.getByRole('table', { name: /Spans of the latest traced call/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('key-auth')).toBeInTheDocument();
    expect(screen.getByText('21.0 ms')).toBeInTheDocument();
    expect(screen.getByText(/Slowest/)).toBeInTheDocument();
    expect(screen.getByText('kong.access.plugin.key-auth')).toBeInTheDocument();
  });

  it('formats timing at the specified precision', () => {
    expect(formatMs(0.42)).toBe('0.42 ms');
    expect(formatMs(21)).toBe('21.0 ms');
    expect(formatMs(184.2)).toBe('184 ms');
  });
});

it('isolates developer coverage copy for the created-app default', () => {
  expect(coversCopy('developer', 2)).toBe('2 apps they created');
  expect(coversCopy('developer', 0)).toMatch(/when they create one/);
});
