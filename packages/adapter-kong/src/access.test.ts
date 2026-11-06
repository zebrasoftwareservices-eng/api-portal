// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, afterEach } from 'vitest';
import { KongAdapter } from './index.js';
import {
  GatewayServiceConflictError,
  GatewayUnavailableError,
} from '@portal/adapter-sdk';
const tags = ['portal', 'portal-instance-test'];
interface Entity {
  id: string;
  name?: string;
  service?: { id: string };
  route?: { id: string };
  config?: Record<string, unknown>;
  tags?: string[];
  group?: string;
  username?: string;
  custom_id?: string;
  enabled?: boolean;
}
function fixture(plugins: Entity[] = [], consumers: Entity[] = []) {
  const services = [
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Beta' },
  ];
  const routes = [
    { id: 'r1', service: { id: 'a' } },
    { id: 'r2', service: { id: 'a' } },
  ];
  const members = new Map<string, Entity[]>();
  const writes: { path: string; method: string; body?: Entity }[] = [];
  let failRead = '',
    rejectWrite = '';
  const fetcher = vi.fn(
    async (input: URL | RequestInfo, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        if (failRead && path.includes(failRead))
          return new Response('', { status: 503 });
        let data: Entity[] = [];
        if (path === '/services') data = services;
        else if (path === '/routes') data = routes;
        else if (path === '/plugins') data = plugins;
        else if (path === '/consumers') data = consumers;
        else if (path.endsWith('/acls'))
          data = members.get(path.split('/')[2]!) ?? [];
        return Response.json({ data });
      }
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      writes.push({ path, method, body });
      if (rejectWrite && path.includes(rejectWrite))
        return new Response('', { status: 409 });
      if (path.startsWith('/plugins/')) {
        const id = path.split('/')[2]!;
        const i = plugins.findIndex((p) => p.id === id);
        if (method === 'DELETE') {
          if (i >= 0) plugins.splice(i, 1);
          return new Response(null, { status: 204 });
        }
        if (method === 'PATCH') {
          plugins[i]!.config = { ...plugins[i]!.config, ...body.config };
          return Response.json(plugins[i]);
        }
        const value = { id, ...body };
        if (i >= 0) plugins[i] = value;
        else plugins.push(value);
        return Response.json(value);
      }
      if (path.includes('/acls/')) {
        const consumerId = path.split('/')[2]!;
        const consumer = consumers.find(
          (c) => c.username === consumerId || c.id === consumerId,
        );
        const key = consumer?.id ?? consumerId;
        const list = members.get(key) ?? [];
        const group = decodeURIComponent(path.split('/')[4]!);
        const i = list.findIndex((m) => m.group === group || m.id === group);
        if (method === 'DELETE') {
          if (i >= 0) list.splice(i, 1);
          members.set(key, list);
          return new Response(null, { status: 204 });
        }
        const value = {
          id: i >= 0 ? list[i]!.id : `membership-${group}`,
          ...body,
        };
        if (i >= 0) list[i] = value;
        else list.push(value);
        members.set(key, list);
        return Response.json(value);
      }
      return Response.json({ id: 'consumer', ...body });
    },
  );
  return {
    adapter: new KongAdapter({
      adminUrl: 'http://kong',
      instanceId: 'test',
      fetch: fetcher as typeof fetch,
    }),
    plugins,
    services,
    routes,
    members,
    writes,
    failRead: (path: string) => {
      failRead = path;
    },
    rejectWrite: (path: string) => {
      rejectWrite = path;
    },
  };
}
const auth = (serviceId = 'a'): Entity => ({
  id: `auth-${serviceId}`,
  name: 'key-auth',
  service: { id: serviceId },
  config: { key_names: ['apikey'], hide_credentials: false },
});
const policy = { services: [{ id: 'a' }], apps: [] };
afterEach(() => vi.useRealTimers());
describe('Kong access policy', () => {
  it('upserts tagged membership and tolerates repeated revokes', async () => {
    const f = fixture();
    await f.adapter.ensureConsumer({ id: 'app' });
    await f.adapter.grantAccess({ id: 'app' }, { id: 'a' });
    await f.adapter.grantAccess({ id: 'app' }, { id: 'a' });
    expect(f.members.get('portal-app-app')).toHaveLength(2);
    expect(
      f.members
        .get('portal-app-app')
        ?.every((m) => m.tags?.includes('portal-app-app')),
    ).toBe(true);
    await f.adapter.revokeAccess({ id: 'app' }, { id: 'a' });
    await f.adapter.revokeAccess({ id: 'app' }, { id: 'a' });
    expect(f.members.get('portal-app-app')?.map((m) => m.group)).toEqual([
      'portal-consumer',
    ]);
  });
  it.each(['service', 'route', 'global'])(
    'refuses a foreign ACL at %s scope before any write',
    async (scope) => {
      const f = fixture([
        auth(),
        {
          id: 'foreign',
          name: 'acl',
          ...(scope === 'service'
            ? { service: { id: 'a' } }
            : scope === 'route'
              ? { route: { id: 'r1' } }
              : {}),
          config: { deny: ['other'] },
        },
      ]);
      await expect(f.adapter.protectService({ id: 'a' })).rejects.toEqual(
        new GatewayServiceConflictError('Alpha'),
      );
      expect(f.writes).toEqual([]);
    },
  );
  it('creates a stable service allow and merges hiding without changing operator config or tags', async () => {
    const f = fixture([{ ...auth(), tags: ['operator'] }]);
    await f.adapter.protectService({ id: 'a' });
    const acl = f.plugins.find((p) => p.name === 'acl')!;
    expect(acl.config).toEqual({
      allow: ['portal-svc-a'],
      hide_groups_header: true,
    });
    expect(acl.tags).toEqual(tags);
    expect(f.plugins[0]).toMatchObject({
      tags: ['operator'],
      config: { key_names: ['apikey'], hide_credentials: true },
    });
    f.writes.length = 0;
    await f.adapter.protectService({ id: 'a' });
    expect(f.writes).toEqual([]);
  });
  it('uses only authenticated routes, leaving public siblings open and returning a warning', async () => {
    const f = fixture([
      { id: 'auth', name: 'key-auth', route: { id: 'r1' }, config: {} },
    ]);
    const result = await f.adapter.protectService({ id: 'a' });
    expect(result.findings[0]?.code).toBe('partial-key-auth');
    expect(f.plugins.find((p) => p.name === 'acl')).toMatchObject({
      route: { id: 'r1' },
    });
    expect(f.plugins.filter((p) => p.name === 'acl')).toHaveLength(1);
    await f.adapter.applyAccessPolicy({ services: [], apps: [] });
    expect(f.plugins.find((p) => p.name === 'acl')?.config?.deny).toEqual([
      'portal-consumer',
    ]);
  });
  it('copies global key-auth for managed services and converges even when config key order differs', async () => {
    const f = fixture([
      {
        id: 'global',
        name: 'key-auth',
        config: { hide_credentials: false, key_names: ['apikey'] },
      },
    ]);
    await f.adapter.applyAccessPolicy(policy);
    expect(
      f.plugins.find((p) => p.id === 'global')?.config?.hide_credentials,
    ).toBe(false);
    const copy = f.plugins.find(
      (p) => p.name === 'key-auth' && p.service?.id === 'a',
    )!;
    expect(copy.config?.hide_credentials).toBe(true);
    copy.config = { key_names: ['apikey'], hide_credentials: true };
    f.writes.length = 0;
    await f.adapter.applyAccessPolicy(policy);
    expect(f.writes).toEqual([]);
    f.plugins[0]!.config!.key_names = ['new-key'];
    await f.adapter.applyAccessPolicy(policy);
    expect(copy.id).toBe(
      f.plugins.find((p) => p.name === 'key-auth' && p.service)?.id,
    );
    expect(f.plugins.find((p) => p.id === copy.id)?.config?.key_names).toEqual([
      'new-key',
    ]);
  });
  it('finishes all reads before writes, grants before plugins and waits for memberships to settle', async () => {
    vi.useFakeTimers();
    const f = fixture(
      [auth()],
      [{ id: 'consumer', username: 'portal-app-app', custom_id: 'app', tags }],
    );
    f.members.set('consumer', [{ id: 'extra', group: 'operator-added' }]);
    const run = f.adapter.applyAccessPolicy({
      ...policy,
      apps: [{ app: { id: 'app' }, services: [{ id: 'a' }] }],
    });
    await vi.advanceTimersByTimeAsync(5999);
    expect(f.writes.filter((w) => w.path.startsWith('/plugins'))).toHaveLength(
      0,
    );
    expect(f.members.get('consumer')?.map((m) => m.group)).toEqual([
      'portal-consumer',
      'portal-svc-a',
    ]);
    await vi.advanceTimersByTimeAsync(1);
    const report = await run;
    expect(
      report.repairs.filter((r) => r.object === 'membership'),
    ).toHaveLength(3);
    expect(f.writes.filter((w) => w.path.startsWith('/plugins'))).toHaveLength(
      2,
    );
    f.writes.length = 0;
    await f.adapter.applyAccessPolicy({
      ...policy,
      apps: [{ app: { id: 'app' }, services: [{ id: 'a' }] }],
    });
    expect(f.writes).toEqual([]);
  });
  it('makes no writes if a late membership read fails', async () => {
    const f = fixture([auth()], [{ id: 'consumer', custom_id: 'app', tags }]);
    f.failRead('/acls');
    await expect(f.adapter.applyAccessPolicy(policy)).rejects.toBeInstanceOf(
      GatewayUnavailableError,
    );
    expect(f.writes).toEqual([]);
  });
  it('repairs drift and preserves foreign ACLs and reports missing or shared services', async () => {
    const f = fixture([auth(), auth('b')]);
    await f.adapter.applyAccessPolicy(policy);
    const allow = f.plugins.find(
      (p) => p.name === 'acl' && p.service?.id === 'a',
    )!;
    allow.config = { allow: ['wrong'], hide_groups_header: false };
    f.plugins[0]!.config!.hide_credentials = false;
    const report = await f.adapter.applyAccessPolicy({
      services: [{ id: 'a' }, { id: 'a' }, { id: 'missing' }],
      apps: [],
    });
    expect(report.repairs).toHaveLength(2);
    expect(report.findings.map((f) => f.code)).toEqual(
      expect.arrayContaining(['service-missing', 'service-shared']),
    );
    expect(f.plugins.find((p) => p.id === allow.id)?.config?.allow).toEqual([
      'portal-svc-a',
    ]);
    f.plugins.push({
      id: 'foreign',
      name: 'acl',
      route: { id: 'r1' },
      config: { deny: ['other'] },
    });
    const snapshot = structuredClone(f.plugins);
    expect(
      (await f.adapter.applyAccessPolicy(policy)).findings.some(
        (f) => f.code === 'foreign-acl',
      ),
    ).toBe(true);
    expect(f.plugins).toEqual(snapshot);
  });
  it('continues after rejected objects, stops on unavailability, and removes stale denies only on unmanaged services', async () => {
    const f = fixture([auth(), auth('b')]);
    f.rejectWrite('/plugins/auth-a');
    const result = await f.adapter.applyAccessPolicy(policy);
    expect(result.findings.some((f) => f.code === 'gateway-rejected')).toBe(
      true,
    );
    expect(
      f.plugins.find((p) => p.name === 'acl' && p.service?.id === 'b'),
    ).toBeDefined();
    f.plugins.splice(
      f.plugins.findIndex((p) => p.id === 'auth-b'),
      1,
    );
    f.plugins.splice(
      f.plugins.findIndex((p) => p.id === 'auth-a'),
      1,
    );
    await f.adapter.applyAccessPolicy(policy);
    expect(
      f.plugins.find((p) => p.name === 'acl' && p.service?.id === 'a'),
    ).toBeDefined();
    expect(
      f.plugins.find((p) => p.name === 'acl' && p.service?.id === 'b'),
    ).toBeUndefined();
  });
  it('recognizes only Kong ACL refusals and preserves upstream refusals', () => {
    const { adapter } = fixture();
    const body = new TextEncoder().encode(
      '{"message":"You cannot consume this service"}',
    );
    expect(
      adapter.isAccessDenied({ status: 403, headers: new Headers(), body }),
    ).toBe(true);
    expect(
      adapter.isAccessDenied({
        status: 403,
        headers: new Headers({ 'x-kong-upstream-latency': '1' }),
        body,
      }),
    ).toBe(false);
    expect(
      adapter.isAccessDenied({ status: 401, headers: new Headers(), body }),
    ).toBe(false);
    expect(
      adapter.isAccessDenied({
        status: 403,
        headers: new Headers(),
        body: new TextEncoder().encode('upstream'),
      }),
    ).toBe(false);
  });
});
