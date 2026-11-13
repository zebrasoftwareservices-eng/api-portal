// SPDX-License-Identifier: Apache-2.0
import { expect, test, type APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const origin = process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:3000';
const kong = process.env.KONG_ADMIN_URL ?? 'http://localhost:8001';
const proxy = process.env.KONG_PROXY_PUBLIC_URL ?? 'http://localhost:8000';
const password = 'QA-products-password-123';
test.use({ extraHTTPHeaders: { origin } });
const compose = (...args: string[]) =>
  execFileSync('node', ['scripts/worktree-compose.mjs', ...args], {
    stdio: 'pipe',
    timeout: 120000,
  });
async function admin(request: APIRequestContext) {
  const result = await request.post('/api/auth/sign-in/email', {
    data: { email: 'admin@example.com', password: 'change-me-now' },
  });
  expect(result.status(), await result.text()).toBe(200);
}
async function developer(request: APIRequestContext) {
  const result = await request.post('/api/auth/sign-up/email', {
    data: {
      name: 'Products QA',
      email: `products-${crypto.randomUUID()}@example.com`,
      password,
    },
  });
  expect(result.status(), await result.text()).toBe(200);
}
async function publish(request: APIRequestContext) {
  const id = crypto.randomUUID(),
    slug = `plans-${id}`;
  expect(
    (
      await request.put(`${kong}/services/${id}`, {
        data: { name: slug, url: 'http://httpbin:8080' },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.post(`${kong}/services/${id}/routes`, {
        data: { paths: [`/${slug}`] },
      })
    ).ok(),
  ).toBe(true);
  // The operator enables key-auth before publishing a protected API. Without
  // authentication Kong cannot identify the consumer for its plan limits.
  const auth = await request.post(`${kong}/services/${id}/plugins`, {
    data: { name: 'key-auth', config: { key_names: ['apikey'] } },
  });
  expect(auth.status(), await auth.text()).toBe(201);
  const result = await request.post('/api/v1/admin/apis', {
    data: {
      slug,
      gatewayServiceId: id,
      spec: {
        content: JSON.stringify({
          openapi: '3.1.0',
          info: { title: slug, version: '1.0.0' },
          paths: {
            '/get': { get: { responses: { '200': { description: 'OK' } } } },
          },
        }),
      },
    },
  });
  expect(result.status(), await result.text()).toBe(201);
  return { ...(await result.json()), slug } as { id: string; slug: string };
}
async function call(request: APIRequestContext, slug: string, key: string) {
  return request.get(`${proxy}/${slug}/get`, { headers: { apikey: key } });
}
// Rate windows are the subject of this test: synchronize to a clock boundary,
// rather than retrying requests (which would alter the quota being measured).
async function boundary() {
  const target = Math.floor(Date.now() / 1000) + 1;
  await expect
    .poll(() => Math.floor(Date.now() / 1000), {
      intervals: [10],
      timeout: 2000,
    })
    .toBe(target);
}

test('009 AC1–8: admin product/forms, two-API subscription, live rate/quota, upgrade, regenerate and cancel', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await admin(context.request);
  const apis = [await publish(context.request), await publish(context.request)];
  const name = `Product ${crypto.randomUUID()}`,
    slug = name.toLowerCase().replaceAll(' ', '-');
  await page.goto('/admin/products/new');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Description', { exact: true }).fill('Two APIs for QA');
  await page.getByLabel('Slug', { exact: true }).fill(slug);
  for (const api of apis)
    await page.getByRole('checkbox', { name: `${api.slug} v1.0.0` }).check();
  await page
    .getByRole('button', { name: 'Create product', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/admin/products/${slug}\\?`));
  await page.getByRole('link', { name: 'Add plan', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Free');
  await page.getByLabel('Rate limit', { exact: true }).fill('0');
  await page.getByLabel('Monthly quota', { exact: true }).fill('2.5');
  await page.getByRole('button', { name: 'Create plan', exact: true }).click();
  await expect(page.getByLabel('Rate limit', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(
    page.getByLabel('Monthly quota', { exact: true }),
  ).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Rate limit', { exact: true }).fill('5');
  await page.getByLabel('Monthly quota', { exact: true }).fill('10000');
  await page.getByRole('button', { name: 'Create plan', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/products/${slug}\\?`));
  const product = await (
    await context.request.get(`/api/v1/products/${slug}`)
  ).json();
  const plan = product.plans[0];
  const nextResponse = await context.request.post(
    `/api/v1/admin/products/${product.id}/plans`,
    {
      data: {
        name: 'Large',
        rateLimit: 20,
        rateLimitUnit: 'second',
        monthlyQuota: 20000,
        apiIds: apis.map((a) => a.id),
      },
    },
  );
  expect(nextResponse.status()).toBe(201);
  const quotaResponse = await context.request.post(
    `/api/v1/admin/products/${product.id}/plans`,
    {
      data: {
        name: 'Quota',
        rateLimit: 5,
        rateLimitUnit: 'second',
        monthlyQuota: 10,
        apiIds: apis.map((a) => a.id),
      },
    },
  );
  expect(quotaResponse.status()).toBe(201);
  const quotaPlan = await quotaResponse.json();
  await context.clearCookies();
  await developer(context.request);
  await page.goto('/');
  await expect(
    page.getByRole('link').filter({
      has: page.getByRole('heading', { name, exact: true }),
    }),
  ).toBeVisible();
  await page.goto(`/products/${slug}`);
  const table = page.getByRole('region', { name: 'Plans', exact: true });
  await expect(table).toContainText('5 requests per second');
  await expect(table).toContainText('10,000 requests per calendar month, UTC');
  for (const api of apis) await expect(table).toContainText(api.slug);
  await page.goto(`/products/${slug}/subscribe?plan=${plan.id}`);
  await page
    .getByLabel('Subscription name', { exact: true })
    .fill('My two APIs');
  const createdPromise = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/apps') && r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Subscribe and get key', exact: true })
    .click();
  const createdResponse = await createdPromise;
  expect(createdResponse.status(), await createdResponse.text()).toBe(201);
  const { app, credential } = await createdResponse.json();
  const reveal = page.getByRole('alertdialog');
  await expect(reveal.getByLabel('API key', { exact: true })).toHaveValue(
    credential.key,
  );
  await reveal.getByRole('button', { name: "I've saved it" }).click();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'My two APIs', exact: true }),
  ).toBeVisible();
  expect(await page.content()).not.toContain(credential.key);
  for (const api of apis) {
    const result = await call(context.request, api.slug, credential.key);
    expect(result.status()).toBe(200);
    expect((await result.json()).url).toContain('/get');
  }
  await boundary();
  const burstStart = Date.now();
  const burst = [];
  for (let i = 0; i < 6; i++) {
    const result = await call(context.request, apis[0]!.slug, credential.key);
    burst.push({
      status: result.status(),
      headers: result.headers(),
      at: Date.now(),
    });
  }
  expect(
    burst.map((result) => result.status),
    JSON.stringify(burst),
  ).toEqual([200, 200, 200, 200, 200, 429]);
  expect(Date.now() - burstStart).toBeLessThan(900);
  await boundary();
  expect(
    (await call(context.request, apis[0]!.slug, credential.key)).status(),
  ).toBe(200);
  await page.getByRole('button', { name: 'Change plan…', exact: true }).click();
  await page.getByRole('radio', { name: 'Large', exact: true }).check();
  await page
    .getByRole('button', { name: 'Change to Large', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Changed to Large' }),
  ).toBeVisible();
  await boundary();
  for (let i = 0; i < 10; i++)
    expect(
      (await call(context.request, apis[i % 2]!.slug, credential.key)).status(),
    ).toBe(200);
  const stored = await (
    await context.request.get(`/api/v1/apps/${app.id}`)
  ).json();
  expect(
    stored.credentials.find((c: { status: string }) => c.status === 'active')
      .id,
  ).toBe(credential.id);
  expect(JSON.stringify(stored)).not.toContain(credential.key);
  await page.getByRole('button', { name: /Regenerate key …/ }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Regenerate key', exact: true })
    .click();
  const replacement = await reveal
    .getByLabel('API key', { exact: true })
    .inputValue();
  expect(replacement).not.toBe(credential.key);
  await reveal.getByRole('button', { name: "I've saved it" }).click();
  expect(
    (await call(context.request, apis[0]!.slug, credential.key)).status(),
  ).toBe(401);
  expect(
    (await call(context.request, apis[1]!.slug, replacement)).status(),
  ).toBe(200);
  await page.reload();
  expect(await page.content()).not.toContain(replacement);
  await page
    .getByRole('button', { name: 'Cancel subscription…', exact: true })
    .click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Cancel subscription', exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard\?notice=/);
  await expect(
    page.getByRole('link', { name: 'My two APIs', exact: true }),
  ).toHaveCount(0);
  expect([401, 403]).toContain(
    (await call(context.request, apis[0]!.slug, replacement)).status(),
  );
  const quota = await context.request.post('/api/v1/apps', {
    data: { name: 'Monthly quota', planId: quotaPlan.id },
  });
  expect(quota.status()).toBe(201);
  const bounded = await quota.json();
  for (let i = 0; i < 10; i++) {
    if (i % 2 === 0) await boundary();
    expect(
      (
        await call(context.request, apis[i % 2]!.slug, bounded.credential.key)
      ).status(),
    ).toBe(200);
  }
  await boundary();
  expect(
    (
      await call(context.request, apis[0]!.slug, bounded.credential.key)
    ).status(),
  ).toBe(429);
});

