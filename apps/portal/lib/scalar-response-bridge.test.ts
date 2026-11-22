// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from 'vitest';
import { createScalarResponseBridge } from './scalar-response-bridge';

it('passes Scalar fetch responses through an onResponseReceived plugin hook', async () => {
  const response = new Response(null, {
    headers: {
      'X-Portal-Trace-State': 'traced',
      'X-Portal-Trace-Id': '4bf92f3577b34da6a3ce929d0e0e4736',
    },
  });
  const onResponseReceived = vi.fn();
  const fetcher = vi.fn().mockResolvedValue(response);
  const bridge = createScalarResponseBridge(onResponseReceived, fetcher);

  await expect(bridge.fetch('/api/v1/try-it')).resolves.toBe(response);
  expect(bridge.plugin().name).toBe('portal-try-it-trace');
  expect(onResponseReceived).toHaveBeenCalledWith({ response });
});
