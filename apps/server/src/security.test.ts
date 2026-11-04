// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi } from 'vitest';
import { loadConfig, DEV_AUTH_SECRET, DEV_ENCRYPTION_KEY } from './config.js';
import { encrypt, decrypt, generateKey } from './crypto.js';
import { importDocument, fetchDocument, readLimited } from './import.js';
import { resolveTarget } from './proxy.js';
import { publicDocument, type PublishedApi } from './catalog.js';
export const document = {
  openapi: '3.1.0',
  info: { title: 'Pets', version: '1.0.0' },
  paths: { '/pets': { get: { responses: { '200': { description: 'OK' } } } } },
};
export const row = {
  api: { document, routePath: '/sample' },
  gateway: {
    proxyPublicUrl: 'http://localhost:8000',
    proxyInternalUrl: 'http://kong:8000',
  },
} as PublishedApi;
describe('security boundaries', () => {
  it('refuses production defaults and malformed encryption keys', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow();
    expect(() => loadConfig({ PORTAL_ENCRYPTION_KEY: 'short' })).toThrow();
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        BETTER_AUTH_SECRET: DEV_AUTH_SECRET,
        PORTAL_ENCRYPTION_KEY: DEV_ENCRYPTION_KEY,
      }),
    ).toThrow();
  });
  it('encrypts credentials with authenticated encryption and generates high-entropy one-time keys', () => {
    const a = encrypt('admin-token', DEV_ENCRYPTION_KEY),
      b = encrypt('admin-token', DEV_ENCRYPTION_KEY);
    expect(a).not.toBe(b);
    expect(a).not.toContain('admin-token');
    expect(decrypt(a, DEV_ENCRYPTION_KEY)).toBe('admin-token');
    expect(generateKey()).toMatch(/^pk_[A-Za-z0-9_-]{43}$/);
    expect(generateKey()).not.toBe(generateKey());
  });
  it('rejects allowlist bypasses while forwarding published path segments', () => {
    for (const target of [
      'http://evil.test/sample',
      'http://localhost:8000/sample-evil',
      'http://localhost:8000/sample/../admin',
      'http://localhost:8000/sample/%2e%2e/admin',
      'http://localhost:8000/sample%2f../admin',
      'http://localhost:8000@evil.test/sample',
      'http://user@localhost:8000/sample',
    ])
      expect(resolveTarget(target, [row]), target).toBeNull();
    expect(
      resolveTarget('http://localhost:8000/sample/get?q=1', [row])?.url.href,
    ).toBe('http://kong:8000/sample/get?q=1');
  });
  it('rewrites served documents without modifying storage and injects missing key auth', () => {
    const served = publicDocument(row);
    expect(served.servers).toEqual([{ url: 'http://localhost:8000/sample' }]);
    expect(served.security).toEqual([{ portalApiKey: [] }]);
    expect(document).not.toHaveProperty('servers');
  });
  it('accepts valid OpenAPI and rejects invalid schema, versions, YAML and file refs', async () => {
    expect(
      (await importDocument({ content: JSON.stringify(document) })).document
        .info,
    ).toEqual(document.info);
    for (const content of [
      'a: [',
      JSON.stringify({ ...document, info: { version: '1' } }),
      JSON.stringify({
        ...document,
        paths: { '/x': { get: { responses: 'bad' } } },
      }),
    ])
      await expect(importDocument({ content })).rejects.toMatchObject({
        status: 422,
        code: 'invalid-openapi',
        errors: expect.any(Array),
      });
    await expect(
      importDocument({ content: 'swagger: "2.0"' }),
    ).rejects.toMatchObject({ code: 'unsupported-openapi-version' });
    await expect(
      importDocument({
        content: JSON.stringify({
          ...document,
          components: { schemas: { Pet: { $ref: 'file:///etc/passwd' } } },
        }),
      }),
    ).rejects.toMatchObject({ code: 'invalid-openapi' });
  });
  it.each(['3.0.3', '3.1.0'])(
    'names missing info in JSON and YAML OpenAPI %s imports',
    async (openapi) => {
      for (const content of [
        JSON.stringify({ openapi, paths: {} }),
        `openapi: ${openapi}\npaths: {}`,
      ]) {
        await expect(importDocument({ content })).rejects.toMatchObject({
          status: 422,
          code: 'invalid-openapi',
          message:
            "Invalid OpenAPI document: must have required property 'info' at /",
          errors: [
            { message: "must have required property 'info'", pointer: '' },
          ],
        });
      }
    },
  );
  it('reports other schema paths and still requires an explicit info.version', async () => {
    for (const [input, message, pointer] of [
      [
        { openapi: '3.0.3', info: document.info },
        "must have required property 'paths'",
        '',
      ],
      [{ ...document, info: null }, 'type must be object', '/info'],
      [
        { ...document, info: { version: '1' } },
        "must have required property 'title'",
        '/info',
      ],
      [
        { ...document, info: { title: 'Pets' } },
        'info.version is required',
        '/info/version',
      ],
    ] as const) {
      await expect(
        importDocument({ content: JSON.stringify(input) }),
      ).rejects.toMatchObject({
        status: 422,
        code: 'invalid-openapi',
        errors: [{ message, pointer }],
      });
    }
  });
  it('caps URL imports and rejects schemes, redirect loops and oversized responses', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(
        async () => new Response('x'.repeat(5 * 1024 * 1024 + 1)),
      );
    await expect(
      fetchDocument('file:///etc/passwd', fetcher),
    ).rejects.toMatchObject({ code: 'spec-url-unreachable' });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(
      fetchDocument('http://example.test/spec', fetcher),
    ).rejects.toMatchObject({ code: 'document-too-large' });
    const redirects = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(null, { status: 302, headers: { location: '/next' } }),
      );
    await expect(
      fetchDocument('http://example.test/spec', redirects),
    ).rejects.toMatchObject({ code: 'spec-url-unreachable' });
    expect(redirects).toHaveBeenCalledTimes(4);
    await expect(
      readLimited(new Response('1234'), 3, 'payload-too-large'),
    ).rejects.toMatchObject({ status: 413 });
  });
  it('bundles same-host URL references and prevents cross-host reference fetches', async () => {
    const root = {
      ...document,
      components: { schemas: { Pet: { $ref: './pet.json' } } },
    };
    const fetcher = vi
      .fn()
      .mockImplementation(async (url: URL) =>
        url.pathname === '/spec.json'
          ? Response.json(root)
          : Response.json({
              type: 'object',
              properties: { name: { type: 'string' } },
            }),
      );
    const bundled = await importDocument(
      { url: 'http://example.test/spec.json' },
      fetcher,
    );
    expect(bundled.document['x-ext']).toBeDefined();
    const evil = {
      ...document,
      components: { schemas: { Pet: { $ref: 'http://evil.test/pet.json' } } },
    };
    const other = vi.fn().mockImplementation(async () => Response.json(evil));
    await expect(
      importDocument({ url: 'http://example.test/spec.json' }, other),
    ).rejects.toMatchObject({ code: 'invalid-openapi' });
    expect(other).toHaveBeenCalledTimes(1);
  });
});
