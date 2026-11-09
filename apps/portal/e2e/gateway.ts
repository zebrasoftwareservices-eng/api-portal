// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';

test('real gateway outage preserves active keys and retries app creation without duplicates', async ({
  request,
}) => {
  test.setTimeout(120_000);
  const compose = (...args: string[]) =>
    execFileSync(
      'docker',
      [
        'compose',
        '-f',
        'deploy/docker-compose.yml',
        ...(process.env.SPEC005_COMPOSE_OVERRIDE
          ? ['-f', process.env.SPEC005_COMPOSE_OVERRIDE]
          : []),
        ...args,
      ],
      { stdio: 'ignore' },
    );
  const signup = await request.post('/api/auth/sign-up/email', {
    data: {
      name: 'Outage QA',
      email: `qa-outage-${crypto.randomUUID()}@example.com`,
      password: 'QA-password-123',
    },
  });
  expect(signup.status()).toBe(200);
  const catalog = await (await request.get('/api/v1/apis')).json();
  const sample = catalog.items.find(
    (a: { slug: string }) => a.slug === 'sample',
  );
  const first = await request.post('/api/v1/apps', {
    data: { name: 'Existing key', apiIds: [sample.id] },
  });
  expect(first.status()).toBe(201);
  const { app, credential } = await first.json();
  const revokeUrl = `/api/v1/apps/${app.id}/credentials/${credential.id}`;
  const retryBody = { name: 'Retry app', apiIds: [sample.id] };
  try {
    compose('stop', 'kong');
    const failed = await request.post('/api/v1/apps', { data: retryBody });
    expect(failed.status()).toBe(503);
    expect(failed.headers()['retry-after']).toBe('5');
    expect((await failed.json()).type).toBe('/problems/gateway-unavailable');
    expect(
      (await (await request.get('/api/v1/apps')).json()).items,
    ).toHaveLength(1);
    expect((await request.delete(revokeUrl)).status()).toBe(503);
    const detail = await (await request.get(`/api/v1/apps/${app.id}`)).json();
    expect(detail.credentials[0].status).toBe('active');
  } finally {
    compose('up', '-d', '--wait', 'kong');
  }
  const retry = await request.post('/api/v1/apps', { data: retryBody });
  expect(retry.status()).toBe(201);
  const created = await retry.json();
  const consumers = await (
    await request.get(
      `http://localhost:8001/consumers?tags=portal-app-${created.app.id}`,
    )
  ).json();
  expect(consumers.data).toHaveLength(1);
  const keys = await (
    await request.get(
      `http://localhost:8001/consumers/portal-app-${created.app.id}/key-auth`,
    )
  ).json();
  expect(keys.data).toHaveLength(1);
  expect(
    (await request.post('/api/v1/apps', { data: retryBody })).status(),
  ).toBe(409);
  expect((await request.delete(revokeUrl)).status()).toBe(204);
  expect(
    (
      await request.get('http://localhost:8000/sample/get', {
        headers: { apikey: credential.key },
      })
    ).status(),
  ).toBe(401);
});

