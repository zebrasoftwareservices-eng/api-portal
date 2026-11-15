// SPDX-License-Identifier: Apache-2.0
import { it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { UsageUnavailableError } from '@portal/adapter-sdk';
import { KongAdapter } from './index.js';
const instanceId = randomUUID(),
  appId = randomUUID(),
  credentialId = randomUUID();
it('parses only valid portal events, including timestamp and status classes', () => {
  const adapter = new KongAdapter({ adminUrl: 'http://kong', instanceId });
  const entry = {
    consumer: { username: `portal-app-${appId}` },
    authenticated_entity: { id: credentialId },
    response: { status: 204 },
    started_at: Date.UTC(2026, 10, 1),
  };
  expect(
    adapter.parseUsageEvents([
      entry,
      null,
      {},
      { ...entry, consumer: {} },
      { ...entry, response: { status: '200' } },
      { ...entry, started_at: NaN },
      { ...entry, authenticated_entity: {} },
    ]),
  ).toEqual([
    {
      heartbeat: false,
      appId,
      credentialId,
      status: 204,
      startedAt: new Date(entry.started_at),
      serviceId: '',
    },
  ]);
});
it('fails closed when Kong refuses custom Lua redaction', async () => {
  const request = vi.fn(async (_url, options) =>
    JSON.parse(options.body).name === 'http-log'
      ? new Response('secret gateway body', { status: 400 })
      : Response.json({ id: 'consumer' }),
  );
  const adapter = new KongAdapter({
    adminUrl: 'http://kong',
    instanceId,
    usage: { endpoint: 'http://server/ingest', token: 'secret' },
    fetch: request,
  });
  await expect(adapter.ensureConsumer({ id: appId })).rejects.toBeInstanceOf(
    UsageUnavailableError,
  );
  expect(request).toHaveBeenCalledTimes(2);
  const config = JSON.parse(request.mock.calls[1]![1].body).config;
  expect(config.custom_fields_by_lua).toEqual({
    request: 'return {}',
    response: 'return { status = kong.response.get_status() }',
  });
});
it('repairs endpoint/token drift, reports refusal and removes stale consumer log plugins', async () => {
  const pluginId = randomUUID(),
    consumerId = randomUUID();
  const plugins: Record<string, unknown>[] = [
    {
      id: pluginId,
      name: 'http-log',
      consumer: { id: consumerId },
      tags: [`portal-instance-${instanceId}`],
    },
  ];
  let refused = false;
  const transport = vi.fn(async (url, options) => {
    const path = new URL(url).pathname;
    if (options.method === 'PUT' && path.startsWith('/plugins/')) {
      if (refused) return new Response('', { status: 400 });
      const plugin = {
        ...JSON.parse(options.body),
        id: path.split('/').at(-1),
      };
      plugins.push(plugin);
      return Response.json(plugin);
    }
    if (options.method === 'DELETE') {
      const index = plugins.findIndex((p) => path.endsWith(`/${p.id}`));
      if (index >= 0) plugins.splice(index, 1);
      return new Response(null, { status: 204 });
    }
    const data =
      path === '/plugins'
        ? plugins
        : path === '/consumers'
          ? [
              {
                id: consumerId,
                custom_id: appId,
                tags: [`portal-instance-${instanceId}`],
              },
            ]
          : path === '/acls'
            ? [
                {
                  id: randomUUID(),
                  group: 'portal-consumer',
                  consumer: { id: consumerId },
                },
              ]
            : [];
    return Response.json({ data });
  });
  const adapter = new KongAdapter({
    adminUrl: 'http://kong',
    instanceId,
    usage: { endpoint: 'http://server/new', token: 'new-token' },
    fetch: transport,
  });
  const policy = {
    services: [],
    apps: [{ app: { id: appId }, services: [], limits: null }],
  };
  expect((await adapter.applyAccessPolicy(policy)).repairs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        object: 'plugin',
        action: 'added',
        detail: 'Usage collection repaired',
      }),
      expect.objectContaining({ object: 'plugin', action: 'removed' }),
    ]),
  );
  expect((await adapter.applyAccessPolicy(policy)).repairs).toEqual([]);
  const stored = plugins[0] as { config: { http_endpoint: string } };
  stored.config.http_endpoint = 'http://old';
  refused = true;
  expect((await adapter.applyAccessPolicy(policy)).findings).toEqual([
    expect.objectContaining({ code: 'usage-unavailable' }),
  ]);
  refused = false;
  expect(
    (await adapter.applyAccessPolicy({ services: [], apps: [] })).repairs,
  ).toEqual([expect.objectContaining({ action: 'removed', object: 'plugin' })]);
});