test('009 AC9–10: real Kong outage, permissions and expired sessions preserve subscription, plan and key', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await admin(context.request);
  const api = await publish(context.request);
  const p = await context.request.post('/api/v1/admin/products', {
    data: {
      name: `Outage ${crypto.randomUUID()}`,
      description: 'Outage fixture',
      apiIds: [api.id],
    },
  });
  expect(p.status()).toBe(201);
  const product = await p.json();
  const planIds: string[] = [];
  for (const rate of [5, 20]) {
    const res = await context.request.post(
      `/api/v1/admin/products/${product.id}/plans`,
      {
        data: {
          name: `Rate ${rate}`,
          rateLimit: rate,
          rateLimitUnit: 'second',
          monthlyQuota: 10000,
          apiIds: [api.id],
        },
      },
    );
    expect(res.status()).toBe(201);
    planIds.push((await res.json()).id);
  }
  await context.clearCookies();
  await developer(context.request);
  const res = await context.request.post('/api/v1/apps', {
    data: { name: 'Outage original', planId: planIds[0] },
  });
  expect(res.status()).toBe(201);
  const { app, credential } = await res.json();
  const before = await (
    await context.request.get(`/api/v1/apps/${app.id}`)
  ).json();
  const listBefore = await (await context.request.get('/api/v1/apps')).json();
  compose('stop', 'kong');
  try {
    const results = [
      await context.request.post('/api/v1/apps', {
        data: { name: 'Must not exist', planId: planIds[0] },
      }),
      await context.request.put(`/api/v1/apps/${app.id}/plan`, {
        data: { planId: planIds[1] },
      }),
      await context.request.post(
        `/api/v1/apps/${app.id}/credentials/${credential.id}/regenerate`,
      ),
      await context.request.delete(`/api/v1/apps/${app.id}`),
    ];
    for (const result of results) {
      expect(result.status(), await result.text()).toBe(503);
      expect(result.headers()['content-type']).toContain(
        'application/problem+json',
      );
      expect((await result.json()).type).toBe('/problems/gateway-unavailable');
    }
    expect(
      await (await context.request.get(`/api/v1/apps/${app.id}`)).json(),
    ).toEqual(before);
    expect(await (await context.request.get('/api/v1/apps')).json()).toEqual(
      listBefore,
    );
    await page.goto(`/products/${product.slug}/subscribe?plan=${planIds[0]}`);
    await page
      .getByLabel('Subscription name', { exact: true })
      .fill('UI outage');
    await page
      .getByRole('button', { name: 'Subscribe and get key', exact: true })
      .click();
    await expect(
      page.getByRole('alert').filter({ hasText: /gateway/i }),
    ).toContainText(/unavailable|couldn't reach/i);
    // Exercise each existing-subscription dialog against the stopped gateway,
    // so API rollback coverage also proves the developer sees a useful error.
    await page.goto(`/dashboard/apps/${app.id}`);
    await page
      .getByRole('button', { name: 'Change plan…', exact: true })
      .click();
    const change = page.getByRole('dialog');
    await change.getByRole('radio', { name: 'Rate 20', exact: true }).check();
    await change
      .getByRole('button', { name: 'Change to Rate 20', exact: true })
      .click();
    await expect(change.getByRole('alert')).toContainText(
      /gateway.*unavailable|couldn't reach.*gateway/i,
    );
    await change.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: /Regenerate key …/ }).click();
    const regenerate = page.getByRole('alertdialog');
    await regenerate
      .getByRole('button', { name: 'Regenerate key', exact: true })
      .click();
    await expect(regenerate.getByRole('alert')).toContainText(
      /gateway.*unavailable|couldn't reach.*gateway/i,
    );
    await regenerate
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Cancel subscription…', exact: true })
      .click();
    const cancel = page.getByRole('alertdialog');
    await cancel
      .getByRole('button', { name: 'Cancel subscription', exact: true })
      .click();
    await expect(cancel.getByRole('alert')).toContainText(
      /gateway.*unavailable|couldn't reach.*gateway/i,
    );
    await cancel
      .getByRole('button', { name: 'Keep subscription', exact: true })
      .click();
    expect(
      await (await context.request.get(`/api/v1/apps/${app.id}`)).json(),
    ).toEqual(before);
    expect(await (await context.request.get('/api/v1/apps')).json()).toEqual(
      listBefore,
    );
  } finally {
    compose('start', '--wait', 'kong');
  }
  expect((await call(context.request, api.slug, credential.key)).status()).toBe(
    200,
  );
  const planInput = {
    name: 'Denied',
    rateLimit: 5,
    rateLimitUnit: 'second',
    monthlyQuota: 10000,
    apiIds: [api.id],
  };
  for (const result of [
    await context.request.post('/api/v1/admin/products', {
      data: { name: 'Denied', apiIds: [api.id] },
    }),
    await context.request.patch(`/api/v1/admin/products/${product.id}`, {
      data: { name: 'Denied' },
    }),
    await context.request.post(`/api/v1/admin/products/${product.id}/plans`, {
      data: planInput,
    }),
    await context.request.put(
      `/api/v1/admin/products/${product.id}/plans/${planIds[0]}`,
      { data: planInput },
    ),
  ]) {
    expect(result.status(), await result.text()).toBe(403);
    expect(result.headers()['content-type']).toContain(
      'application/problem+json',
    );
  }
  const teamId = app.teamId;
  expect(teamId).toMatch(/^[0-9a-f-]{36}$/);
  const role = (value: string) =>
    compose(
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'portal',
      '-d',
      'portal',
      '-c',
      `UPDATE team_members SET role = '${value}' WHERE team_id = '${teamId}'`,
    );
  async function deniedMutations(status: number) {
    for (const result of [
      await context.request.post('/api/v1/apps', {
        data: { name: 'Denied', teamId, planId: planIds[0] },
      }),
      await context.request.put(`/api/v1/apps/${app.id}/plan`, {
        data: { planId: planIds[1] },
      }),
      await context.request.post(
        `/api/v1/apps/${app.id}/credentials/${credential.id}/regenerate`,
      ),
      await context.request.delete(`/api/v1/apps/${app.id}`),
    ]) {
      expect(result.status(), await result.text()).toBe(status);
      expect(result.headers()['content-type']).toContain(
        'application/problem+json',
      );
    }
  }
  role('read-only');
  try {
    await deniedMutations(403);
    await page.goto(`/dashboard/apps/${app.id}`);
    await expect(
      page.getByRole('button', { name: 'Change plan…', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Cancel subscription…', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Regenerate key …/ }),
    ).toHaveCount(0);
    expect(
      await (await context.request.get(`/api/v1/apps/${app.id}`)).json(),
    ).toEqual({ ...before, role: 'read-only' });
    expect(await (await context.request.get('/api/v1/apps')).json()).toEqual({
      ...listBefore,
      items: listBefore.items.map((item: { teamId: string }) =>
        item.teamId === teamId ? { ...item, role: 'read-only' } : item,
      ),
    });
  } finally {
    role('admin');
  }
  await context.clearCookies();
  await deniedMutations(401);
  expect((await call(context.request, api.slug, credential.key)).status()).toBe(
    200,
  );
});
