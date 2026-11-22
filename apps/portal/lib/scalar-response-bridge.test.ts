// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from 'vitest';
import { createScalarResponseBridge } from './scalar-response-bridge';

const traced = () =>
  new Response(null, {
    headers: {
      'X-Portal-Trace-State': 'traced',
      'X-Portal-Trace-Id': '4bf92f3577b34da6a3ce929d0e0e4736',
    },
  });

it('passes Scalar fetch responses through an onResponseReceived plugin hook', async () => {
  const response = traced();
  const onResponseReceived = vi.fn();
  const fetcher = vi.fn().mockResolvedValue(response);
  const bridge = createScalarResponseBridge(onResponseReceived, fetcher);

  await expect(bridge.fetch('/api/v1/try-it')).resolves.toBe(response);
  expect(bridge.plugin().name).toBe('portal-try-it-trace');
  expect(onResponseReceived).toHaveBeenCalledWith({ response });
});

it('reads a traced Try it response from the page fetch Scalar actually calls', async () => {
  const original = globalThis.fetch;
  const windowFetch = window.fetch;
  const response = traced();
  const inner = vi.fn().mockResolvedValue(response);
  globalThis.fetch = inner;
  window.fetch = inner;
  const onResponseReceived = vi.fn();
  const bridge = createScalarResponseBridge(onResponseReceived, inner);
  const restore = bridge.install();
  try {
    const ignored = new Response('document');
    inner.mockResolvedValueOnce(ignored);
    await globalThis.fetch('/api/v1/apis/sample/openapi.json');
    expect(onResponseReceived).not.toHaveBeenCalled();

    inner.mockResolvedValueOnce(response);
    await expect(
      globalThis.fetch(
        new Request('http://localhost/api/v1/try-it?scalar_url=http://kong/sample/get'),
      ),
    ).resolves.toBe(response);
    expect(onResponseReceived).toHaveBeenCalledTimes(1);
    expect(onResponseReceived).toHaveBeenCalledWith({ response });

    inner.mockResolvedValueOnce(response);
    await globalThis.fetch('/api/v1/try-it/traces/4bf92f3577b34da6a3ce929d0e0e4736');
    expect(onResponseReceived).toHaveBeenCalledTimes(1);
  } finally {
    restore();
    globalThis.fetch = original;
    window.fetch = windowFetch;
  }
});
