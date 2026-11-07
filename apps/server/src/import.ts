// SPDX-License-Identifier: Apache-2.0
import { parse } from 'yaml';
import { bundle, validate } from '@scalar/openapi-parser';
import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import { apis, type Database } from '@portal/db';
import { eq, and, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  GatewayServiceConflictError,
  type GatewayAdapter,
} from '@portal/adapter-sdk';
import { requireUser, type Auth } from './auth.js';
import { Problem } from './problem.js';
import { apiDetail, publishedApis } from './catalog.js';
const LIMIT = 5 * 1024 * 1024;
const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const inputSchema = z.strictObject({
  spec: z.union([
    z.strictObject({ url: z.url().regex(/^https?:\/\//) }),
    z.strictObject({ content: z.string() }),
  ]),
  gatewayServiceId: z.string(),
  slug: slugSchema.optional(),
  routePath: z.string().startsWith('/').optional(),
});
function invalid(message: string, pointer = '') {
  return new Problem(
    422,
    'invalid-openapi',
    `Invalid OpenAPI document: ${message} at ${pointer || '/'}`,
    [{ message, pointer }],
  );
}
export async function readLimited(
  response: Response,
  limit: number,
  code = 'document-too-large',
) {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new Problem(413, code, 'The body exceeds the allowed size.');
  }
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit)
        throw new Problem(413, code, 'The body exceeds the allowed size.');
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export async function fetchDocument(
  input: string,
  fetcher: typeof fetch = fetch,
  host?: string,
) {
  const deadline = AbortSignal.timeout(10000);
  let url = new URL(input);
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      (host && url.host !== host)
    )
      throw new Problem(
        422,
        'spec-url-unreachable',
        'Only HTTP(S) URLs on the permitted host are allowed.',
      );
    let response: Response;
    try {
      response = await fetcher(url, { signal: deadline, redirect: 'manual' });
    } catch {
      throw new Problem(
        422,
        'spec-url-unreachable',
        'The OpenAPI URL could not be reached.',
      );
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirects === 3) break;
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      break;
    }
    try {
      return {
        content: (await readLimited(response, LIMIT)).toString('utf8'),
        url: url.href,
      };
    } catch (error) {
      if (error instanceof Problem) throw error;
      throw new Problem(
        422,
        'spec-url-unreachable',
        'The OpenAPI URL could not be read.',
      );
    }
  }
  throw new Problem(
    422,
    'spec-url-unreachable',
    'The OpenAPI URL could not be reached.',
  );
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid('Document must be an object');
  return value as Record<string, unknown>;
}
function prepareRefs(value: unknown, source?: string) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const child of value) prepareRefs(child, source);
    return;
  }
  const node = value as Record<string, unknown>;
  if (typeof node.$ref === 'string' && !node.$ref.startsWith('#')) {
    if (!source)
      throw invalid('External references require a URL import', '/$ref');
    const target = new URL(node.$ref, source);
    const base = new URL(source);
    if (
      !['http:', 'https:'].includes(target.protocol) ||
      target.host !== base.host ||
      target.username ||
      target.password
    )
      throw invalid('External references must use the same host', '/$ref');
    node.$ref = target.href;
  }
  for (const child of Object.values(node)) prepareRefs(child, source);
}
export async function importDocument(
  spec: { content: string } | { url: string },
  fetcher: typeof fetch = fetch,
) {
  let content: string, source: string | undefined;
  if ('content' in spec) content = spec.content;
  else {
    const fetched = await fetchDocument(spec.url, fetcher);
    content = fetched.content;
    source = fetched.url;
  }
  if (Buffer.byteLength(content) > LIMIT)
    throw new Problem(
      413,
      'document-too-large',
      'The OpenAPI document exceeds 5 MiB.',
    );
  let document: Record<string, unknown>;
  try {
    document = object(parse(content, { maxAliasCount: 100 }));
  } catch (error) {
    if (error instanceof Problem) throw error;
    throw invalid('Invalid YAML or JSON');
  }
  if (
    typeof document.openapi !== 'string' ||
    !/^3\.[01]\.\d+$/.test(document.openapi)
  )
    throw new Problem(
      422,
      'unsupported-openapi-version',
      'Only OpenAPI 3.0.x and 3.1.x documents are supported.',
    );
  prepareRefs(document, source);
  try {
    let refs = 0;
    document = object(
      await bundle(document, {
        treeShake: false,
        plugins: [
          {
            validate: () => true,
            exec: async (value) => {
              if (!source || ++refs > 100)
                throw invalid('External reference cannot be resolved', '/$ref');
              const target = new URL(value, source);
              if (target.host !== new URL(source).host)
                throw invalid(
                  'External references must use the same host',
                  '/$ref',
                );
              const fetched = await fetchDocument(
                target.href,
                fetcher,
                new URL(source).host,
              );
              const data = object(parse(fetched.content));
              prepareRefs(data, fetched.url);
              return { ok: true as const, data };
            },
          },
        ],
        hooks: {
          onResolveError: () => {
            throw invalid('Unresolved external reference', '/$ref');
          },
        },
      }),
    );
    const result = await validate(structuredClone(document));
    if (!result.valid) {
      const message = result.errors?.[0]?.message ?? 'Schema validation failed';
      const first = result.errors?.[0];
      const pointer =
        first && 'path' in first && typeof first.path === 'string'
          ? first.path
          : '';
      throw invalid(message, pointer);
    }
  } catch (error) {
    if (error instanceof Problem) throw error;
    throw invalid('Document references could not be resolved', '/$ref');
  }
  // Validate the schema first so missing or malformed info gets its real path.
  // Scalar may default info.version on its clone; require it in the import itself.
  const info = object(document.info);
  if (typeof info.version !== 'string' || !info.version)
    throw invalid('info.version is required', '/info/version');
  return { document, sourceUrl: source ?? null };
}
export function registerImport(
  server: FastifyInstance,
  db: Database,
  auth: Auth,
  adapter: GatewayAdapter,
  gatewayId: string,
) {
  server.get('/api/v1/admin/gateway/services', async (request) => {
    await requireUser(auth, request, true);
    const [services, linked] = await Promise.all([
      adapter.listServices(),
      db.select().from(apis),
    ]);
    return {
      items: services.map((s) => ({
        ...s,
        linkedApiSlug:
          linked.find((a) => a.gatewayServiceId === s.id)?.slug ?? null,
      })),
    };
  });
  server.post(
    '/api/v1/admin/apis',
    { bodyLimit: 6 * 1024 * 1024 },
    async (request, reply) => {
      const user = await requireUser(auth, request, true);
      const input = inputSchema.parse(request.body);
      const { document, sourceUrl } = await importDocument(input.spec);
      const service = await adapter.getService(input.gatewayServiceId);
      if (!service)
        throw new Problem(
          422,
          'gateway-service-not-found',
          'The gateway service was not found.',
        );
      const routePath = input.routePath ?? service.routes[0]?.paths[0];
      if (!routePath)
        throw new Problem(
          422,
          'gateway-service-has-no-route',
          'The gateway service has no path route. Provide a route path.',
        );
      const info = document.info as {
        title: string;
        version: string;
        description?: string;
      };
      const slug = slugSchema.parse(
        input.slug ??
          info.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 64)
            .replace(/-$/, ''),
      );
      const [existing] = await db
        .select({ id: apis.id })
        .from(apis)
        .where(eq(apis.slug, slug));
      if (existing)
        throw new Problem(
          409,
          'api-slug-taken',
          'An API with this slug is already published.',
        );
      const { inserted, protection } = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${'service:' + service.id}, 0))`,
        );
        await tx.execute(sql`select pg_advisory_xact_lock_shared(71833002)`);
        const [linked] = await tx
          .select({ slug: apis.slug })
          .from(apis)
          .where(
            and(
              eq(apis.gatewayId, gatewayId),
              eq(apis.gatewayServiceId, service.id),
            ),
          );
        if (linked)
          throw new Problem(
            422,
            'gateway-service-already-linked',
            `This Kong service already serves /apis/${linked.slug}. A Kong service can serve only one published API, because access is granted per service.`,
          );
        let protection;
        try {
          protection = await adapter.protectService({ id: service.id });
        } catch (error) {
          if (!(error instanceof GatewayServiceConflictError)) throw error;
          throw new Problem(
            422,
            'gateway-service-has-acl',
            `An ACL plugin this portal didn't create applies to the Kong service ${error.serviceName}, either on the service, on one of its routes or globally. The portal can't control access while it's there, so it hasn't changed this service's plugins.`,
          );
        }
        const inserted = await tx
          .insert(apis)
          .values({
            id: uuidv7(),
            slug,
            title: info.title,
            version: info.version,
            description: info.description,
            document,
            sourceUrl,
            gatewayId,
            gatewayServiceId: service.id,
            gatewayServiceName: service.name,
            routePath,
            createdBy: user.id,
          })
          .onConflictDoNothing()
          .returning();
        if (!inserted.length)
          throw new Problem(
            409,
            'api-slug-taken',
            'An API with this slug is already published.',
          );
        return { inserted, protection };
      });
      const row = (await publishedApis(db)).find(
        (a) => a.api.id === inserted[0]?.id,
      );
      if (!row) throw new Error('Published API missing');
      return reply
        .code(201)
        .header('Location', `/api/v1/apis/${slug}`)
        .send({
          ...apiDetail(row),
          warnings: protection.findings
            .filter((f) => ['api-public', 'partial-key-auth'].includes(f.code))
            .map(({ code, message }) => ({ code, message })),
        });
    },
  );
}
