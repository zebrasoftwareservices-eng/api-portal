// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { expect, it } from 'vitest';
import { referenceDocument } from './reference-document';

it('supplies a valid POST example without mutating the original seed or schema', () => {
  const seed = parse(
    readFileSync('../server/seed/sample-api.openapi.yaml', 'utf8'),
  );
  const original = structuredClone(seed);
  const rendered = referenceDocument(seed) as typeof seed;
  expect(
    rendered.paths['/post'].post.requestBody.content['application/json'],
  ).toEqual({
    schema: {},
    example: {},
  });
  expect(seed).toEqual(original);
  delete rendered.paths['/post'].post.requestBody.content['application/json']
    .example;
  expect(rendered).toEqual(original);
});

it('preserves authored examples, constrained schemas, responses and non-JSON bodies', () => {
  const document = {
    paths: Object.fromEntries(
      [
        { schema: {}, example: null },
        { schema: {}, examples: { custom: { value: 'hello' } } },
        { schema: { type: 'string' } },
        { schema: { $ref: '#/components/schemas/Body' } },
      ].map((media, index) => [
        `/${index}`,
        {
          post: { requestBody: { content: { 'application/json': media } } },
        },
      ]),
    ),
    components: {
      requestBodies: {
        text: { content: { 'text/plain': { schema: {} } } },
      },
      responses: {
        result: { content: { 'application/json': { schema: {} } } },
      },
    },
  };
  expect(referenceDocument(document)).toEqual(document);
});

it('handles shared request bodies and tolerates references or absent sections', () => {
  const document = {
    paths: {
      '/post': {
        post: { requestBody: { $ref: '#/components/requestBodies/Body' } },
      },
    },
    components: {
      requestBodies: {
        Body: { content: { 'application/json': { schema: {} } } },
      },
    },
  };
  expect(referenceDocument(document)).toMatchObject({
    components: {
      requestBodies: {
        Body: { content: { 'application/json': { example: {} } } },
      },
    },
  });
  expect(referenceDocument({})).toEqual({});
});
