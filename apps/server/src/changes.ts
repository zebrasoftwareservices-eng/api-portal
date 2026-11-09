// SPDX-License-Identifier: Apache-2.0
type ObjectValue = Record<string, unknown>;
const obj = (v: unknown): ObjectValue =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as ObjectValue) : {};
const methods = [
  'GET',
  'PUT',
  'POST',
  'DELETE',
  'OPTIONS',
  'HEAD',
  'PATCH',
  'TRACE',
] as const;
type Method = (typeof methods)[number];
export interface OperationChange {
  method: Method;
  path: string;
  summary: string | null;
  breaking: boolean;
  reasons: { code: string; message: string }[];
}
export interface ChangeSummary {
  [key: string]: unknown;
  comparedTo: string;
  added: OperationChange[];
  removed: OperationChange[];
  changed: OperationChange[];
  breaking: boolean;
}
function resolve(document: ObjectValue, value: unknown): ObjectValue {
  const node = obj(value);
  if (typeof node.$ref !== 'string' || !node.$ref.startsWith('#/')) return node;
  let target: unknown = document;
  for (const part of node.$ref.slice(2).split('/'))
    target = obj(target)[part.replaceAll('~1', '/').replaceAll('~0', '~')];
  // A second ref (including a cycle) is intentionally not followed.
  return obj(target);
}
function operations(document: ObjectValue) {
  const result = new Map<
    string,
    { path: string; method: Method; operation: ObjectValue; item: ObjectValue }
  >();
  for (const [path, value] of Object.entries(obj(document.paths))) {
    const item = obj(value);
    for (const method of methods)
      if (item[method.toLowerCase()])
        result.set(method + ' ' + path.replace(/\{[^}]+\}/g, '{}'), {
          path,
          method,
          operation: obj(item[method.toLowerCase()]),
          item,
        });
  }
  return result;
}
function parameters(
  document: ObjectValue,
  item: ObjectValue,
  operation: ObjectValue,
) {
  const result = new Map<string, ObjectValue>();
  for (const list of [item.parameters, operation.parameters])
    if (Array.isArray(list))
      for (const value of list) {
        const parameter = resolve(document, value);
        if (['query', 'header', 'cookie'].includes(String(parameter.in)))
          result.set(`${parameter.in}:${parameter.name}`, parameter);
      }
  return result;
}
function canonical(value: unknown): string {
  if (Array.isArray(value))
    return '[' + value.map(canonical).sort().join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'null';
}
export function summarise(
  previous: ObjectValue,
  next: ObjectValue,
): ChangeSummary {
  const before = operations(previous),
    after = operations(next);
  const result: ChangeSummary = {
    comparedTo: String(obj(previous.info).version),
    added: [],
    removed: [],
    changed: [],
    breaking: false,
  };
  for (const [key, value] of before)
    if (!after.has(key))
      result.removed.push({
        method: value.method,
        path: value.path,
        summary:
          typeof value.operation.summary === 'string'
            ? value.operation.summary
            : null,
        breaking: true,
        reasons: [{ code: 'operation-removed', message: 'Operation removed' }],
      });
  for (const [key, value] of after) {
    const { method, path, operation, item } = value;
    const change: OperationChange = {
      method,
      path,
      summary: typeof operation.summary === 'string' ? operation.summary : null,
      breaking: false,
      reasons: [],
    };
    const old = before.get(key);
    if (!old) {
      result.added.push(change);
      continue;
    }
    const reason = (code: string, message: string, breaking = false) => {
      change.reasons.push({ code, message });
      change.breaking ||= breaking;
    };
    const oldParams = parameters(previous, old.item, old.operation),
      newParams = parameters(next, item, operation);
    for (const [name, param] of newParams) {
      const label = `${param.in} parameter \`${param.name}\``;
      if (!oldParams.has(name))
        reason(
          param.required === true
            ? 'required-parameter-added'
            : 'optional-parameter-added',
          `New ${param.required === true ? 'required' : 'optional'} ${label}`,
          param.required === true,
        );
      else if (
        param.required === true &&
        oldParams.get(name)?.required !== true
      )
        reason('parameter-became-required', `${label} became required`, true);
    }
    for (const [name, param] of oldParams)
      if (!newParams.has(name))
        reason(
          'parameter-removed',
          `${param.in} parameter \`${param.name}\` removed`,
        );
    if (
      resolve(next, operation.requestBody).required === true &&
      resolve(previous, old.operation.requestBody).required !== true
    )
      reason(
        'request-body-became-required',
        'Request body became required',
        true,
      );
    for (const response of Object.keys(obj(old.operation.responses)))
      if (
        /^2(?:\d\d|XX)$/i.test(response) &&
        !(response in obj(operation.responses))
      )
        reason(
          'success-response-removed',
          `Success response ${response} removed`,
          true,
        );
    const security = operation.security ?? next.security ?? [],
      oldSecurity = old.operation.security ?? previous.security ?? [];
    const requiresAuth = (v: unknown) =>
      Array.isArray(v) &&
      v.length > 0 &&
      v.every((entry) => Object.keys(obj(entry)).length > 0);
    if (canonical(security) !== canonical(oldSecurity))
      reason(
        'security-changed',
        'Security requirements changed',
        !requiresAuth(oldSecurity) && requiresAuth(security),
      );
    if (operation.deprecated === true && old.operation.deprecated !== true)
      reason('deprecated', 'Operation deprecated');
    if (change.reasons.length) result.changed.push(change);
  }
  for (const list of [result.added, result.removed, result.changed])
    list.sort(
      (a, b) =>
        a.path.localeCompare(b.path) ||
        methods.indexOf(a.method) - methods.indexOf(b.method),
    );
  result.breaking = [...result.removed, ...result.changed].some(
    (c) => c.breaking,
  );
  return result;
}
