// SPDX-License-Identifier: Apache-2.0
/** Supply a valid display example where an unconstrained JSON body has none.
 * Scalar otherwise generates null, which its undici formatter cannot serialize.
 * Keep the source document and authored examples (including null) unchanged.
 */
export function referenceDocument(document: Record<string, unknown>) {
  const result = structuredClone(document);
  function object(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  function body(value: unknown) {
    if (!object(value) || !object(value.content)) return;
    const json = value.content['application/json'];
    if (
      object(json) &&
      object(json.schema) &&
      Object.keys(json.schema).length === 0 &&
      !('example' in json) &&
      !('examples' in json)
    ) {
      json.example = {};
    }
  }
  if (object(result.paths)) {
    for (const path of Object.values(result.paths)) {
      if (!object(path)) continue;
      for (const operation of Object.values(path)) {
        if (object(operation)) body(operation.requestBody);
      }
    }
  }
  if (object(result.components) && object(result.components.requestBodies)) {
    for (const requestBody of Object.values(result.components.requestBodies)) {
      body(requestBody);
    }
  }
  return result;
}
