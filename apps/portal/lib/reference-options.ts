// SPDX-License-Identifier: Apache-2.0
import { anchorPart, operationSlug } from './operation-anchor';
export function referenceOptions(document: Record<string, unknown>) {
  const paths = (document.paths || {}) as Record<
    string,
    Record<string, unknown>
  >;
  const order = new Map<string, number>();
  for (const [path, item] of Object.entries(paths)) {
    for (const method of Object.keys(item))
      order.set(`${method.toLowerCase()} ${path}`, order.size);
  }
  const components = document.components as
    { securitySchemes?: Record<string, { type?: string }> } | undefined;
  const securitySchemes = Object.fromEntries(
    Object.entries(components?.securitySchemes || {})
      .filter(([, scheme]) => scheme.type === 'apiKey')
      .map(([name]) => [name, { value: '' }]),
  );
  return {
    slug: 'api',
    // Keep only the six clients supported by the portal's copyable examples.
    hiddenClients: {
      c: true,
      clojure: true,
      csharp: true,
      dart: true,
      fsharp: true,
      http: true,
      kotlin: true,
      objc: true,
      ocaml: true,
      php: true,
      powershell: true,
      r: true,
      ruby: true,
      rust: true,
      swift: true,
      java: ['asynchttp', 'okhttp', 'unirest'],
      js: ['axios', 'jquery', 'ofetch', 'xhr'],
      node: ['axios', 'ofetch', 'undici'],
      python: ['python3', 'httpx_sync', 'httpx_async'],
      shell: ['httpie', 'wget'],
    },
    defaultHttpClient: { targetKey: 'shell' as const, clientKey: 'curl' },
    generateTagSlug: ({ name }: { name?: string }) => anchorPart(name || ''),
    generateOperationSlug: operationSlug,
    showDeveloperTools: 'never' as const,
    operationsSorter: (
      a: { path: string; method: string },
      b: { path: string; method: string },
    ) =>
      (order.get(`${a.method.toLowerCase()} ${a.path}`) ??
        Number.MAX_SAFE_INTEGER) -
      (order.get(`${b.method.toLowerCase()} ${b.path}`) ??
        Number.MAX_SAFE_INTEGER),
    authentication: { securitySchemes },
    customCss:
      '.introduction-section h1 { display: none !important; } [id] { scroll-margin-top: calc(var(--portal-header-height) + 16px); }',
  };
}
