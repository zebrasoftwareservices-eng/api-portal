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
  expect(screen.getByLabelText(`Trace ID ${trace.traceId}`)).toBeInTheDocument();
  expect(
    screen.getByText((_content, element) =>
      Boolean(
        element?.classList.contains('trace-status-success') &&
          element.textContent?.includes('200 OK'),
      ),
    ),
  ).toBeInTheDocument();
  expect(screen.getByText('224 ms total')).toBeInTheDocument();
  expect(screen.getAllByText(/Slowest: Upstream try/)).toHaveLength(2);
  expect(screen.queryByRole('link', { name: 'Open tracing page' })).toBeNull();
});

it('027 AC5: shows plugin names and the tracing-page link to an admin', async () => {
  const adminTrace: Trace = {
    ...trace,
    spans: [
      ...trace.spans,
      {
        spanId: 'plugin',
        parentSpanId: 'root',
        name: 'kong.access.plugin.key-auth',
        label: 'plugin',
        plugin: 'key-auth',
        startOffsetMs: 4,
        durationMs: 8,
        status: 'ok',
        slowest: false,
      },
    ],
  };
  const loadTrace = vi.fn().mockResolvedValue({
    data: {
      traceId: trace.traceId,
      state: 'ready',
      issuedAt: '2026-11-20T00:00:00Z',
      trace: adminTrace,
    },
  });
  render(
    <TryItTracePanel
      response={{ traceState: 'traced', traceId: trace.traceId, responseStatus: 200, sequence: 2 }}
      isAdmin
      loadTrace={loadTrace}
    />,
  );
  expect(await screen.findByText('key-auth')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open tracing page' })).toHaveAttribute('href', '/admin/tracing');
});

it('027 AC6/8/9: renders waiting, replaced, and gateway-unreachable failure states', async () => {
  const loadTrace = vi.fn().mockResolvedValue({
    data: {
      traceId: trace.traceId,
      state: 'waiting',
      issuedAt: '2026-11-20T00:00:00Z',
      trace: null,
    },
  });
  const response = {
    traceState: 'traced' as const,
    traceId: trace.traceId,
    responseStatus: 200,
    sequence: 3,
  };
  const { rerender } = render(
    <TryItTracePanel response={response} isAdmin={false} loadTrace={loadTrace} />,
  );
  expect(await screen.findByText(/Waiting for the trace from Kong/)).toBeInTheDocument();

  loadTrace.mockResolvedValueOnce({ error: { status: 404 } });
  rerender(
    <TryItTracePanel
      response={{ ...response, sequence: 4, traceId: '5'.repeat(32) }}
      isAdmin={false}
      loadTrace={loadTrace}
    />,
  );
  expect(await screen.findByText('This trace was replaced')).toBeInTheDocument();

  rerender(
    <TryItTracePanel
      response={{ traceState: 'unreachable', responseStatus: 503, sequence: 5 }}
      isAdmin={false}
      loadTrace={loadTrace}
    />,
  );
  expect(
    screen.getByText("The call didn't reach the gateway", { selector: 'strong' }),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Your call worked as usual/)).toBeNull();
  expect(screen.queryByText(/Waiting for the trace from Kong/)).toBeNull();
  expect(screen.queryByRole('table')).toBeNull();
  expect(loadTrace).toHaveBeenCalledTimes(2);
});

it('shows signed-out immediately without polling or a waterfall', () => {
  const loadTrace = vi.fn();
  render(
    <TryItTracePanel
      response={{ traceState: 'signed-out', responseStatus: 401, sequence: 9 }}
      isAdmin={false}
      loadTrace={loadTrace}
    />,
  );
  expect(screen.getByText('Sign in to see traces', { selector: 'strong' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    expect.stringContaining('/sign-in'),
  );
  expect(loadTrace).not.toHaveBeenCalled();
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.queryByText(/Waiting for the trace from Kong/)).toBeNull();
});

it('027 AC8: developer missing copy names no Kong setting and has no settings link', async () => {
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
        sequence: 8,
      }}
      isAdmin={false}
      loadTrace={loadTrace}
    />,
  );
  expect(
    await screen.findByText('No trace arrived for this call', { selector: 'strong' }),
  ).toBeInTheDocument();
  expect(screen.getByText(/Your call worked, but Kong didn't send its trace/)).toBeInTheDocument();
  expect(screen.queryByText(/tracing_instrumentations/)).toBeNull();
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
