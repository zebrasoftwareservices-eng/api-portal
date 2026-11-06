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
  kong = await new GenericContainer('kong:3.9')
    .withNetwork(network)
    .withEnvironment({ ...environment, KONG_ADMIN_LISTEN: '0.0.0.0:8001' })
    .withExposedPorts(8001)
    .withWaitStrategy(Wait.forHttp('/status', 8001))
    .start();
  adapter = new KongAdapter({
    adminUrl: `http://${kong.getHost()}:${kong.getMappedPort(8001)}`,
    instanceId,
  });
}, 180000);
afterAll(async () => {
  await kong?.stop();
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