test('sample seed converges across server restarts against real Kong', async ({
  request,
}) => {
  test.setTimeout(120_000);
  const compose = (...args: string[]) =>
    execFileSync(
      'docker',
      [
        'compose',
        '-f',
        'deploy/docker-compose.yml',
        ...(process.env.SPEC005_COMPOSE_OVERRIDE
          ? ['-f', process.env.SPEC005_COMPOSE_OVERRIDE]
          : []),
        ...args,
      ],
      { encoding: 'utf8' },
    );
  const kong = 'http://localhost:8001';
  const snapshot = async () => {
    const service = await (
      await request.get(`${kong}/services/portal-sample`)
    ).json();
    const route = await (
      await request.get(`${kong}/routes/portal-sample`)
    ).json();
    const plugins = await (
      await request.get(`${kong}/services/${service.id}/plugins`)
    ).json();
    expect(route.service.id).toBe(service.id);
    expect(route.paths).toEqual(['/sample']);
    expect(
      plugins.data.filter((p: { name: string }) => p.name === 'key-auth'),
    ).toHaveLength(1);
    expect(service.tags).toContain('portal-seed');
    // Review ruling for AC 5 / JSO-282: seed PUTs may reset timestamps;
    // IDs and the complete configuration must remain stable across restart.
    const stable = ({
      created_at: _created,
      updated_at: _updated,
      ...object
    }: Record<string, unknown>) => object;
    return {
      service: stable(service),
      route: stable(route),
      plugins: plugins.data
        .map(stable)
        .sort((a: { id: string }, b: { id: string }) =>
          a.id.localeCompare(b.id),
        ),
    };
  };
  const before = await snapshot();
  compose('restart', 'server');
  await expect
    .poll(
      async () => {
        try {
          return (
            await request.get('http://localhost:4000/api/v1/health')
          ).status();
        } catch {
          return 0;
        }
      },
      { timeout: 60_000 },
    )
    .toBe(200);
  expect(await snapshot()).toEqual(before);
  const catalog = await (await request.get('/api/v1/apis')).json();
  expect(
    catalog.items.filter((a: { slug: string }) => a.slug === 'sample'),
  ).toHaveLength(1);
  const logs = compose('logs', '--no-color', 'server');
  expect(logs).not.toMatch(/pk_[A-Za-z0-9_-]{43}/);
  expect(logs).not.toContain('QA-password-123');
  expect(logs).not.toContain('change-me-now');
});

test('AC 6: server boots while Kong is down and the next reconcile repairs access without changing keys or subscriptions', async ({
  request,
}) => {
  test.setTimeout(120_000);
  const compose = (...args: string[]) =>
    execFileSync(
      'docker',
      [
        'compose',
        '-f',
        'deploy/docker-compose.yml',
        ...(process.env.SPEC005_COMPOSE_OVERRIDE
          ? ['-f', process.env.SPEC005_COMPOSE_OVERRIDE]
          : []),
        ...args,
      ],
      { encoding: 'utf8' },
    );
  const signup = await request.post('/api/auth/sign-up/email', {
    data: {
      name: 'Boot outage QA',
      email: `qa-boot-${crypto.randomUUID()}@example.com`,
      password: 'QA-password-123',
    },
  });
  expect(signup.status()).toBe(200);
  const sample = (await (await request.get('/api/v1/apis')).json()).items.find(
    (a: { slug: string }) => a.slug === 'sample',
  );
  const created = await request.post('/api/v1/apps', {
    data: { name: 'Boot outage', apiIds: [sample.id] },
  });
  expect(created.status()).toBe(201);
  const { app, credential } = await created.json();
  const before = await (await request.get(`/api/v1/apps/${app.id}`)).json();
  const service = await (
    await request.get('http://localhost:8001/services/portal-sample')
  ).json();
  expect(
    (
      await request.delete(
        `http://localhost:8001/consumers/portal-app-${app.id}/acls/portal-svc-${service.id}`,
      )
    ).ok(),
  ).toBe(true);
  try {
    compose('stop', 'kong');
    compose('restart', 'server');
    await expect
      .poll(
        async () => {
          try {
            return (await request.get('/api/v1/health')).status();
          } catch {
            return 0;
          }
        },
        { timeout: 60000 },
      )
      .toBe(200);
    expect(
      (await (await request.get('/api/v1/health')).json()).gateway.reachable,
    ).toBe(false);
    expect(await (await request.get(`/api/v1/apps/${app.id}`)).json()).toEqual(
      before,
    );
    let logs = '';
    await expect
      .poll(
        () => {
          logs = compose('logs', '--no-color', '--since', '30s', 'server');
          return logs;
        },
        { timeout: 30000 },
      )
      .toContain('gateway unavailable');
    expect(logs).not.toContain(credential.key);
    expect(logs).not.toContain('QA-password-123');
  } finally {
    compose('up', '-d', '--wait', 'kong');
  }
  // Invoke the same job body as pg-boss rather than waiting five wall-clock minutes.
  compose(
    'exec',
    '-T',
    'server',
    'node',
    '--input-type=module',
    '-e',
    `
    import { connect, instanceSettings } from './packages/db/dist/index.js';
    import { loadConfig } from './apps/server/dist/config.js';
    import { gatewayConnection } from './apps/server/dist/gateway-connection.js';
    import { reconcile } from './apps/server/dist/reconcile.js';
    const { db, client } = connect(process.env.DATABASE_URL);
    try {
      const [instance] = await db.select().from(instanceSettings);
      const log = { warn() {}, error() {} };
      const connection = gatewayConnection(db, loadConfig(), instance.instanceId, log);
      await reconcile(db, connection, log);
    } finally { await client.end(); }
  `,
  );
  await expect
    .poll(
      async () =>
        (
          await request.get('http://localhost:8000/sample/get', {
            headers: { apikey: credential.key },
          })
        ).status(),
      { timeout: 15000 },
    )
    .toBe(200);
  expect(await (await request.get(`/api/v1/apps/${app.id}`)).json()).toEqual(
    before,
  );
  const groups = (
    await (
      await request.get(
        `http://localhost:8001/consumers/portal-app-${app.id}/acls`,
      )
    ).json()
  ).data;
  expect(
    groups.filter(
      (g: { group: string }) => g.group === `portal-svc-${service.id}`,
    ),
  ).toHaveLength(1);
});

