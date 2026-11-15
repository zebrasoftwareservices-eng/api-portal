// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';

const origin = process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:3000';
test.use({ extraHTTPHeaders: { origin } });

test('021 AC1–7: anonymous docs, exact version downloads, visibility and browser samples', async ({
  page,
  context,
  playwright,
}) => {
  test.setTimeout(90000);
  const anonymous = await playwright.request.newContext({ baseURL: origin });
  const slug = `agent-${crypto.randomUUID()}`;
  const service = crypto.randomUUID();
  const kong = process.env.KONG_ADMIN_URL ?? 'http://localhost:8001';
  const source = (version: string) => ({
    openapi: '3.0.3',
    info: { title: slug, version, description: 'Agent QA description' },
    components: {
      securitySchemes: {
        agentKey: { type: 'apiKey', in: 'header', name: 'x-agent-key' },
      },
    },
    security: [{ agentKey: [] }],
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
          summary: 'Read an order',
          responses: {
            '200': { description: 'OK' },
            '404': { description: 'Missing' },
          },
        },
      },
      '/orders': {
        post: {
          summary: 'Create an order',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { name: { type: 'string', example: 'QA order' } },
                },
                example: { name: 'QA order' },
              },
            },
          },
          responses: { '201': { description: 'Created' } },
        },
      },
    },
  });
  const yaml =
    '# Original bytes and comment\nopenapi: 3.0.3\ninfo:\n  title: Agent QA old\n  version: 1.0.0\npaths:\n  /old:\n    get:\n      responses:\n        "200":\n          description: OK\n';
  const json = JSON.stringify(source('2.0.0'), null, 2) + '\n';
  try {
    expect(
      (
        await context.request.post('/api/auth/sign-in/email', {
          data: { email: 'admin@example.com', password: 'change-me-now' },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await context.request.put(`${kong}/services/${service}`, {
          data: { name: slug, url: 'http://httpbin:8080' },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await context.request.post(`${kong}/services/${service}/routes`, {
          data: { paths: [`/${slug}`] },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await context.request.post(`${kong}/services/${service}/plugins`, {
          data: { name: 'key-auth', config: { key_names: ['x-agent-key'] } },
        })
      ).status(),
    ).toBe(201);
    const imported = await context.request.post('/api/v1/admin/apis', {
      data: { slug, gatewayServiceId: service, spec: { content: yaml } },
    });
    expect(imported.status(), await imported.text()).toBe(201);
    const api = await imported.json();
    const published = await context.request.post(
      `/api/v1/admin/apis/${slug}/versions`,
      { data: { spec: { content: json } } },
    );
    expect(published.status(), await published.text()).toBe(201);
    // Duplicate publication cannot replace the source exposed to agents.
    expect(
      (
        await context.request.post(`/api/v1/admin/apis/${slug}/versions`, {
          data: { spec: { content: json } },
        })
      ).status(),
    ).toBe(409);
    const index = await anonymous.get('/llms.txt');
    expect(index.status()).toBe(200);
    expect(index.headers()['content-type']).toContain('text/plain');
    const text = await index.text();
    expect(text).toContain(`# Developer Portal`);
    expect(text).toContain(
      `[${slug}](${origin}/api/v1/apis/${slug}/reference.md): Agent QA description`,
    );
    for (const request of [context.request, anonymous]) {
      expect(
        await (
          await request.get('/llms.txt', {
            headers: {
              apikey: 'invalid-key',
              cookie: 'better-auth.session_token=expired',
            },
          })
        ).text(),
      ).toBe(text);
    }
    expect(await (await context.request.get('/llms.txt')).text()).toBe(text);
    const catalog = (await (await anonymous.get('/api/v1/apis')).json())
      .items as { slug: string }[];
    expect((text.match(/^- \[/gm) ?? []).length).toBe(catalog.length);
    for (const api of catalog)
      expect(text).toContain(`/apis/${api.slug}/reference.md`);
    const developer = await playwright.request.newContext({
      baseURL: origin,
      extraHTTPHeaders: { origin },
    });
    try {
      expect(
        (
          await developer.post('/api/auth/sign-up/email', {
            data: {
              name: 'Agent reader',
              email: `${slug}@example.com`,
              password: 'agent-reader-password',
            },
          })
        ).status(),
      ).toBe(200);
      expect(await (await developer.get('/llms.txt')).text()).toBe(text);
    } finally {
      await developer.dispose();
    }
    // Follow all emitted reference/download links, including APIs from the catalog.
    const links = [...text.matchAll(/https?:\/\/[^\s)]+/g)].map(
      (match) => match[0],
    );
    expect(links.length).toBeGreaterThan(0);
    for (const link of links)
      expect((await anonymous.get(link)).status(), link).toBe(200);
    const markdown = await anonymous.get(`/api/v1/apis/${slug}/reference.md`);
    expect(markdown.headers()['content-type']).toContain('text/markdown');
    for (const part of [
      '### GET /orders/{id}',
      'Read an order',
      '| id | path | yes | string |',
      'Responses: 200, 404',
      '### POST /orders',
      'Create an order',
      'Responses: 201',
    ])
      expect(await markdown.text()).toContain(part);
    for (const [suffix, bytes, type] of [
      ['spec', json, 'json'],
      ['versions/2.0.0/spec', json, 'json'],
      ['versions/1.0.0/spec', yaml, 'yaml'],
    ]) {
      const download = await anonymous.get(`/api/v1/apis/${slug}/${suffix}`);
      expect(download.status()).toBe(200);
      expect(await download.text()).toBe(bytes);
      expect(download.headers()['content-type']).toContain(
        `application/${type}`,
      );
    }
    for (const version of ['2.0.0', '1.0.0']) {
      await page.goto(
        version === '2.0.0'
          ? `/apis/${slug}`
          : `/apis/${slug}/versions/${version}`,
      );
      const prefix =
        version === '2.0.0'
          ? `/api/v1/apis/${slug}`
          : `/api/v1/apis/${slug}/versions/${version}`;
      await expect(
        page.getByRole('link', {
          name: `View as Markdown (version ${version})`,
        }),
      ).toHaveAttribute('href', `${prefix}/reference.md`);
      await expect(
        page.getByRole('link', { name: `Download spec (version ${version})` }),
      ).toHaveAttribute('href', `${prefix}/spec`);
    }
    await page.goto(`/apis/${slug}`);
    const sample = page.getByRole('group', {
      name: 'Request Example for post/orders',
      exact: true,
    });
    for (const client of [null, 'Fetch', 'Requests']) {
      if (client) {
        await page
          .getByRole('button', { name: 'More Select from all clients' })
          .click();
        await page
          .getByRole('option', { name: client, exact: true })
          .first()
          .click();
      }
      await expect(sample).toContainText(
        `${process.env.KONG_PROXY_PUBLIC_URL ?? 'http://localhost:8000'}/${slug}/orders`,
      );
      await expect(sample).toContainText(/POST|post/);
      await expect(sample).toContainText('x-agent-key');
      await expect(sample).toContainText('YOUR_SECRET_TOKEN');
      await expect(sample).toContainText('QA order');
    }
    for (const path of [
      `/api/v1/apis/missing-${slug}/reference.md`,
      `/api/v1/apis/missing-${slug}/spec`,
      `/api/v1/apis/${slug}/versions/missing/spec`,
      `/api/v1/apis/${slug}/versions/missing/reference.md`,
    ]) {
      const missing = await anonymous.get(path);
      expect(missing.status()).toBe(404);
      expect(missing.headers()['content-type']).toContain(
        'application/problem+json',
      );
      expect((await missing.json()).detail).toContain(
        path.includes('versions') ? 'missing' : `missing-${slug}`,
      );
    }
    const product = await context.request.post('/api/v1/admin/products', {
      data: { name: slug, slug, description: 'Private QA', apiIds: [api.id] },
    });
    expect(product.status(), await product.text()).toBe(201);
    const productId = (await product.json()).id;
    const teamId = (await (await context.request.get('/api/v1/teams')).json())
      .items[0].id;
    for (const visibility of ['hidden', 'manual', 'internal']) {
      const access = await context.request.put(
        `/api/v1/admin/products/${productId}/access`,
        {
          data: {
            visibility,
            ...(visibility === 'internal' ? { teamIds: [teamId] } : {}),
          },
        },
      );
      expect(access.status(), await access.text()).toBe(200);
      expect(await (await anonymous.get('/llms.txt')).text()).not.toContain(
        `/apis/${slug}/`,
      );
      for (const suffix of [
        'reference.md',
        'spec',
        'versions/1.0.0/reference.md',
        'versions/1.0.0/spec',
      ]) {
        const refused = await anonymous.get(`/api/v1/apis/${slug}/${suffix}`, {
          headers: {
            cookie: 'better-auth.session_token=expired',
            apikey: 'invalid',
          },
        });
        expect(refused.status()).toBe(404);
        expect(refused.headers()['content-type']).toContain(
          'application/problem+json',
        );
      }
    }
  } finally {
    await anonymous.dispose();
  }
});
