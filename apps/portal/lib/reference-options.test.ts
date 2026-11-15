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

it('limits the Scalar picker to the six supported clients and defaults to curl', () => {
  const { hiddenClients, defaultHttpClient } = referenceOptions({});
  const clients: Record<string, string[]> = {
    c: ['libcurl'],
    clojure: ['clj_http'],
    csharp: ['httpclient', 'restsharp'],
    dart: ['http'],
    fsharp: ['httpclient'],
    go: ['native'],
    http: ['http1.1'],
    java: ['asynchttp', 'nethttp', 'okhttp', 'unirest'],
    js: ['axios', 'fetch', 'jquery', 'ofetch', 'xhr'],
    kotlin: ['okhttp'],
    node: ['axios', 'fetch', 'ofetch', 'undici'],
    objc: ['nsurlsession'],
    ocaml: ['cohttp'],
    php: ['curl', 'guzzle'],
    powershell: ['restmethod', 'webrequest'],
    python: ['python3', 'requests', 'httpx_sync', 'httpx_async'],
    r: ['httr'],
    ruby: ['native'],
    rust: ['reqwest'],
    shell: ['curl', 'httpie', 'wget'],
    swift: ['nsurlsession'],
  };
  const hidden: Record<string, boolean | string[]> = hiddenClients;
  const visible = Object.entries(clients).flatMap(([target, clients]) => {
    const excluded = hidden[target];
    return clients
      .filter(
        (client) =>
          excluded !== true &&
          !(Array.isArray(excluded) && excluded.includes(client)),
      )
      .map((client) => `${target}/${client}`);
  });
  expect(visible.sort()).toEqual(
    [
      'shell/curl',
      'js/fetch',
      'node/fetch',
      'python/requests',
      'go/native',
      'java/nethttp',
    ].sort(),
  );
  expect(defaultHttpClient).toEqual({ targetKey: 'shell', clientKey: 'curl' });
});
