// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAbsolute, extname } from 'node:path';
import spectralCore, { type Ruleset } from '@stoplight/spectral-core';
import spectralParsers from '@stoplight/spectral-parsers';
import rulesetLoader from '@stoplight/spectral-ruleset-bundler/with-loader';
import refResolver from '@stoplight/json-ref-resolver';
import { Problem } from '../problem.js';
// These packages use CommonJS re-exports that Node 22 cannot expose as named ESM exports.
const { Spectral, Document } = spectralCore;
const { Yaml } = spectralParsers;
const { bundleAndLoadRuleset } = rulesetLoader;
const { Resolver } = refResolver;
export interface LintFinding {
  [key: string]: unknown;
  rule: string;
  severity: 'error' | 'warning';
  message: string;
  pointer: string;
  line: number;
  column: number;
  source: string | null;
}
export interface Linter {
  health: {
    ruleset: 'default' | 'custom';
    path?: string;
    status: 'ok' | 'error';
    error?: string;
  };
  ruleset?: Ruleset;
}
export const defaultRuleset = fileURLToPath(
  new URL('../../rulesets/portal.spectral.yaml', import.meta.url),
);
export async function loadLinter(path?: string): Promise<Linter> {
  const custom = path !== undefined;
  const health: Linter['health'] = {
    ruleset: custom ? 'custom' : 'default',
    ...(custom ? { path } : {}),
    status: 'ok',
  };
  try {
    if (custom && !isAbsolute(path))
      throw new Error('Ruleset path must be absolute');
    if (custom && !['.yaml', '.yml', '.json'].includes(extname(path)))
      throw new Error('Ruleset must be a YAML or JSON file');
    const ruleset = await bundleAndLoadRuleset(path ?? defaultRuleset, {
      fs,
      fetch: async () => {
        throw new Error('Network ruleset imports are disabled');
      },
    });
    return { health, ruleset };
  } catch (error) {
    return {
      health: {
        ...health,
        status: 'error',
        error: `${path ?? defaultRuleset}: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}
let defaultLinter: Promise<Linter> | undefined;
export function getDefaultLinter() {
  return (defaultLinter ??= loadLinter());
}
export function requireLinter(linter: Linter) {
  if (!linter.ruleset)
    throw new Problem(
      503,
      'lint-ruleset-unavailable',
      linter.health.error ?? 'The lint ruleset is unavailable.',
    );
  return linter.ruleset;
}
export async function lintDocument(
  linter: Linter,
  content: string,
  source?: string,
  files = new Map<string, string>(),
) {
  const resolve = async (uri: { toString(): string }) => {
    const url = uri.toString().split('#')[0]!;
    const text = files.get(url);
    if (text === undefined)
      throw new Error(`Reference was not fetched: ${url}`);
    return text;
  };
  // A new resolver per import prevents cache reuse between unrelated documents.
  const resolver = new Resolver({
    resolvers: {
      http: { resolve },
      https: { resolve },
      file: {
        resolve: async () => {
          throw new Error('File references are disabled');
        },
      },
    },
  });
  const spectral = new Spectral({ resolver });
  spectral.setRuleset(requireLinter(linter));
  const results = await spectral.run(new Document(content, Yaml, source));
  const findings: LintFinding[] = results.map((r) => ({
    rule: String(r.code),
    severity: r.severity === 0 ? 'error' : 'warning',
    message: r.message,
    pointer: r.path.length
      ? '/' +
        r.path
          .map((p) => String(p).replaceAll('~', '~0').replaceAll('/', '~1'))
          .join('/')
      : '',
    line: r.range.start.line + 1,
    column: r.range.start.character + 1,
    source: r.source && r.source !== source ? r.source : null,
  }));
  findings.sort(
    (a, b) =>
      (a.source ?? '').localeCompare(b.source ?? '') ||
      a.line - b.line ||
      a.column - b.column,
  );
  const errors = findings.filter((f) => f.severity === 'error');
  if (errors.length)
    throw new Problem(
      422,
      'openapi-lint-failed',
      'The OpenAPI document has lint errors.',
      errors.slice(0, 100),
      undefined,
      errors.length,
    );
  return findings.slice(0, 200);
}
