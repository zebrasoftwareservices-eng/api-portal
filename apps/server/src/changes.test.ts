// SPDX-License-Identifier: Apache-2.0
import { it, expect } from 'vitest';
import { summarise } from './changes.js';
import { orderVersions } from './versions.js';
const doc = (op: Record<string, unknown>, extra = {}) => ({
  openapi: '3.0.3',
  info: { version: '1.0.0' },
  paths: { '/pets/{id}': { get: op } },
  ...extra,
});
it.each([
  [
    {},
    { parameters: [{ in: 'query', name: 'q', required: true }] },
    'required-parameter-added',
    true,
  ],
  [
    { parameters: [{ in: 'query', name: 'q' }] },
    { parameters: [{ in: 'query', name: 'q', required: true }] },
    'parameter-became-required',
    true,
  ],
  [
    {},
    { requestBody: { required: true } },
    'request-body-became-required',
    true,
  ],
  [
    { responses: { '200': {} } },
    { responses: { '201': {} } },
    'success-response-removed',
    true,
  ],
  [
    { parameters: [{ in: 'query', name: 'q' }] },
    {},
    'parameter-removed',
    false,
  ],
  [
    {},
    { parameters: [{ in: 'header', name: 'X-Trace' }] },
    'optional-parameter-added',
    false,
  ],
  [{}, { security: [{ key: [] }] }, 'security-changed', true],
  [
    { security: [{ key: [] }] },
    { security: [{ other: [] }] },
    'security-changed',
    false,
  ],
  [{}, { deprecated: true }, 'deprecated', false],
] as const)('compares %j → %j as %s', (before, after, code, breaking) => {
  const result = summarise(doc(before), doc(after));
  expect(result.changed).toEqual([
    expect.objectContaining({
      method: 'GET',
      breaking,
      reasons: [expect.objectContaining({ code })],
    }),
  ]);
  expect(result.breaking).toBe(breaking);
});
it('matches path parameter renames and excludes description and schema edits', () => {
  const result = summarise(
    doc({
      description: 'old',
      parameters: [{ in: 'path', name: 'id', required: true }],
    }),
    {
      paths: {
        '/pets/{petId}': {
          get: {
            description: 'new',
            parameters: [{ in: 'path', name: 'petId', required: true }],
          },
        },
      },
    },
  );
  expect(result).toMatchObject({
    added: [],
    removed: [],
    changed: [],
    breaking: false,
  });
});
it('resolves parameter/body refs, applies operation overrides, and inherits security', () => {
  const before = doc({}, { security: [] });
  const after = {
    paths: {
      '/pets/{id}': {
        parameters: [{ in: 'query', name: 'q', required: false }],
        get: {
          parameters: [{ $ref: '#/components/parameters/Q' }],
          requestBody: { $ref: '#/components/requestBodies/Body' },
        },
      },
    },
    components: {
      parameters: { Q: { in: 'query', name: 'q', required: true } },
      requestBodies: { Body: { required: true } },
    },
    security: [{ key: [] }],
  };
  expect(
    summarise(before, after).changed[0]?.reasons.map((r) => r.code),
  ).toEqual([
    'required-parameter-added',
    'request-body-became-required',
    'security-changed',
  ]);
});
it('reports added and removed operations sorted by path and method', () => {
  const result = summarise(
    {
      info: { version: '1.0.0' },
      paths: { '/orders': { get: { summary: 'Old' } } },
    },
    { paths: { '/orders': { post: { summary: 'Create' }, put: {} } } },
  );
  expect(result.comparedTo).toBe('1.0.0');
  expect(result.added.map((o) => o.method)).toEqual(['PUT', 'POST']);
  expect(result.removed[0]).toMatchObject({
    summary: 'Old',
    breaking: true,
    reasons: [{ code: 'operation-removed', message: 'Operation removed' }],
  });
});
it('orders all-semver versions by precedence, otherwise by import time, without mutating input', () => {
  const versions = [
    { version: '1.1.0', publishedAt: new Date(3) },
    { version: '2.0.0', publishedAt: new Date(2) },
    { version: '1.0.0', publishedAt: new Date(1) },
  ];
  expect(orderVersions(versions).map((v) => v.version)).toEqual([
    '2.0.0',
    '1.1.0',
    '1.0.0',
  ]);
  expect(
    orderVersions([
      ...versions,
      { version: 'preview', publishedAt: new Date(4) },
    ]).map((v) => v.version),
  ).toEqual(['preview', '1.1.0', '2.0.0', '1.0.0']);
  expect(versions[0]?.version).toBe('1.1.0');
});
