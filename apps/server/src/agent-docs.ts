// SPDX-License-Identifier: Apache-2.0
import { apiVersions, type Database } from '@portal/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { anonymous, loadViewer } from './access-policy.js';
import type { Auth } from './auth.js';
import {
  baseUrl,
  publishedApis,
  publicDocument,
  type PublishedApi,
} from './catalog.js';
import { notFound } from './problem.js';

type ObjectValue = Record<string, unknown>;
type Version = typeof apiVersions.$inferSelect;
const object = (value: unknown): ObjectValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as ObjectValue)
    : {};
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const origin = (url: string) => url.replace(/\/+$/, '');
const cell = (value: unknown) =>
  text(value).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
const latestPath = (slug: string) => `/api/v1/apis/${encodeURIComponent(slug)}`;
const versionPath = (slug: string, version: string) =>
  `${latestPath(slug)}/versions/${encodeURIComponent(version)}`;

export function renderLlmsTxt(rows: PublishedApi[], publicUrl: string) {
  const lines = [
    '# Developer Portal',
    '',
    '> API documentation and OpenAPI specifications.',
    '',
    '## APIs',
    '',
  ];
  for (const row of rows) {
    const description = text(object(row.version.document.info).description)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 200);
    const url = origin(publicUrl) + latestPath(row.api.slug);
    lines.push(
      `- [${row.version.title}](${url}/reference.md): ${description ? description + ' ' : ''}OpenAPI: ${url}/spec`,
    );
  }
  if (!rows.length) lines.push('No APIs are published yet.');
  return lines.join('\n') + '\n';
}

export function renderMarkdown(
  row: PublishedApi,
  version: Version,
  document: ObjectValue,
  publicUrl: string,
) {
  // Only local references are followed; cycles and absent targets render as objects.
  const resolve = (value: unknown): ObjectValue => {
    let current = object(value);
    const seen = new Set<string>();
    while (typeof current.$ref === 'string' && current.$ref.startsWith('#/')) {
      const ref = current.$ref;
      if (seen.has(ref)) return {};
      seen.add(ref);
      let target: unknown = document;
      for (const part of ref.slice(2).split('/')) {
        const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
        target = Object.hasOwn(object(target), key)
          ? object(target)[key]
          : undefined;
      }
      current = object(target);
    }
    return current;
  };
  const schemaType = (value: unknown): string => {
    const schema = object(value);
    if (typeof schema.$ref === 'string')
      return schema.$ref.split('/').at(-1) ?? 'object';
    if (schema.type === 'array') return `array<${schemaType(schema.items)}>`;
    return text(schema.type) || 'object';
  };
  const root = origin(publicUrl);
  const path =
    version.id === row.api.latestVersionId
      ? latestPath(row.api.slug)
      : versionPath(row.api.slug, version.version);
  const reference =
    `/apis/${encodeURIComponent(row.api.slug)}` +
    (version.id === row.api.latestVersionId
      ? ''
      : `/versions/${encodeURIComponent(version.version)}`);
  const lines = [`# ${version.title} ${version.version}`, ''];
  const description = text(object(document.info).description);
  if (description) lines.push(description, '');
  lines.push(`- Base URL: ${baseUrl(row)}`);
  const schemes = object(object(document.components).securitySchemes);
  const key = Object.values(schemes)
    .map(resolve)
    .find((scheme) => scheme.type === 'apiKey');
  if (key)
    lines.push(
      `- Authentication: send your API key in the ${text(key.name)} ${text(key.in)}`,
    );
  lines.push(
    `- OpenAPI document: ${root}${path}/spec`,
    `- Reference: ${root}${reference}`,
    '',
    '## Operations',
    '',
  );
  for (const [path, rawItem] of Object.entries(object(document.paths))) {
    const item = resolve(rawItem);
    for (const [method, rawOperation] of Object.entries(item)) {
      if (
        ![
          'get',
          'put',
          'post',
          'delete',
          'options',
          'head',
          'patch',
          'trace',
        ].includes(method)
      )
        continue;
      const operation = object(rawOperation);
      lines.push(`### ${method.toUpperCase()} ${path}`, '');
      if (operation.summary) lines.push(text(operation.summary), '');
      if (operation.deprecated) lines.push('Deprecated.', '');
      const parameters = new Map<string, ObjectValue>();
      for (const source of [item.parameters, operation.parameters]) {
        if (!Array.isArray(source)) continue;
        for (const raw of source) {
          const parameter = resolve(raw);
          if (
            typeof parameter.name === 'string' &&
            typeof parameter.in === 'string'
          )
            parameters.set(`${parameter.name}\0${parameter.in}`, parameter);
        }
      }
      if (parameters.size) {
        lines.push(
          'Parameters',
          '',
          '| Name | In | Required | Type |',
          '| --- | --- | --- | --- |',
        );
        for (const parameter of parameters.values())
          lines.push(
            `| ${cell(parameter.name)} | ${cell(parameter.in)} | ${parameter.required ? 'yes' : 'no'} | ${cell(schemaType(parameter.schema))} |`,
          );
        lines.push('');
      }
      if (operation.requestBody) {
        const body = resolve(operation.requestBody);
        lines.push(
          `Request body: ${Object.keys(object(body.content)).join(', ')} (${body.required ? 'required' : 'optional'})`,
          '',
        );
      }
      lines.push(
        `Responses: ${Object.keys(object(operation.responses)).join(', ')}`,
        '',
      );
    }
  }
  return lines.join('\n');
}

export function registerAgentDocs(
  app: FastifyInstance,
  db: Database,
  auth: Auth,
  publicUrl: string,
) {
  app.get('/api/v1/llms.txt', async (_req, reply) =>
    reply
      .type('text/plain; charset=utf-8')
      .header('Cache-Control', 'public, max-age=60')
      .send(renderLlmsTxt(await publishedApis(db, anonymous), publicUrl)),
  );
  for (const format of ['reference.md', 'spec'] as const) {
    for (const versioned of [false, true]) {
      app.get<{ Params: { slug: string; version?: string } }>(
        `/api/v1/apis/:slug${versioned ? '/versions/:version' : ''}/${format}`,
        async (req, reply) => {
          const { slug, version: name } = req.params;
          const row = (
            await publishedApis(db, await loadViewer(db, auth, req))
          ).find((row) => row.api.slug === slug);
          if (!row) throw notFound(`No published API with slug '${slug}'.`);
          const version = versioned
            ? (
                await db
                  .select()
                  .from(apiVersions)
                  .where(
                    and(
                      eq(apiVersions.apiId, row.api.id),
                      eq(apiVersions.version, name!),
                    ),
                  )
              )[0]
            : row.version;
          if (!version)
            throw notFound(`API '${slug}' has no version '${name}'.`);
          reply.header('Cache-Control', 'private, no-cache');
          if (format === 'reference.md')
            return reply
              .type('text/markdown; charset=utf-8')
              .send(
                renderMarkdown(
                  row,
                  version,
                  publicDocument(row, version.document),
                  publicUrl,
                ),
              );
          const extension =
            version.sourceContent === null || version.sourceFormat === 'json'
              ? 'json'
              : 'yaml';
          const safeVersion = version.version
            .replace(/[^A-Za-z0-9._+-]/g, '_')
            .slice(0, 64);
          return reply
            .type(`application/${extension}`)
            .header(
              'Content-Disposition',
              `attachment; filename="${slug}-${safeVersion}.${extension}"`,
            )
            .send(
              version.sourceContent ??
                JSON.stringify(version.document, null, 2),
            );
        },
      );
    }
  }
}