async function resetTryItLimit(request: {
  post: (
    url: string,
    options: { headers: Record<string, string> },
  ) => Promise<{ status: () => number }>;
}) {
  const port = process.env.PORTAL_API_PORT ?? '4000';
  const token = process.env.PORTAL_RATE_LIMIT_RESET ?? 'local-rate-limit-reset';
  const response = await request.post(
    `http://127.0.0.1:${port}/api/v1/test/reset-try-it-limit`,
    { headers: { 'x-portal-rate-limit-reset': token } },
  );
  expect(response.status()).toBe(204);
}

test('JSO-169: public ingress cannot rotate a client rate-limit budget with forged XFF', async ({
  request,
}) => {
  test.setTimeout(120_000);
  // Other journeys share this server process. Drop the in-memory buckets without
  // restarting it, including when a worktree is not on the default Compose project.
  await resetTryItLimit(request);
  try {
    const suffix = crypto.randomUUID().replaceAll('-', '');
    const call = (client: string) =>
      request.get('/api/v1/try-it', {
        headers: { 'x-forwarded-for': client },
      });
    // Caller-supplied addresses must never determine the budget.
    const client = `2001:db8:${suffix.slice(0, 4)}:${suffix.slice(4, 8)}::1`;
    const forged = `2001:db8:${suffix.slice(0, 4)}:${suffix.slice(4, 8)}::2`;
    for (let i = 0; i < 60; i++)
      expect((await call(client)).status()).toBe(400);
    expect((await call(client)).status()).toBe(429);
    // Same TCP source must retain its exhausted budget regardless of this header.
    expect((await call(forged)).status()).toBe(429);
    const spoofedHeaders: Record<string, string>[] = [
      {},
      { 'x-forwarded-for': `${forged}, 198.51.100.1` },
      { 'x-forwarded-for': 'not-an-ip' },
      {
        forwarded: 'for=198.51.100.2;proto=https',
        'x-real-ip': '198.51.100.3',
        'x-forwarded-for': forged,
      },
    ];
    for (const headers of spoofedHeaders) {
      expect((await request.get('/api/v1/try-it', { headers })).status()).toBe(
        429,
      );
    }
  } finally {
    await resetTryItLimit(request);
  }
});
