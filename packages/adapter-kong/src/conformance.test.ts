// SPDX-License-Identifier: Apache-2.0
import { beforeAll, afterAll, it, expect } from 'vitest';
import {
  GenericContainer,
  Network,
  Wait,
  type StartedTestContainer,
  type StartedNetwork,
} from 'testcontainers';
import { randomUUID } from 'node:crypto';
import { conformance } from '@portal/adapter-sdk/conformance';
import { KongAdapter } from './index.js';
let network: StartedNetwork;
let postgres: StartedTestContainer;
let kong: StartedTestContainer;
let adapter: KongAdapter;
let upstream: StartedTestContainer;
let proxy: string;
const instanceId = randomUUID();
beforeAll(async () => {
  network = await new Network().start();
  postgres = await new GenericContainer('postgres:17-alpine')
    .withNetwork(network)
    .withNetworkAliases('postgres')
    .withEnvironment({
      POSTGRES_USER: 'kong',
      POSTGRES_PASSWORD: 'kong',
      POSTGRES_DB: 'kong',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(
      Wait.forLogMessage('database system is ready to accept connections', 2),
    )
    .start();
  const environment = {
    KONG_DATABASE: 'postgres',
    KONG_PG_HOST: 'postgres',
    KONG_PG_USER: 'kong',
    KONG_PG_PASSWORD: 'kong',
    KONG_PG_DATABASE: 'kong',
  };
  const migration = await new GenericContainer('kong:3.9')
    .withNetwork(network)
    .withEnvironment(environment)
    .withCommand(['kong', 'migrations', 'bootstrap'])
    .withWaitStrategy(Wait.forOneShotStartup())
    .start();
  await migration.stop();
  upstream = await new GenericContainer('mccutchen/go-httpbin:v2.15.0')
    .withNetwork(network)
    .withNetworkAliases('echo')
    .start();
  kong = await new GenericContainer('kong:3.9')
    .withNetwork(network)
    .withEnvironment({ ...environment, KONG_ADMIN_LISTEN: '0.0.0.0:8001' })
    .withExposedPorts(8001, 8000)
    .withWaitStrategy(Wait.forHttp('/status', 8001))
    .start();
  proxy = `http://${kong.getHost()}:${kong.getMappedPort(8000)}`;
  adapter = new KongAdapter({
    adminUrl: `http://${kong.getHost()}:${kong.getMappedPort(8001)}`,
    instanceId,
  });
}, 180000);
afterAll(async () => {
  await kong?.stop();
  await upstream?.stop();
  await postgres?.stop();
  await network?.stop();
});
conformance(
  () => adapter,
  instanceId,
  () => ({
    serviceId: randomUUID(),
    memberships: async (appId) =>
      (await adapter.request<{
        data: { id: string; group: string; tags: string[] }[];
      }>(`/consumers/portal-app-${appId}/acls`))!.data,
    unavailable: () =>
      new KongAdapter({ adminUrl: 'http://127.0.0.1:1', instanceId }),
  }),
);

it('protects real services, converts deny to allow without replacing its ID, and converges', async () => {
  const serviceId = randomUUID();
  const pluginId = randomUUID();
  await adapter.request(`/services/${serviceId}`, 'PUT', {
    name: `test-${serviceId}`,
    url: 'http://example.test',
    tags: ['operator'],
  });
  try {
    await adapter.request(`/plugins/${pluginId}`, 'PUT', {
      name: 'key-auth',
      service: { id: serviceId },
      config: { key_names: ['apikey'], hide_credentials: false },
      tags: ['operator'],
    });
    await adapter.applyAccessPolicy({ services: [], apps: [] });
    const before = await adapter.request<{
      data: {
        id: string;
        name: string;
        config: Record<string, unknown>;
        tags: string[];
      }[];
    }>(`/services/${serviceId}/plugins`);
    const deny = before!.data.find((p) => p.name === 'acl')!;
    expect(deny.config.deny).toEqual(['portal-consumer']);
    await adapter.protectService({ id: serviceId });
    const after = await adapter.request<NonNullable<typeof before>>(
      `/services/${serviceId}/plugins`,
    );
    const allow = after!.data.find((p) => p.name === 'acl')!;
    expect(allow.id).toBe(deny.id);
    expect(allow.config.allow).toEqual([`portal-svc-${serviceId}`]);
    expect(allow.config.deny).toBeNull();
    expect(allow.config.hide_groups_header).toBe(true);
    expect(allow.tags).toEqual(
      expect.arrayContaining(['portal', `portal-instance-${instanceId}`]),
    );
    expect(after!.data.find((p) => p.name === 'key-auth')).toMatchObject({
      tags: ['operator'],
      config: { hide_credentials: true, key_names: ['apikey'] },
    });
    const report = await adapter.applyAccessPolicy({
      services: [{ id: serviceId }],
      apps: [],
    });
    expect(report.repairs).toEqual([]);
  } finally {
    await adapter.request(`/services/${serviceId}`, 'DELETE');
  }
});

// All propagation checks poll observable state; no fixed sleeps are used in tests.
interface Plugin {
  id: string;
  name: string;
  config: Record<string, unknown>;
  tags?: string[];
}
const data = async <T>(path: string) =>
  (await adapter.request<{ data: T[] }>(path))!.data;
async function service(auth: 'service' | 'route' | 'none' = 'service') {
  const id = randomUUID(),
    routeId = randomUUID();
  await adapter.request(`/services/${id}`, 'PUT', {
    name: `qa-${id}`,
    url: 'http://echo:8080',
  });
  await adapter.request(`/routes/${routeId}`, 'PUT', {
    service: { id },
    paths: [`/${id}`],
  });
  if (auth !== 'none')
    await adapter.request(`/plugins/${randomUUID()}`, 'PUT', {
      name: 'key-auth',
      ...(auth === 'service'
        ? { service: { id } }
        : { route: { id: routeId } }),
      config: { hide_credentials: false },
    });
  return { id, routeId };
}
async function call(id: string, key?: string, query = false) {
  return fetch(`${proxy}/${id}/get${query && key ? `?apikey=${key}` : ''}`, {
    headers: key && !query ? { apikey: key } : {},
  });
}
async function status(id: string, key: string | undefined, expected: number) {
  await expect
    .poll(async () => (await call(id, key)).status, {
      timeout: 15000,
      interval: 100,
    })
    .toBe(expected);
}
async function portalKey(appId = randomUUID()) {
  await adapter.ensureConsumer({ id: appId });
  const id = randomUUID(),
    key = `pk_${randomUUID()}`;
  await adapter.issueCredential({ id: appId }, { id, key });
  return { appId, id, key };
}
it('AC 1/3/4: enforces all access rows and strips header/query keys while preserving consumer identity', async () => {
  const a = await service(),
    b = await service(),
    unmanaged = await service(),
    publicApi = await service('none');
  const key = await portalKey();
  await adapter.grantAccess({ id: key.appId }, a);
  await adapter.applyAccessPolicy({
    services: [a, b],
    apps: [{ app: { id: key.appId }, services: [a] }],
  });
  await status(a.id, key.key, 200);
  await status(b.id, key.key, 403);
  await status(unmanaged.id, key.key, 403);
  await status(publicApi.id, undefined, 200);
  await status(a.id, undefined, 401);
  await status(a.id, 'unknown-key', 401);
  const operator = randomUUID(),
    operatorKey = randomUUID();
  await adapter.request(`/consumers/${operator}`, 'PUT', {
    username: operator,
  });
  await adapter.request(`/consumers/${operator}/key-auth`, 'POST', {
    key: operatorKey,
  });
  await status(unmanaged.id, operatorKey, 200);
  for (const query of [false, true]) {
    const response = await call(a.id, key.key, query);
    expect(response.status).toBe(200);
    const echo = await response.json();
    expect(JSON.stringify(echo)).not.toContain(key.key);
    expect(
      Object.entries(echo.headers).find(
        ([name]) => name.toLowerCase() === 'x-consumer-custom-id',
      )?.[1],
    ).toEqual([key.appId]);
  }
  await adapter.revokeCredential({ id: key.appId }, key.id);
  await status(a.id, key.key, 401);
});
it('AC 3: route-only key-auth denies portal consumers but preserves public sibling and operator traffic', async () => {
  const a = await service('route'),
    key = await portalKey();
  const sibling = randomUUID();
  await adapter.request(`/routes/${sibling}`, 'PUT', {
    service: { id: a.id },
    paths: [`/${sibling}`],
  });
  const operator = randomUUID(),
    operatorKey = randomUUID();
  await adapter.request(`/consumers/${operator}`, 'PUT', {
    username: operator,
  });
  await adapter.request(`/consumers/${operator}/key-auth`, 'POST', {
    key: operatorKey,
  });
  await adapter.applyAccessPolicy({ services: [], apps: [] });
  await status(a.id, key.key, 403);
  await status(a.id, operatorKey, 200);
  await status(sibling, undefined, 200);
});
it('AC 5/7: upgrades legacy memberships before enforcement without refusing subscribed traffic; repairs four drift cases and is stable on restart', async () => {
  const a = await service(),
    b = await service();
  const appId = randomUUID(),
    credentialId = randomUUID(),
    key = `legacy-${randomUUID()}`;
  // Exact v0.1 consumer/key shape: no memberships, original ownership tags.
  const tags = [
    'portal',
    `portal-instance-${instanceId}`,
    `portal-app-${appId}`,
  ];
  await adapter.request(`/consumers/portal-app-${appId}`, 'PUT', {
    username: `portal-app-${appId}`,
    custom_id: appId,
    tags,
  });
  await adapter.request(`/consumers/portal-app-${appId}/key-auth`, 'POST', {
    key,
    tags: [...tags, `portal-cred-${credentialId}`],
  });
  await status(a.id, key, 200);
  // Kong has multiple workers: a single 200 does not prove the newly created
  // legacy route has propagated to all workers before starting the upgrade.
  await expect
    .poll(
      async () => {
        const responses = await Promise.all(
          Array.from({ length: 40 }, () => call(a.id, key)),
        );
        return [...new Set(responses.map((r) => r.status))];
      },
      { timeout: 15000 },
    )
    .toEqual([200]);
  const policy = {
    services: [a, b],
    apps: [{ app: { id: appId }, services: [a] }],
  };
  let running = true;
  const observed: number[] = [];
  const traffic = (async () => {
    while (running) observed.push((await call(a.id, key)).status);
  })();
  try {
    await adapter.applyAccessPolicy(policy);
    await status(b.id, key, 403);
    await status(a.id, key, 200);
  } finally {
    running = false;
    await traffic;
  }
  expect(observed.length).toBeGreaterThan(1);
  expect(
    [...new Set(observed)],
    `traffic status counts: ${JSON.stringify(Object.fromEntries([...new Set(observed)].map((status) => [status, observed.filter((s) => s === status).length])))}`,
  ).toEqual([200]);
  const snapshot = async () => {
    const strip = (value: unknown): unknown =>
      Array.isArray(value)
        ? value
            .map(strip)
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
        : value && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value)
                .filter(([k]) => k !== 'updated_at')
                .map(([k, v]) => [k, strip(v)]),
            )
          : value;
    return strip({
      plugins: await data('/plugins'),
      members: await data(`/consumers/portal-app-${appId}/acls`),
    });
  };
  const before = await snapshot();
  const restarted = new KongAdapter({
    adminUrl: `http://${kong.getHost()}:${kong.getMappedPort(8001)}`,
    instanceId,
  });
  expect((await restarted.applyAccessPolicy(policy)).repairs).toEqual([]);
  expect(await snapshot()).toEqual(before);
  const operator = randomUUID();
  await adapter.request(`/consumers/${operator}`, 'PUT', {
    username: operator,
  });
  await adapter.request(`/consumers/${operator}/acls`, 'POST', {
    group: `portal-svc-${b.id}`,
  });
  await adapter.request(`/consumers/${operator}/acls`, 'POST', {
    group: 'operator-group',
  });
  const foreign = await data(`/consumers/${operator}/acls`);
  await adapter.revokeAccess({ id: appId }, a);
  await adapter.grantAccess({ id: appId }, b);
  const plugins = await data<Plugin>(`/services/${a.id}/plugins`);
  await adapter.request(
    `/plugins/${plugins.find((p) => p.name === 'acl')!.id}`,
    'DELETE',
  );
  await adapter.request(
    `/plugins/${plugins.find((p) => p.name === 'key-auth')!.id}`,
    'PATCH',
    { config: { hide_credentials: false } },
  );
  const repaired = await restarted.applyAccessPolicy(policy);
  expect(
    repaired.repairs.filter((r) => r.object === 'membership'),
  ).toHaveLength(2);
  expect(repaired.repairs.filter((r) => r.object === 'plugin')).toHaveLength(2);
  await status(a.id, key, 200);
  await status(b.id, key, 403);
  expect(await data(`/consumers/${operator}/acls`)).toEqual(foreign);
  expect((await restarted.applyAccessPolicy(policy)).repairs).toEqual([]);
});
it.each(['service', 'route', 'global'] as const)(
  'AC 9: refuses foreign %s ACL without changing plugins',
  async (scope) => {
    const a = await service();
    const foreign = randomUUID();
    try {
      await adapter.request(`/plugins/${foreign}`, 'PUT', {
        name: 'acl',
        ...(scope === 'service'
          ? { service: { id: a.id } }
          : scope === 'route'
            ? { route: { id: a.routeId } }
            : {}),
        config: { deny: ['operator-group'] },
      });
      const before = await data('/plugins');
      await expect(adapter.protectService(a)).rejects.toMatchObject({
        serviceName: `qa-${a.id}`,
      });
      expect(await data('/plugins')).toEqual(before);
    } finally {
      await adapter.request(`/plugins/${foreign}`, 'DELETE');
    }
  },
);
it('AC 9: publishing denies an existing key until subscription is granted', async () => {
  const a = await service(),
    key = await portalKey();
  await adapter.protectService(a);
  await status(a.id, key.key, 403);
  await adapter.grantAccess({ id: key.appId }, a);
  await status(a.id, key.key, 200);
});
it('AC 3/4: global key-auth is copied only for managed hiding and operator consumers remain allowed elsewhere', async () => {
  const a = await service('none'),
    b = await service('none'),
    key = await portalKey();
  const global = randomUUID(),
    operator = randomUUID(),
    operatorKey = randomUUID();
  try {
    await adapter.request(`/plugins/${global}`, 'PUT', {
      name: 'key-auth',
      config: { hide_credentials: false },
    });
    await adapter.request(`/consumers/${operator}`, 'PUT', {
      username: operator,
    });
    await adapter.request(`/consumers/${operator}/key-auth`, 'POST', {
      key: operatorKey,
    });
    await adapter.applyAccessPolicy({
      services: [a],
      apps: [{ app: { id: key.appId }, services: [a] }],
    });
    await status(a.id, key.key, 200);
    await status(b.id, key.key, 403);
    await status(b.id, operatorKey, 200);
    expect(
      JSON.stringify(await (await call(a.id, key.key)).json()),
    ).not.toContain(key.key);
    expect(
      JSON.stringify(await (await call(b.id, operatorKey)).json()),
    ).toContain(operatorKey);
    expect(
      (await adapter.request<Plugin>(`/plugins/${global}`))!.config
        .hide_credentials,
    ).toBe(false);
  } finally {
    await adapter.request(`/plugins/${global}`, 'DELETE');
  }
});

