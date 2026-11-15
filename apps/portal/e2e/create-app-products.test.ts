// SPDX-License-Identifier: Apache-2.0
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
} from '@playwright/test';

const origin = process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:3000';
const kong = process.env.KONG_ADMIN_URL ?? 'http://localhost:8001';
const proxy = process.env.KONG_PROXY_PUBLIC_URL ?? 'http://localhost:8000';
test.use({ extraHTTPHeaders: { origin } });
async function json(
  response: Pick<APIResponse, 'status' | 'text' | 'json'>,
  status = 200,
) {
  expect(response.status(), await response.text()).toBe(status);
  return response.json();
}
async function publish(request: APIRequestContext) {
  const id = crypto.randomUUID(),
    slug = `create-${id}`;
  await json(
    await request.put(`${kong}/services/${id}`, {
      data: { name: slug, url: 'http://httpbin:8080' },
    }),
    200,
  );
  await json(
    await request.post(`${kong}/services/${id}/routes`, {
      data: { paths: [`/${slug}`] },
    }),
    201,
  );
  return json(
    await request.post('/api/v1/admin/apis', {
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
    }),
    201,
  );
}

test('023 AC1–9: products first, visibility, refusal atomicity, loose API key and subscription', async ({
  page,
  context,
  playwright,
  baseURL,
}) => {
  test.setTimeout(120000);
  const operator = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin },
  });
  try {
    await json(
      await operator.post('/api/auth/sign-in/email', {
        data: { email: 'admin@example.com', password: 'change-me-now' },
      }),
    );
    const operatorTeam = (await json(await operator.get('/api/v1/teams')))
      .items[0].id;
    const fixture = async (
      label: string,
      visibility = 'open',
      withPlan = true,
      requiresApproval = false,
    ) => {
      const api = await publish(operator);
      const product = await json(
        await operator.post('/api/v1/admin/products', {
          data: {
            name: `${label} ${crypto.randomUUID()}`,
            description: 'Spec 023 QA',
            apiIds: [api.id],
          },
        }),
        201,
      );
      if (visibility !== 'open')
        await json(
          await operator.put(`/api/v1/admin/products/${product.id}/access`, {
            data: {
              visibility,
              existingSubscriptions: 'keep',
              ...(visibility === 'internal' ? { teamIds: [operatorTeam] } : {}),
            },
          }),
        );
      const plan = withPlan
        ? await json(
            await operator.post(`/api/v1/admin/products/${product.id}/plans`, {
              data: {
                name: 'Free',
                rateLimit: 100,
                rateLimitUnit: 'minute',
                monthlyQuota: 10000,
                apiIds: [api.id],
                requiresApproval,
              },
            }),
            201,
          )
        : undefined;
      return { api, product, plan };
    };
    const payments = await fixture('Payments');
    const noPlans = await fixture('Coming soon', 'open', false);
    const approval = await fixture('Approval', 'open', true, true);
    const internal = await fixture('Internal', 'internal');
    const manual = await fixture('Manual', 'manual');
    const hidden = await fixture('Hidden', 'hidden');
    const signedOut = await playwright.request.newContext({ baseURL });
    try {
      const publicProducts = await json(
        await signedOut.get('/api/v1/products'),
      );
      expect(
        publicProducts.items.map((p: { id: string }) => p.id),
      ).not.toContain(hidden.product.id);
      const publicApis = await json(await signedOut.get('/api/v1/apis'));
      expect(publicApis.items.map((a: { id: string }) => a.id)).not.toContain(
        hidden.api.id,
      );
    } finally {
      await signedOut.dispose();
    }
    await json(
      await context.request.post('/api/auth/sign-up/email', {
        data: {
          name: 'Create QA',
          email: `create-${crypto.randomUUID()}@example.com`,
          password: 'QA-password-123',
        },
      }),
    );
    const catalog = await json(await context.request.get('/api/v1/apis'));
    const sample = catalog.items.find(
      (a: { slug: string }) => a.slug === 'sample',
    );
    expect(sample.products).toEqual([]);
    await page.goto('/dashboard/apps/new');
    const products = page.getByRole('region', {
      name: 'Products',
      exact: true,
    });
    const row = (name: string) =>
      products
        .getByRole('listitem')
        .filter({ has: page.getByRole('heading', { name, exact: true }) });
    await expect(row(payments.product.name)).toContainText(payments.api.title);
    await expect(
      row(payments.product.name).getByRole('link', {
        name: `Subscribe to ${payments.product.name}`,
        exact: true,
      }),
    ).toHaveAttribute('href', `/products/${payments.product.slug}`);
    await expect(products.getByRole('checkbox')).toHaveCount(0);
    await expect(products.getByRole('combobox')).toHaveCount(0);
    expect(
      await products.evaluate(
        (element) =>
          !!(
            element.compareDocumentPosition(document.querySelector('input[type=checkbox]')!) &
            Node.DOCUMENT_POSITION_FOLLOWING
          ),
      ),
    ).toBe(true);
    for (const fixture of [payments, noPlans, approval, hidden])
      await expect(
        page.getByRole('checkbox', { name: new RegExp(fixture.api.title) }),
      ).toHaveCount(0);
    for (const fixture of [internal, manual]) {
      await expect(products).not.toContainText(fixture.product.name);
      await expect(
        page.getByRole('checkbox', { name: new RegExp(fixture.api.title) }),
      ).toHaveCount(0);
    }
    await expect(row(noPlans.product.name)).toContainText('Not available yet');
    await expect(row(noPlans.product.name).getByRole('link')).toHaveCount(0);
    await expect(
      row(approval.product.name).getByRole('link', {
        name: `Request access to ${approval.product.name}`,
      }),
    ).toHaveAttribute('href', `/products/${approval.product.slug}`);
    const checkbox = page.getByRole('checkbox', { name: /Sample HTTP API/ });
    await expect(checkbox).not.toBeChecked();
    await expect(page.locator('input:checked')).toHaveCount(0);
    const before = await json(await context.request.get('/api/v1/apps'));
    await page.getByLabel('App name', { exact: true }).fill('Loose app');
    await page.getByRole('button', { name: 'Create app and get key' }).click();
    await expect(page.locator('#api-error')).toContainText(
      'Choose at least one API, or subscribe to a product above.',
    );
    await expect(checkbox).toBeFocused();
    expect(await json(await context.request.get('/api/v1/apps'))).toEqual(
      before,
    );
    // Real Kong snapshot proves refusals neither issue keys nor create consumers.
    const consumers = await json(await operator.get(`${kong}/consumers`));
    const keys = await json(await operator.get(`${kong}/key-auths`));
    for (const body of [
      { name: 'Refused alone', apiIds: [payments.api.id] },
      { name: 'Refused mixed', apiIds: [sample.id, payments.api.id] },
    ]) {
      const response = await context.request.post('/api/v1/apps', {
        data: body,
      });
      const problem = await json(response, 409);
      expect(response.headers()['content-type']).toContain(
        'application/problem+json',
      );
      expect(problem.type).toBe('/problems/api-in-product');
      expect(problem.detail).toContain(payments.api.title);
      expect(problem.detail).toContain('Subscribe');
      expect(problem.errors).toContainEqual({
        pointer: `/apiIds/${body.apiIds.indexOf(payments.api.id)}`,
        message: expect.stringContaining(payments.api.title),
      });
      expect(problem.products).toContainEqual({
        id: payments.product.id,
        slug: payments.product.slug,
        name: payments.product.name,
      });
    }
    for (const field of ['planId', 'plan']) {
      const response = await context.request.post('/api/v1/apps', {
        data: {
          name: 'Invalid plan',
          apiIds: [sample.id],
          [field]: payments.plan.id,
        },
      });
      const problem = await json(response, 400);
      expect(response.headers()['content-type']).toContain(
        'application/problem+json',
      );
      expect(problem.errors).toContainEqual(
        expect.objectContaining({ pointer: `/${field}` }),
      );
    }
    for (const fixture of [internal, manual])
      await json(
        await context.request.post('/api/v1/apps', {
          data: { name: 'Invisible', apiIds: [fixture.api.id] },
        }),
        404,
      );
    await json(
      await context.request.post('/api/v1/admin/products', {
        data: { name: 'Forbidden', apiIds: [sample.id] },
      }),
      403,
    );
    expect(await json(await context.request.get('/api/v1/apps'))).toEqual(
      before,
    );
    expect(await json(await operator.get(`${kong}/consumers`))).toEqual(
      consumers,
    );
    expect(await json(await operator.get(`${kong}/key-auths`))).toEqual(keys);
    await checkbox.check();
    const created = page.waitForResponse(
      (r) =>
        r.url().endsWith('/api/v1/apps') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Create app and get key' }).click();
    const loose = await json(await created, 201);
    const reveal = page.getByRole('alertdialog');
    await expect(reveal.getByLabel('API key', { exact: true })).toHaveValue(
      loose.credential.key,
    );
    await reveal.getByRole('button', { name: "I've saved it" }).click();
    const upstream = await context.request.get(`${proxy}/sample/get`, {
      headers: { apikey: loose.credential.key },
    });
    expect(upstream.status()).toBe(200);
    expect((await upstream.json()).url).toContain('/get');
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Loose app', exact: true }),
    ).toBeVisible();
    expect(await page.content()).not.toContain(loose.credential.key);
    await json(
      await context.request.post('/api/v1/apps', {
        data: { name: 'Loose app', apiIds: [sample.id] },
      }),
      409,
    );
    await page.goto('/dashboard/apps/new');
    await page
      .getByRole('link', {
        name: `Subscribe to ${payments.product.name}`,
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('region', { name: 'Plans', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('link', { name: 'Subscribe to Free', exact: true })
      .click();
    await page
      .getByLabel('Subscription name', { exact: true })
      .fill('Payments subscription');
    const subscribed = page.waitForResponse(
      (r) =>
        r.url().endsWith('/api/v1/apps') && r.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'Subscribe and get key', exact: true })
      .click();
    const subscription = await json(await subscribed, 201);
    await expect(reveal.getByLabel('API key', { exact: true })).toHaveValue(
      subscription.credential.key,
    );
    await reveal.getByRole('button', { name: "I've saved it" }).click();
    const detail = await json(
      await context.request.get(`/api/v1/apps/${subscription.app.id}`),
    );
    expect(detail.credentials).toHaveLength(1);
    expect(detail.plan.id).toBe(payments.plan.id);
    await page.goto('/dashboard');
    await expect(
      page.getByRole('link', { name: 'Loose app', exact: true }).first(),
    ).toBeVisible();
    await expect(
      page
        .getByRole('link', { name: 'Payments subscription', exact: true })
        .first(),
    ).toBeVisible();
    await context.clearCookies();
    await json(
      await context.request.post('/api/v1/apps', {
        data: { name: 'Expired', apiIds: [sample.id] },
        headers: { cookie: 'better-auth.session_token=expired.invalid' },
      }),
      401,
    );
    await json(
      await context.request.post('/api/auth/sign-in/email', {
        data: { email: 'admin@example.com', password: 'change-me-now' },
      }),
    );
    await page.goto('/dashboard/apps/new');
    await expect(row(noPlans.product.name)).toContainText('Needs a plan');
    await expect(
      row(noPlans.product.name).getByRole('link', {
        name: `Add a plan to ${noPlans.product.name}`,
      }),
    ).toHaveAttribute('href', `/admin/products/${noPlans.product.slug}`);
  } finally {
    await operator.dispose();
  }
});
