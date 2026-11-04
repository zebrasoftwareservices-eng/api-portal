// SPDX-License-Identifier: Apache-2.0
import { beforeAll, afterAll } from 'vitest';
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
conformance(() => adapter, instanceId);
