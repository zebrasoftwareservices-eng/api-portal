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
  version: { document },
  api: { routePath: '/sample' },
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
    const served = publicDocument(row, document);
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
        code: content === 'a: [' ? 'invalid-openapi' : 'openapi-lint-failed',
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
    'reports invalid version names before lint on OpenAPI %s',
    async (openapi) => {
      for (const info of [
        undefined,
        null,
        { title: 'Pets' },
        { title: 'Pets', version: '../bad' },
      ])
        await expect(
          importDocument({
            content: JSON.stringify({ openapi, info, paths: {} }),
          }),
        ).rejects.toMatchObject({
          status: 422,
          code: 'invalid-api-version',
          errors: [
            { pointer: '/info/version', message: 'Invalid API version' },
          ],
        });
    },
  );
  it('reports structural schema errors through Spectral', async () => {
    for (const input of [
      { openapi: '3.0.3', info: document.info },
      { ...document, info: { version: '1' } },
    ])
      await expect(
        importDocument({ content: JSON.stringify(input) }),
      ).rejects.toMatchObject({
        status: 422,
        code: 'openapi-lint-failed',
        errors: expect.arrayContaining([
          expect.objectContaining({ rule: 'oas3-schema' }),
        ]),
      });
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
    const fetcher = vi.fn().mockImplementation(async (url: URL) =>
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
describe('version import lint pipeline', () => {
  it.each([
    [
      'operation-operationId-unique',
      {
        '/a': {
          get: {
            operationId: 'same',
            responses: { '200': { description: 'OK' } },
          },
        },
        '/b': {
          get: {
            operationId: 'same',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    ],
    [
      'invalid-ref',
      {
        '/a': {
          get: {
            responses: { '200': { $ref: '#/components/responses/Missing' } },
          },
        },
      },
    ],
    [
      'path-params',
      {
        '/pets/{id}': { get: { responses: { '200': { description: 'OK' } } } },
      },
    ],
  ])('reports %s before storage with source locations', async (rule, paths) => {
    await expect(
      importDocument({ content: JSON.stringify({ ...document, paths }) }),
    ).rejects.toMatchObject({
      code: 'openapi-lint-failed',
      errors: expect.arrayContaining([
        expect.objectContaining({
          rule,
          line: 1,
          pointer: expect.any(String),
          column: expect.any(Number),
          source: null,
        }),
      ]),
    });
  });
  it('lints a 2 MiB import in under ten seconds', async () => {
    const content = JSON.stringify({
      ...document,
      info: { ...document.info, description: 'x'.repeat(2 * 1024 * 1024) },
    });
    const start = performance.now();
    const result = await importDocument({ content });
    const elapsed = performance.now() - start;
    console.info(`2 MiB OpenAPI lint pipeline: ${Math.round(elapsed)} ms`);
    expect(elapsed).toBeLessThan(10000);
    expect(result.lintWarnings.length).toBeGreaterThan(0);
    expect(result.sourceContent).toBe(content);
  });
});
