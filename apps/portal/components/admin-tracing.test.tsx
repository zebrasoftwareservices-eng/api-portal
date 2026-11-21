// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AdminTracing,
  coversCopy,
  formatMs,
  LatestTraceCard,
  TraceWaterfall,
  TracingSelections,
  TracingSettingsCard,
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
  mocks.latest.mockResolvedValue({ data: { trace: null, apis: [] } });
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

it('defaults to the most recently traced API and fetches the API the admin picks', async () => {
  const olderTrace: Trace = {
    ...trace,
    traceId: 'older',
    receivedAt: '2026-11-20T00:00:00Z',
    request: { method: 'POST', path: '/payments', statusCode: 201 },
    api: { id: 'payments', slug: 'payments', name: 'Payments API' },
  };
  mocks.latest
    .mockResolvedValueOnce({
      data: {
        trace,
        apis: [
          { id: 'api', name: 'Sample API', receivedAt: trace.receivedAt },
          {
            id: 'payments',
            name: 'Payments API',
            receivedAt: olderTrace.receivedAt,
          },
        ],
      },
    })
    .mockResolvedValueOnce({
      data: {
        trace,
        apis: [
          { id: 'api', name: 'Sample API', receivedAt: trace.receivedAt },
          {
            id: 'payments',
            name: 'Payments API',
            receivedAt: olderTrace.receivedAt,
          },
        ],
      },
    })
    .mockResolvedValue({
      data: {
        trace: olderTrace,
        apis: [
          { id: 'api', name: 'Sample API', receivedAt: trace.receivedAt },
          {
            id: 'payments',
            name: 'Payments API',
            receivedAt: olderTrace.receivedAt,
          },
        ],
      },
    });

  render(
    <LatestTraceCard enabled hasSelections selections={tracing.selections} />,
  );

  const picker = await screen.findByLabelText('Show the latest call to');
  expect(picker).toHaveValue('api');
  expect(mocks.latest).toHaveBeenNthCalledWith(1, undefined);
  await userEvent.selectOptions(picker, 'payments');
  expect(await screen.findByText('/payments')).toBeInTheDocument();
  expect(mocks.latest).toHaveBeenLastCalledWith('payments');
});

describe('selection picker', () => {
  it('lists published APIs for the API kind', async () => {
    mocks.targets.mockResolvedValue({
      data: {
        items: [
          { id: 'api-1', slug: 'sample', name: 'Sample API' },
          { id: 'api-2', slug: 'restricted', name: 'Restricted API' },
        ],
      },
    });
    render(<TracingSelections tracing={tracing} onChange={vi.fn()} />);
    const picker = screen.getByLabelText('Select api');
    expect(
      await screen.findByRole('option', { name: 'Sample API' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Restricted API' }),
    ).toBeInTheDocument();
    expect(mocks.targets).toHaveBeenCalledWith('api', '');
    await userEvent.selectOptions(picker, 'api-2');
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
  });

  it('resets the target list and selected target when the kind changes', async () => {
    let resolveTeams: (value: unknown) => void = () => undefined;
    mocks.targets.mockImplementation((kind: string) =>
      kind === 'developer'
        ? Promise.resolve({
            data: {
              items: [{ id: 'dev-1', name: 'Dana', email: 'dana@example.com' }],
            },
          })
        : kind === 'team'
          ? new Promise((resolve) => {
              resolveTeams = resolve;
            })
          : Promise.resolve({
              data: { items: [{ id: 'api-1', name: 'Sample API' }] },
            }),
    );
    render(<TracingSelections tracing={tracing} onChange={vi.fn()} />);
    const kind = screen.getByLabelText('Kind');
    await userEvent.selectOptions(kind, 'developer');
    await screen.findByRole('option', { name: 'Dana · dana@example.com' });
    await userEvent.selectOptions(
      screen.getByLabelText('Select developer'),
      'dev-1',
    );
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();

    await userEvent.selectOptions(kind, 'api');
    expect(
      screen.queryByRole('option', { name: 'Dana · dana@example.com' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Select api')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(
      await screen.findByRole('option', { name: 'Sample API' }),
    ).toBeInTheDocument();

    await userEvent.selectOptions(kind, 'team');
    expect(
      screen.queryByRole('option', { name: 'Sample API' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(4);
    resolveTeams({ data: { items: [{ id: 'team-1', name: 'Platform' }] } });
    expect(
      await screen.findByRole('option', { name: 'Platform' }),
    ).toBeInTheDocument();
  });
});

it('returns focus to Edit settings when Escape closes the settings dialog', async () => {
  render(<TracingSettingsCard tracing={tracing} onSaved={vi.fn()} />);
  const edit = screen.getByRole('button', { name: 'Edit settings' });
  await userEvent.click(edit);
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(edit).toHaveFocus();
});
