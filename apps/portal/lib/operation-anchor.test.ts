// SPDX-License-Identifier: Apache-2.0
import { expect, it } from 'vitest';
import { operationAnchor, operationSlug } from './operation-anchor';
import { referenceOptions } from './reference-options';
it.each([undefined, ['Orders'], ['订单 / {}', 'Other']])(
  'matches Scalar document and first tag prefixes: %j',
  (tags) => {
    const operation = { method: 'GET', path: '/orders/{id}', tags };
    const options = referenceOptions({});
    const tag = tags?.[0];
    const scalarId = `${tag ? `tag/${options.generateTagSlug({ name: tag })}/` : ''}${options.generateOperationSlug(operation)}`;
    expect(operationAnchor(operation)).toBe(scalarId);
  },
);
it('normalises method case and distinguishes punctuation, Unicode and path case', () => {
  expect(operationSlug({ method: 'GET', path: '/orders' })).toBe(
    operationSlug({ method: 'get', path: '/orders' }),
  );
  const paths = [
    '/a/{id}',
    '/a/id',
    '/a/_7b',
    '/a/%7b',
    '/A/id',
    '/a/订单',
    '/a/😀',
  ];
  const anchors = paths.map((path) => operationAnchor({ method: 'get', path }));
  expect(new Set(anchors).size).toBe(paths.length);
  for (const anchor of anchors) expect(anchor).toMatch(/^[a-z0-9/-]+$/);
});

// Contract test against the installed Scalar navigator and single-document URL router.
it('opens the actual Scalar operation ID from the public fragment', async () => {
  const { createRequire } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  const require = createRequire(import.meta.url);
  const reactRequire = createRequire(
    require.resolve('@scalar/api-reference-react'),
  );
  const entry = reactRequire.resolve('@scalar/api-reference');
  const scalarRequire = createRequire(entry);
  const navigationPath = scalarRequire.resolve(
    '@scalar/workspace-store/navigation',
  );
  const routingPath = new URL('./helpers/id-routing.js', pathToFileURL(entry))
    .href;
  const { createNavigation } = await import(/* @vite-ignore */ navigationPath);
  const { getIdFromUrl } = await import(/* @vite-ignore */ routingPath);
  for (const tags of [undefined, ['Orders'], ['订单 / {}', 'Second']]) {
    const operation = { method: 'GET', path: '/orders/{id}', tags };
    const document = {
      openapi: '3.0.3',
      info: { title: 'Orders', version: '1' },
      paths: { [operation.path]: { get: { tags, responses: {} } } },
    };
    const options = referenceOptions(document);
    const navigation = createNavigation(options.slug, document, options);
    const id = getIdFromUrl(
      new URL(`http://localhost/apis/orders#${operationAnchor(operation)}`),
      undefined,
      options.slug,
    );
    expect(JSON.stringify(navigation)).toContain(`"id":"${id}"`);
  }
});
