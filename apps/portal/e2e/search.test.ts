// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const compose = (...args: string[]) =>
  execFileSync('node', ['scripts/worktree-compose.mjs', ...args], {
    stdio: 'pipe',
  });

test('020 AC1–7: live search, operation navigation, visibility and failure paths', async ({
  context,
  browser,
}) => {
  test.setTimeout(120000);
  const id = crypto.randomUUID();
  const slug = `search-${id}`;
  const title = `Orders API ${id}`;
  const kong = process.env.KONG_ADMIN_URL ?? 'http://localhost:8001';
  const admin = await context.request.post('/api/auth/sign-in/email', {
    data: { email: 'admin@example.com', password: 'change-me-now' },
  });
  expect(admin.status()).toBe(200);
  expect(
    (
      await context.request.put(`${kong}/services/${id}`, {
        data: { name: slug, url: 'http://httpbin:8080' },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await context.request.post(`${kong}/services/${id}/routes`, {
        data: { paths: [`/${slug}`] },
      })
    ).ok(),
  ).toBe(true);
  const document = {
    openapi: '3.0.3',
    info: { title, version: '1.0.0' },
    paths: {
      '/orders/{id}': {
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        get: {
          summary: 'Get an order',
          tags: ['Orders'],
          responses: { '200': { description: 'OK' } },
        },
        delete: {
          summary: 'Cancel an order',
          responses: { '204': { description: 'Cancelled' } },
        },
      },
      '/orders': {
        get: {
          summary: 'List orders',
          responses: { '200': { description: 'OK' } },
        },
      },
    },
  };
  const imported = await context.request.post('/api/v1/admin/apis', {
    data: {
      slug,
      gatewayServiceId: id,
      spec: { content: JSON.stringify(document) },
    },
  });
  expect(imported.status(), await imported.text()).toBe(201);
  const apiId = (await imported.json()).id;
  const productResponse = await context.request.post('/api/v1/admin/products', {
    data: { name: `Search ${id}`, description: 'Search QA', apiIds: [apiId] },
  });
  expect(productResponse.status(), await productResponse.text()).toBe(201);
  const productId = (await productResponse.json()).id;
  const visitor = await browser.newContext({
    baseURL: process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:3000',
  });
  try {
    const publicPage = await visitor.newPage();
    await publicPage.goto('/');
    const entry = publicPage.getByRole('searchbox').first();
    await entry.fill('orders/{id}');
    await entry.press('Enter');
    const operation = publicPage
      .getByRole('list', { name: 'Search results' })
      .getByRole('link')
      .filter({ hasText: title })
      .filter({ hasText: 'GET' });
    await expect(operation).toContainText('/orders/{id}');
    await expect(operation).toContainText(title);
    const href = await operation.getAttribute('href');
    expect(href).toContain(`/apis/${slug}#`);
    await operation.click();
    await expect(publicPage).toHaveURL(new RegExp(`/apis/${slug}#`));
    await expect(
      publicPage.getByRole('heading', { name: 'Get an order', exact: true }),
    ).toBeInViewport();
    for (const [term, kind] of [
      ['ORDERS API', 'api'],
      ['CANCEL ORDER', 'operation'],
    ] as const) {
      await publicPage.goto(
        `/search?q=${encodeURIComponent(`${term} ${kind === 'api' ? id : ''}`)}`,
      );
      const result = publicPage
        .getByRole('list', { name: 'Search results' })
        .getByRole('link')
        .filter({ hasText: title })
        .first();
      await expect(result).toBeVisible();
      await expect(result).toHaveAttribute(
        'href',
        kind === 'api' ? `/apis/${slug}` : /#/,
      );
    }
    await publicPage.goto(`/search?q=unmatched-${id}`);
    await expect(
      publicPage.getByRole('heading', { name: /Nothing matched/ }),
    ).toBeVisible();
    await expect(
      publicPage.getByRole('link', { name: 'Browse all APIs' }),
    ).toHaveAttribute('href', '/');
    for (const q of ['', '   ', 'x'.repeat(101)]) {
      const response = await visitor.request.get('/api/v1/search', {
        params: { q },
      });
      expect(response.status()).toBe(400);
      expect(response.headers()['content-type']).toContain(
        'application/problem+json',
      );
      expect((await response.json()).detail).toMatch(
        /Enter a search term|at most 100/,
      );
    }
    for (const q of ['x', 'x'.repeat(100), '{}/*%'])
      expect(
        (
          await visitor.request.get('/api/v1/search', { params: { q } })
        ).status(),
      ).toBe(200);
    const signup = await visitor.request.post('/api/auth/sign-up/email', {
      data: {
        name: 'Search member',
        email: `search-${id}@example.com`,
        password: 'Search-QA-password-123',
      },
    });
    expect(signup.status()).toBe(200);
    const userId = (await signup.json()).user.id;
    const teams = await (await visitor.request.get('/api/v1/teams')).json();
    const teamId = teams.items[0].id;
    const access = async (visibility: string, teamIds?: string[]) => {
      const response = await context.request.put(
        `/api/v1/admin/products/${productId}/access`,
        { data: { visibility, ...(teamIds ? { teamIds } : {}) } },
      );
      expect(response.status(), await response.text()).toBe(200);
    };
    const found = async () => {
      const response = await visitor.request.get('/api/v1/search', {
        params: { q: title },
      });
      expect(response.status()).toBe(200);
      const results = (await response.json()).items;
      const catalog = (await (await visitor.request.get('/api/v1/apis')).json())
        .items;
      for (const item of results)
        expect(catalog.map((a: { slug: string }) => a.slug)).toContain(
          item.api.slug,
        );
      return results.filter(
        (r: { api: { slug: string } }) => r.api.slug === slug,
      );
    };
    await access('hidden');
    const anonymous = await browser.newContext({
      baseURL: process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:3000',
    });
    try {
      const response = await anonymous.request.get('/api/v1/search', {
        params: { q: title },
      });
      expect(response.status()).toBe(200);
      expect((await response.json()).items).toEqual([]);
    } finally {
      await anonymous.close();
    }
    const forbidden = await visitor.request.put(
      `/api/v1/admin/products/${productId}/access`,
      { data: { visibility: 'open' } },
    );
    expect(forbidden.status()).toBe(403);
    expect(await found()).toHaveLength(1);
    await publicPage.goto(`/search?q=${encodeURIComponent(title)}`);
    await expect(
      publicPage.getByRole('list', { name: 'Search results' }),
    ).toContainText(title);
    await access('internal', [teamId]);
    expect(await found()).toHaveLength(1);
    // Expire the real session server-side while retaining the stale cookie.
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
      `UPDATE session SET expires_at=now()-interval '1 day' WHERE user_id='${userId}'`,
    );
    expect(await found()).toHaveLength(0);
    const denied = await visitor.request.put(
      `/api/v1/admin/products/${productId}/access`,
      { data: { visibility: 'open' } },
    );
    expect(denied.status()).toBe(401);
    await publicPage.goto(`/search?q=${encodeURIComponent(title)}`);
    await expect(
      publicPage.getByRole('heading', { name: /Nothing matched/ }),
    ).toBeVisible();
    await access('open');
    const before = await found();
    // Repeated reads stay identical, including while Kong is unreachable.
    expect(await found()).toEqual(before);
    try {
      compose('stop', 'kong');
      expect(await found()).toEqual(before);
    } finally {
      compose('start', '--wait', 'kong');
    }
    const next = await context.request.post(
      `/api/v1/admin/apis/${slug}/versions`,
      {
        data: {
          spec: {
            content: JSON.stringify({
              ...document,
              info: { title, version: '2.0.0' },
              paths: {},
            }),
          },
        },
      },
    );
    expect(next.status(), await next.text()).toBe(201);
    const removed = await visitor.request.get('/api/v1/search', {
      params: { q: 'GET /orders' },
    });
    expect(
      (await removed.json()).items.filter(
        (r: { api: { slug: string } }) => r.api.slug === slug,
      ),
    ).toEqual([]);
    // Unpublish directly: the catalog has no unpublish endpoint.
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
      `UPDATE apis SET latest_version_id=NULL WHERE id='${apiId}'`,
    );
    expect(await found()).toHaveLength(0);
    await publicPage.goto(`/search?q=${encodeURIComponent(title)}`);
    await expect(
      publicPage.getByRole('heading', { name: /Nothing matched/ }),
    ).toBeVisible();
  } finally {
    await visitor.close();
  }
});
