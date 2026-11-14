// SPDX-License-Identifier: Apache-2.0
import { it, expect, vi } from 'vitest';
import { KongAdapter } from './index.js';
it('uses one stable plugin ID, replaces the unit, passes local policy and tolerates missing deletes', async () => {
  const fetcher = vi.fn(
    async (_input: URL | RequestInfo, init?: RequestInit) =>
      init?.method === 'GET'
        ? Response.json({ id: 'consumer' })
        : init?.method === 'DELETE'
          ? new Response(null, { status: 404 })
          : Response.json({ id: 'plugin' }),
  );
  const adapter = new KongAdapter({
    adminUrl: 'http://kong',
    instanceId: 'instance',
    rateLimitPolicy: 'local',
    fetch: fetcher,
  });
  await adapter.applyPlanLimits(
    { id: 'app' },
    { rate: { unit: 'second', limit: 5 }, monthlyQuota: 10 },
  );
  await adapter.applyPlanLimits(
    { id: 'app' },
    { rate: { unit: 'minute', limit: 8 }, monthlyQuota: 20 },
  );
  await adapter.applyPlanLimits({ id: 'app' }, null);
  const writes = fetcher.mock.calls.filter(
    ([, init]) => init?.method !== 'GET',
  );
  expect(new Set(writes.map(([url]) => String(url))).size).toBe(1);
  expect(JSON.parse(String(writes[0]![1]!.body))).toEqual({
    name: 'rate-limiting',
    consumer: { id: 'consumer' },
    config: { second: 5, month: 10, limit_by: 'consumer', policy: 'local' },
    tags: ['portal', 'portal-instance-instance', 'portal-app-app'],
  });
  expect(JSON.parse(String(writes[1]![1]!.body)).config).toEqual({
    minute: 8,
    month: 20,
    limit_by: 'consumer',
    policy: 'local',
  });
});
