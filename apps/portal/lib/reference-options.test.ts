// SPDX-License-Identifier: Apache-2.0
import { expect, it } from 'vitest';
import { referenceOptions } from './reference-options';
it('JSO-172/174/225 hides tools, keeps auth empty and preserves path and method order', () => {
  const options = referenceOptions({
    paths: { '/z': { post: {}, get: {} }, '/a': { get: {} } },
    components: {
      securitySchemes: {
        key: { type: 'apiKey', example: 'secret' },
        bearer: { type: 'http' },
      },
    },
  });
  expect(options.showDeveloperTools).toBe('never');
  expect(options.authentication.securitySchemes).toEqual({
    key: { value: '' },
  });
  const operations = [
    { path: '/a', method: 'get' },
    { path: '/z', method: 'get' },
    { path: '/z', method: 'post' },
  ];
  expect(operations.sort(options.operationsSorter)).toEqual([
    { path: '/z', method: 'post' },
    { path: '/z', method: 'get' },
    { path: '/a', method: 'get' },
  ]);
});
