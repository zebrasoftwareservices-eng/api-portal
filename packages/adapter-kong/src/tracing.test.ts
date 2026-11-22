// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { KongAdapter } from './index.js';

describe('Kong tracing', () => {
  const config = { adminUrl: 'http://kong:8001', instanceId: 'instance' };
  const kong39UnauthorizedBatch = Buffer.from(
    'CrQHCqQCCjcSJgokMDFhMWZkZjItZGFkNC03Zjk0LTg0ZGYtMjkwZGU0YTAzOGYzCg1wb3J0YWwuYXBpX2lkCjkSJgokMDFhMWZkZjItYzBkNy03ZDZjLTg4NGItNTNhMTVjN2U0YTI1Cg9wb3J0YWwuaW5zdGFuY2UKFhIGCgRrb25nCgxzZXJ2aWNlLm5hbWUKPRImCiQxNDk5NzIxYi1lNGY0LTQ3ZjAtYTk2NC05ZDc4MmFlZDI2Y2UKE3NlcnZpY2UuaW5zdGFuY2UuaWQKGhIHCgUzLjkuNAoPc2VydmljZS52ZXJzaW9uCjsSJgokMDFhMWZkZjMtNDMzYy03NTgwLWI5MjEtYzg1ZGYzMDAyMzI1ChFwb3J0YWwuc2VsZWN0aW9ucxKKBQoWCg1rb25nLWludGVybmFsEgUwLjEuMBLoAhIIm8u5RDB37+YwAioEa29uZwoQEj/Bv4SDr5+BMEqXHzT0TTkAKCLmrw3qGEEADmjmrw3qGEoXEgMYkQMKEGh0dHAuc3RhdHVzX2NvZGVKGBILCgkxMjcuMC4wLjEKCWh0dHAuaG9zdEoVEgYKBGh0dHAKC2h0dHAuc2NoZW1lSiASDgoMMTkyLjE2OC42NS4xCg5odHRwLmNsaWVudF9pcEo1EiIKIGY2ZWE5NDFjMzA2NjlkNDY1YTZkZGY1YmQ2YTgxYzBhCg9rb25nLnJlcXVlc3QuaWRKFBIFCgNHRVQKC2h0dHAubWV0aG9kShQSBQoDMS4xCgtodHRwLmZsYXZvckoXEgkKBy9zYW1wbGUKCmh0dHAucm91dGVKHRIOCgwxOTIuMTY4LjY1LjEKC25ldC5wZWVyLmlwSikSHQobaHR0cDovLzEyNy4wLjAuMS9zYW1wbGUvZ2V0CghodHRwLnVybBJHEggnaaZLqIGu3TABKgtrb25nLnJvdXRlcgoQEj/Bv4SDr5+BMEqXHzT0TSIIm8u5RDB37+Y5AD1W5q8N6hhBAFtd5q8N6hgSVxIIbGueuRquVx8wASoba29uZy5hY2Nlc3MucGx1Z2luLmtleS1hdXRoChASP8G/hIOvn4EwSpcfNPRNIgiby7lEMHfv5jkAkV/mrw3qGEEAr2Xmrw3qGBJjEgh6ZtQm88QVhzABKidrb25nLmhlYWRlcl9maWx0ZXIucGx1Z2luLm9wZW50ZWxlbWV0cnkKEBI/wb+Eg6+fgTBKlx809E0iCJvLuUQwd+/mOQBZZ+avDeoYQQBnZ+avDeoY',
    'base64',
  );

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

  it('parses request metadata from a captured Kong 3.9 OTLP batch', () => {
    const batch = new KongAdapter(config).parseTraceBatch(kong39UnauthorizedBatch);
    const root = batch.spans.find((span) => span.name === 'kong');

    expect(root).toMatchObject({
      request: { method: 'GET', path: '/sample/get', statusCode: 401 },
      routePath: '/sample',
    });
    expect(JSON.stringify(batch)).not.toContain('127.0.0.1');
    expect(JSON.stringify(batch)).not.toContain('192.168.65.1');
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
      extract: ['w3c'],
      inject: ['preserve'],
      default_format: 'w3c',
    });
  });
});
