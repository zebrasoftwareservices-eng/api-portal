// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';

const origin = process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:3000';
const proxy = process.env.KONG_PROXY_PUBLIC_URL ?? 'http://localhost:8000';
test.use({ extraHTTPHeaders: { origin } });

test('011: live usage, first successful try-it call, private insights and internal ingest isolation', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const signup = await context.request.post('/api/auth/sign-up/email', {
    data: {
      name: 'Usage QA',
      email: `usage-${crypto.randomUUID()}@example.com`,
      password: 'QA-usage-password-123',
    },
  });
  expect(signup.status(), await signup.text()).toBe(200);
  const catalog = await (await context.request.get('/api/v1/apis')).json();
  const sample = catalog.items.find(
    (api: { slug: string }) => api.slug === 'sample',
  );
  expect(sample).toBeTruthy();
  const created = await context.request.post('/api/v1/apps', {
    data: { name: 'Usage QA', apiIds: [sample.id] },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { app, credential } = await created.json();
  for (let i = 0; i < 20; i++) {
    const response = await context.request.get(`${proxy}/sample/get`, {
      headers: { apikey: credential.key },
    });
    expect(response.status()).toBe(200);
  }
  await expect
    .poll(
      async () =>
        (
          await (
            await context.request.get(`/api/v1/apps/${app.id}/usage`)
          ).json()
        ).total,
      { timeout: 60000 },
    )
    .toBe(20);
  await page.goto(`/dashboard/apps/${app.id}`);
  await expect(
    page.getByText('No monthly limit', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Insights', exact: true }),
  ).toHaveCount(0);
  const denied = await context.request.get('/api/v1/admin/insights');
  expect(denied.status()).toBe(403);
  expect(denied.headers()['content-type']).toContain(
    'application/problem+json',
  );
  await page.goto('/admin/insights');
  await expect(
    page.getByRole('heading', { name: "You don't have access to Insights" }),
  ).toBeVisible();
  await expect(page.getByText('New sign-ups', { exact: true })).toHaveCount(0);
  const internal = await context.request.post('/api/v1/internal/usage/kong', {
    data: {},
  });
  expect(internal.status()).toBe(404);
  const call = await context.request.get(
    '/api/v1/try-it?scalar_url=' + encodeURIComponent(`${proxy}/sample/get`),
    { headers: { apikey: credential.key } },
  );
  expect(call.status()).toBe(200);
  await expect
    .poll(
      async () =>
        (
          await (
            await context.request.get(`/api/v1/apps/${app.id}/usage`)
          ).json()
        ).total,
      { timeout: 60000 },
    )
    .toBe(21);
  const signupUser = (await signup.json()).user;
  await context.clearCookies();
  const admin = await context.request.post('/api/auth/sign-in/email', {
    data: { email: 'admin@example.com', password: 'change-me-now' },
  });
  expect(admin.status(), await admin.text()).toBe(200);
  const insights = await (
    await context.request.get('/api/v1/admin/insights')
  ).json();
  expect(
    insights.timeToFirstCall.developers.find(
      (developer: { userId: string }) => developer.userId === signupUser.id,
    ),
  ).toMatchObject({
    firstCallAt: expect.any(String),
    secondsToFirstCall: expect.any(Number),
  });
  await page.goto('/admin/insights');
  await expect(
    page.getByRole('heading', { name: 'Insights', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('New sign-ups', { exact: true })).toBeVisible();
  await context.clearCookies();
  const anonymous = await context.request.get(`/api/v1/apps/${app.id}/usage`);
  expect(anonymous.status()).toBe(401);
  expect(anonymous.headers()['content-type']).toContain(
    'application/problem+json',
  );
});
