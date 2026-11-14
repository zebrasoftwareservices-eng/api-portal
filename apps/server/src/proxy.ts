// SPDX-License-Identifier: Apache-2.0
import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { AdapterFor } from './gateway-connection.js';
import type { Database } from '@portal/db';
import { publishedApis, baseUrl, type PublishedApi } from './catalog.js';
import { readLimited } from './import.js';
import type { Auth } from './auth.js';
import { loadViewer, canSeeApi } from './access-policy.js';
import { notFound, Problem } from './problem.js';
const LIMIT = 1024 * 1024;
const blocked = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'set-cookie',
  'content-encoding',
  'content-length',
]);
export function resolveTarget(target: string, rows: PublishedApi[]) {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return null;
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash
  )
    return null;
  // Reject encoded separators and dot segments rather than interpreting them differently from Kong.
  if (
    /(?:^|\/)(?:\.|%2e){1,2}(?:\/|%2f|$)|%2f|%5c|\\/i.test(
      target.split('?')[0] ?? '',
    )
  )
    return null;
  for (const row of rows) {
    const base = new URL(baseUrl(row));
    const path = base.pathname.replace(/\/$/, '');
    if (
      url.origin !== base.origin ||
      !(url.pathname === path || url.pathname.startsWith(path + '/'))
    )
      continue;
    const internal = new URL(row.gateway.proxyInternalUrl);
    internal.pathname = internal.pathname.replace(/\/$/, '') + url.pathname;
    internal.search = url.search;
    return { url: internal, row };
  }
  return null;
}
export function tryItResetToken(env: NodeJS.ProcessEnv, optionsToken?: string) {
  if (env.NODE_ENV === 'production') return undefined;
  return optionsToken || env.PORTAL_RATE_LIMIT_RESET || undefined;
}
export async function registerProxy(
  server: FastifyInstance,
  db: Database,
  adapterFor: AdapterFor,
  fetcher: typeof fetch = fetch,
  options: { resetToken?: string; auth?: Auth } = {},
) {
  // A new generation abandons the previous in-memory buckets without a restart.
  let rateGeneration = 0;
  const resetToken = tryItResetToken(process.env, options.resetToken);
  await server.register(async (app) => {
    await app.register(rateLimit, {
      max: 60,
      timeWindow: '1 minute',
      keyGenerator: (request) => `${rateGeneration}:${request.ip}`,
      errorResponseBuilder: () =>
        new Problem(
          429,
          'rate-limited',
          'Too many requests. Try again in a moment.',
        ),
    });
    // Keep all proxy payloads as bytes, including JSON, so the gateway sees the original body.
    app.removeAllContentTypeParsers();
    app.addContentTypeParser(
      '*',
      { parseAs: 'buffer', bodyLimit: LIMIT },
      (_request, body, done) => done(null, body),
    );
    app.route({
      method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      url: '/api/v1/try-it',
      bodyLimit: LIMIT,
      onSend: async (_req, reply, payload) => {
        if (reply.statusCode === 429) reply.type('application/problem+json');
        return payload;
      },
      handler: async (request, reply) => {
        const query = request.query as { scalar_url?: unknown };
        if (typeof query.scalar_url !== 'string')
          throw new Problem(
            400,
            'try-it-target-not-allowed',
            'Choose an operation from a published API.',
          );
        // Connection URLs can change without a restart. Read the joined gateway for
        // every request so a recently saved internal/public address takes effect now.
        const target = resolveTarget(query.scalar_url, await publishedApis(db));
        if (!target)
          throw new Problem(
            400,
            'try-it-target-not-allowed',
            'The target URL is not part of a published API.',
          );
        if (
          options.auth &&
          !(await canSeeApi(
            db,
            await loadViewer(db, options.auth, request),
            target.row.api.id,
          ))
        )
          throw notFound();
        const names = new Set([
          'apikey',
          'accept',
          'content-type',
          'content-length',
        ]);
        const components = target.row.version.document.components as
          | {
              securitySchemes?: Record<
                string,
                { type?: string; in?: string; name?: string }
              >;
            }
          | undefined;
        for (const scheme of Object.values(components?.securitySchemes ?? {}))
          if (scheme.type === 'apiKey' && scheme.in === 'header' && scheme.name)
            names.add(scheme.name.toLowerCase());
        const headers = new Headers();
        for (const name of names) {
          if (
            ['cookie', 'host', 'connection', 'transfer-encoding'].includes(
              name,
            ) ||
            name.startsWith('x-forwarded-')
          )
            continue;
          const value = request.headers[name];
          if (typeof value === 'string') headers.set(name, value);
        }
        const body = request.body as Buffer | undefined;
        if (body && body.length > LIMIT)
          throw new Problem(
            413,
            'payload-too-large',
            'The request body exceeds 1 MiB.',
          );
        let response: Response;
        try {
          response = await fetcher(target.url, {
            method: request.method,
            headers,
            body: ['GET', 'HEAD'].includes(request.method)
              ? undefined
              : body
                ? new Uint8Array(body)
                : undefined,
            redirect: 'manual',
            signal: AbortSignal.timeout(10000),
          });
          const data = await readLimited(response, LIMIT, 'payload-too-large');
          const connectionNames =
            response.headers
              .get('connection')
              ?.toLowerCase()
              .split(',')
              .map((v) => v.trim()) ?? [];
          for (const [name, value] of response.headers)
            if (!blocked.has(name) && !connectionNames.includes(name))
              reply.header(name, value);
          if (
            adapterFor(target.row.gateway).isAccessDenied({
              status: response.status,
              headers: response.headers,
              body: data,
            })
          )
            return reply.code(403).type('application/problem+json').send({
              type: '/problems/api-access-denied',
              title: "This key doesn't have access to this API",
              status: 403,
              detail:
                "This key's app doesn't have access to this API. Select Get an API key on this page, create an app that includes this API, and send the request with the new key. If this key's app should already have access, tell the portal admin.",
            });
          return reply.code(response.status).send(data);
        } catch (error) {
          if (error instanceof Problem) throw error;
          if (
            error instanceof Error &&
            ['TimeoutError', 'AbortError'].includes(error.name)
          )
            throw new Problem(
              504,
              'try-it-timeout',
              'The gateway did not respond within 10 seconds.',
            );
          throw new Problem(
            503,
            'gateway-unavailable',
            "The API gateway didn't respond. Try again in a moment.",
          );
        }
      },
    });
  });
  if (!resetToken) return;
  // Outside the rate-limited context so a full bucket can still be cleared.
  server.post('/api/v1/test/reset-try-it-limit', async (request, reply) => {
    if (request.headers['x-portal-rate-limit-reset'] !== resetToken)
      return reply.code(404).send();
    rateGeneration += 1;
    return reply.code(204).send();
  });
}
