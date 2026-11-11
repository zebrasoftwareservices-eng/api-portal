// SPDX-License-Identifier: Apache-2.0
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
    customCss: '.scalar-reference-intro h1 { display: none !important; }',
  };
}
