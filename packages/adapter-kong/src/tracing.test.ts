// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { KongAdapter } from './index.js';

describe('Kong tracing', () => {
  const config = { adminUrl: 'http://kong:8001', instanceId: 'instance' };

  it.each([
    ['kong', { label: 'request' }],
    ['kong.router', { label: 'router' }],
    ['router', { label: 'router' }],
    ['kong.balancer', { label: 'upstream' }],
    ['balancer try #2', { label: 'upstream' }],
    ['kong.access.plugin.key-auth', { label: 'plugin', plugin: 'key-auth' }],
    ['rewrite phase: request-transformer', { label: 'plugin', plugin: 'request-transformer' }],
    ['custom', { label: 'other' }],
  ])('classifies %s', (name, expected) => {
    expect(new KongAdapter(config).classifySpan(name)).toEqual(expected);
  });

  it('applies merged targets twice without rewriting and removes stale plugins', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(Response.json({ id: 'plugin' }))
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              id: 'stale',
              name: 'opentelemetry',
              tags: ['portal-tracing', 'portal-instance-instance'],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const adapter = new KongAdapter({ ...config, fetch: fetcher });
    const plan = {
      endpoint: 'http://server/traces',
      token: 'token',
      targets: [
        { scope: { service: 'service' }, selections: ['one'] },
        { scope: { service: 'service' }, selections: ['two'] },
      ],
    };
    expect(await adapter.applyTracing(plan)).toMatchObject({ created: 1 });
    expect(await adapter.applyTracing({ ...plan, targets: [] })).toMatchObject({ removed: 1 });
    const writes = fetcher.mock.calls.filter((call) => call[1]?.method === 'PUT');
    const pluginConfig = JSON.parse(writes[0]![1].body).config;
    expect(pluginConfig.traces_endpoint).toBe('http://server/traces');
    expect(pluginConfig.resource_attributes['portal.selections']).toBe('one,two');
    expect(pluginConfig.propagation).toEqual({
      extract: [],
      inject: ['preserve'],
      default_format: 'w3c',
    });
  });
});