it('AC 8: partial grant failure compensates real consumer memberships and retry creates no duplicates', async () => {
  const a = await service(),
    b = await service(),
    app = { id: randomUUID() };
  const interrupted = new KongAdapter({
    adminUrl: `http://${kong.getHost()}:${kong.getMappedPort(8001)}`,
    instanceId,
    fetch: async (input, init) => {
      if (String(input).endsWith(`/acls/portal-svc-${b.id}`))
        throw new DOMException('timeout', 'TimeoutError');
      return fetch(input, init);
    },
  });
  await interrupted.ensureConsumer(app);
  await interrupted.grantAccess(app, a);
  await expect(interrupted.grantAccess(app, b)).rejects.toMatchObject({
    name: 'GatewayUnavailableError',
  });
  await interrupted.deleteConsumer(app);
  expect(
    await adapter.request(
      `/consumers/portal-app-${app.id}`,
      'GET',
      undefined,
      true,
    ),
  ).toBeNull();
  await adapter.ensureConsumer(app);
  for (const target of [a, b, a, b]) await adapter.grantAccess(app, target);
  const consumers = await data(`/consumers?tags=portal-app-${app.id}`);
  expect(consumers).toHaveLength(1);
  const groups = await data<{ group: string }>(
    `/consumers/portal-app-${app.id}/acls`,
  );
  expect(groups.map((g) => g.group).sort()).toEqual(
    ['portal-consumer', `portal-svc-${a.id}`, `portal-svc-${b.id}`].sort(),
  );
  await adapter.deleteConsumer(app);
});
