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
      ['compose', '-f', 'deploy/docker-compose.yml', ...args],
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
      ['compose', '-f', 'deploy/docker-compose.yml', ...args],
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
    return {
      service: service.id,
      route: route.id,
      plugin: plugins.data.find((p: { name: string }) => p.name === 'key-auth')
        .id,
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

test('JSO-169: public ingress cannot rotate a client rate-limit budget with forged XFF', async ({
  request,
}) => {
  test.setTimeout(120_000);
  // Other browser journeys use this same socket address. Reset the server's
  // in-memory buckets so this assertion starts with exactly 60 available calls.
  execFileSync(
    'docker',
    ['compose', '-f', 'deploy/docker-compose.yml', 'restart', 'server'],
    { stdio: 'ignore' },
  );
  await expect
    .poll(
      async () => {
        try {
          return (await request.get('/api/v1/health')).status();
        } catch {
          return 0;
        }
      },
      { timeout: 60_000 },
    )
    .toBe(200);
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const call = (client: string) =>
    request.get('/api/v1/try-it', {
      headers: { 'x-forwarded-for': client },
    });
  // Caller-supplied addresses must never determine the budget.
  const client = `2001:db8:${suffix.slice(0, 4)}:${suffix.slice(4, 8)}::1`;
  const forged = `2001:db8:${suffix.slice(0, 4)}:${suffix.slice(4, 8)}::2`;
  for (let i = 0; i < 60; i++) expect((await call(client)).status()).toBe(400);
  expect((await call(client)).status()).toBe(429);
  // Same TCP source must retain its exhausted budget regardless of this header.
  expect((await call(forged)).status()).toBe(429);
});
