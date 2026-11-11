// SPDX-License-Identifier: Apache-2.0
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { importDocument, importSlug } from './import.js';
import { problemHandler } from './problem.js';

describe('import slug validation', () => {
  it.each(['日本語', 'A', '日本語 A'])(
    'JSO-188: asks for a slug for %s',
    async (title) => {
      const app = Fastify();
      problemHandler(app);
      app.post('/import', async () => ({ slug: importSlug(title) }));
      try {
        const response = await app.inject({ method: 'POST', url: '/import' });
        expect(response.statusCode).toBe(422);
        expect(response.json()).toMatchObject({
          type: '/problems/slug-required',
          title: 'Slug required',
          detail: "We can't make a slug from this API's title. Enter a slug.",
          errors: [
            {
              pointer: '/slug',
              message:
                'Enter a slug. The title has no letters or digits to make one from.',
            },
          ],
        });
      } finally {
        await app.close();
      }
    },
  );

  it('JSO-188: keeps ASCII parts of titles and accepts an explicit slug', () => {
    expect(importSlug('日本語 API')).toBe('api');
    expect(importSlug('日本語', 'my-api')).toBe('my-api');
    expect(importSlug('A B')).toBe('a-b');
    expect(() => importSlug('Valid title', 'INVALID')).toThrow();
  });
});

describe('import syntax errors', () => {
  it.each([
    ['YAML', 'openapi: 3.0.3\ninfo: [\n'],
    [
      'JSON',
      '{"openapi": "3.0.3",\n "info": {"title": "Pets" "version": "1"}}',
    ],
  ])(
    'JSO-184: includes the first %s error location',
    async (_format, content) => {
      const app = Fastify();
      problemHandler(app);
      app.post('/import', async () => importDocument({ content }));
      try {
        const response = await app.inject({ method: 'POST', url: '/import' });
        expect(response.statusCode).toBe(422);
        const problem = response.json();
        expect(problem.type).toBe('/problems/invalid-openapi');
        expect(problem.errors).toHaveLength(1);
        const { line, column, message } = problem.errors[0];
        expect(line).toBeGreaterThanOrEqual(1);
        expect(column).toBeGreaterThanOrEqual(1);
        expect(message).toEqual(expect.any(String));
        expect(problem.detail).toBe(
          `Invalid OpenAPI document: ${message} at line ${line}, column ${column}`,
        );
      } finally {
        await app.close();
      }
    },
  );

  it('keeps schema-level errors as pointers without syntax coordinates', async () => {
    await expect(
      importDocument({ content: 'openapi: 3.0.3\ninfo: {}' }),
    ).rejects.toMatchObject({
      code: 'invalid-api-version',
      errors: [{ message: 'Invalid API version', pointer: '/info/version' }],
    });
  });
});
