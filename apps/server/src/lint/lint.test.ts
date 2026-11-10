// SPDX-License-Identifier: Apache-2.0
import { it, expect, beforeAll } from 'vitest';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLinter, lintDocument, type Linter } from './index.js';
let linter: Linter;
beforeAll(async () => {
  linter = await loadLinter();
});
it('loads the shipped ruleset and pins exactly the designed error rules (invalid-ref is a core diagnostic)', () => {
  expect(linter.health).toMatchObject({ status: 'ok' });
  expect(
    Object.values(linter.ruleset!.rules)
      .filter((r) => r.severity === 0)
      .map((r) => r.name)
      .sort(),
  ).toEqual(
    [
      'oas3-schema',
      'operation-operationId-unique',
      'path-params',
      'path-declarations-must-exist',
      'path-not-include-query',
      'operation-parameters',
      'oas3-operation-security-defined',
    ].sort(),
  );
});
it('lints the packaged quickstart seed without errors', async () => {
  await expect(
    lintDocument(
      linter,
      await readFile(
        new URL('../../seed/sample-api.openapi.yaml', import.meta.url),
        'utf8',
      ),
    ),
  ).resolves.toBeInstanceOf(Array);
});
it('reports missing, malformed and network rulesets with their path and never falls back', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'portal-lint-'));
  try {
    for (const [name, text] of [
      ['missing.yaml', null],
      ['invalid.yaml', 'rules: ['],
      ['remote.yaml', 'extends: https://example.test/rules.yaml'],
    ]) {
      const path = join(dir, name!);
      if (text) await writeFile(path, text);
      const result = await loadLinter(path);
      expect(result.ruleset).toBeUndefined();
      expect(result.health).toMatchObject({
        status: 'error',
        path,
        error: expect.stringContaining(path),
      });
    }
  } finally {
    await rm(dir, { recursive: true });
  }
});
it('custom rules replace the default, with 1-based coordinates and escaped pointers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'portal-lint-'));
  try {
    const path = join(dir, 'custom.yaml');
    await writeFile(
      path,
      'extends: []\nrules:\n  operation-description:\n    given: $.paths[*].get\n    severity: error\n    then:\n      field: description\n      function: truthy\n',
    );
    const custom = await loadLinter(path);
    expect(custom.health.status).toBe('ok');
    await expect(
      lintDocument(
        custom,
        'openapi: 3.0.3\ninfo: {title: Test, version: 1.0.0}\npaths:\n  /pets:\n    get:\n      responses: {}',
      ),
    ).rejects.toMatchObject({
      code: 'openapi-lint-failed',
      errorCount: 1,
      errors: [
        expect.objectContaining({
          rule: 'operation-description',
          pointer: '/paths/~1pets/get',
          line: 5,
          source: null,
        }),
      ],
    });
    await expect(
      lintDocument(
        custom,
        'openapi: 3.0.3\ninfo: {title: Test, version: 1.0.0}\npaths: {}',
      ),
    ).resolves.toEqual([]);
  } finally {
    await rm(dir, { recursive: true });
  }
});
it('serves external refs only from the fetched map and preserves external source coordinates', async () => {
  const content =
    'openapi: 3.0.3\ninfo: {title: Test, version: 1.0.0}\npaths: {}\ncomponents:\n  schemas:\n    Pet:\n      $ref: https://example.test/pet.yaml';
  await expect(
    lintDocument(linter, content, 'https://example.test/api.yaml'),
  ).rejects.toMatchObject({
    errors: expect.arrayContaining([
      expect.objectContaining({ rule: 'invalid-ref' }),
    ]),
  });
  const parameterDoc =
    'openapi: 3.0.3\ninfo: {title: Test, version: 1.0.0}\npaths:\n  /pets:\n    get:\n      parameters:\n        - $ref: https://example.test/parameter.yaml\n      responses: {"200": {description: OK}}';
  const warnings = await lintDocument(
    linter,
    parameterDoc,
    'https://example.test/api.yaml',
    new Map([
      [
        'https://example.test/parameter.yaml',
        'in: query\nname: q\nschema: {type: string}',
      ],
    ]),
  );
  expect(warnings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source: 'https://example.test/parameter.yaml',
        line: 1,
        rule: 'oas3-parameter-description',
      }),
    ]),
  );
});
it('caps refusals at 100 findings while keeping the full count, and warnings at 200', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'portal-lint-'));
  try {
    const path = join(dir, 'cap.yaml');
    const content = JSON.stringify({
      things: Array.from({ length: 250 }, () => ({})),
    });
    for (const severity of ['error', 'warn']) {
      await writeFile(
        path,
        `rules:\n  required-label:\n    given: $.things[*]\n    severity: ${severity}\n    then:\n      field: label\n      function: truthy\n`,
      );
      const custom = await loadLinter(path);
      if (severity === 'error') {
        await expect(lintDocument(custom, content)).rejects.toMatchObject({
          errorCount: 250,
          errors: expect.toSatisfy(
            (errors: unknown[]) => errors.length === 100,
          ),
        });
      } else expect(await lintDocument(custom, content)).toHaveLength(200);
    }
  } finally {
    await rm(dir, { recursive: true });
  }
});
it('preserves external source locations for blocking rules as well as warnings', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'portal-lint-'));
  try {
    const path = join(dir, 'external.yaml');
    await writeFile(
      path,
      'extends: []\nrules:\n  parameter-description:\n    given: $.paths[*].get.parameters[*]\n    severity: error\n    then:\n      field: description\n      function: truthy\n',
    );
    const custom = await loadLinter(path);
    const content =
      'openapi: 3.0.3\ninfo: {title: Test, version: 1.0.0}\npaths:\n  /pets:\n    get:\n      parameters:\n        - $ref: https://example.test/parameter.yaml\n      responses: {"200": {description: OK}}';
    await expect(
      lintDocument(
        custom,
        content,
        'https://example.test/api.yaml',
        new Map([
          [
            'https://example.test/parameter.yaml',
            'in: query\nname: q\nschema: {type: string}',
          ],
        ]),
      ),
    ).rejects.toMatchObject({
      code: 'openapi-lint-failed',
      errors: [
        expect.objectContaining({
          rule: 'parameter-description',
          source: 'https://example.test/parameter.yaml',
          line: 1,
          column: 1,
          pointer: '',
        }),
      ],
    });
  } finally {
    await rm(dir, { recursive: true });
  }
});
