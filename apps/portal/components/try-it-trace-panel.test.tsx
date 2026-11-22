// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type { Trace } from '../lib/tracing-api';
import { TryItTracePanel } from './try-it-trace-panel';

const trace: Trace = {
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  startedAt: '2026-11-20T00:00:00Z',
  receivedAt: '2026-11-20T00:00:01Z',
  durationMs: 224,
  request: { method: 'GET', path: '/orders/42', statusCode: 200 },
  api: { id: 'api', slug: 'orders', name: 'Orders' },
  spans: [
    {
      spanId: 'root',
      parentSpanId: null,
      name: 'request',
      label: 'request',
      plugin: null,
      startOffsetMs: 0,
      durationMs: 224,
      status: 'ok',
      slowest: false,
    },
    {
      spanId: 'upstream',
      parentSpanId: 'root',
      name: 'upstream',
      label: 'upstream',
      plugin: null,
      startOffsetMs: 26,
      durationMs: 184,
      status: 'ok',
      slowest: true,
    },
  ],
};

it('shows the immediate developer and admin off variants without polling', () => {
  const loadTrace = vi.fn();
  const response = {
    traceState: 'off' as const,
    responseStatus: 200,
    sequence: 1,
  };
  const { rerender } = render(
    <TryItTracePanel response={response} isAdmin={false} loadTrace={loadTrace} />,
  );
  expect(screen.getAllByText('Tracing is off for this API')).toHaveLength(2);
  expect(screen.getByText(/aren't traced for your account/)).toBeInTheDocument();
  expect(loadTrace).not.toHaveBeenCalled();

  rerender(
    <TryItTracePanel response={response} isAdmin loadTrace={loadTrace} />,
  );
  expect(
    screen.getByRole('link', { name: 'Open tracing settings' }),
  ).toHaveAttribute('href', '/admin/tracing');
});

it('polls a traced response and renders the read-only waterfall', async () => {
  const loadTrace = vi.fn().mockResolvedValue({
    data: {
      traceId: trace.traceId,
      state: 'ready',
      issuedAt: '2026-11-20T00:00:00Z',
      trace,
    },
  });
  render(
    <TryItTracePanel
      response={{
        traceState: 'traced',
        traceId: trace.traceId,
        responseStatus: 200,
        sequence: 1,
      }}
      isAdmin={false}
      loadTrace={loadTrace}
    />,
  );
  await waitFor(() => expect(loadTrace).toHaveBeenCalledWith(trace.traceId));
  expect(
    await screen.findByRole('table', { name: /Spans of your Try it call/ }),
  ).toBeInTheDocument();
  expect(screen.getByText('/orders/42')).toBeInTheDocument();
  expect(screen.getAllByText(/Slowest: Upstream try/)).toHaveLength(2);
  expect(screen.queryByRole('link', { name: 'Open tracing page' })).toBeNull();
});

it('shows role-specific missing guidance and checks again', async () => {
  const loadTrace = vi.fn().mockResolvedValue({
    data: {
      traceId: trace.traceId,
      state: 'missing',
      issuedAt: '2026-11-20T00:00:00Z',
      trace: null,
    },
  });
  render(
    <TryItTracePanel
      response={{
        traceState: 'traced',
        traceId: trace.traceId,
        responseStatus: 200,
        sequence: 1,
      }}
      isAdmin
      loadTrace={loadTrace}
    />,
  );
  expect(
    await screen.findByText(/tracing_instrumentations/),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open tracing page' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
  expect(await screen.findByText('Still no trace.')).toBeInTheDocument();
});
