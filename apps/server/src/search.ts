// SPDX-License-Identifier: Apache-2.0
import rateLimit from '@fastify/rate-limit';
import type { Database } from '@portal/db';
import { searchCatalog } from '@portal/sdk';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { loadViewer, type Viewer } from './access-policy.js';
import type { Auth } from './auth.js';
import { publishedApis } from './catalog.js';
import { Problem } from './problem.js';
const querySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1, 'Enter a search term.')
    .max(100, 'Search terms can be at most 100 characters.'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export async function registerSearch(
  server: FastifyInstance,
  db: Database,
  auth: Auth,
) {
  await server.register(async (app) => {
    const viewers = new WeakMap<FastifyRequest, Viewer>();
    app.addHook('onRequest', async (request) => {
      viewers.set(request, await loadViewer(db, auth, request));
    });
    await app.register(rateLimit, {
      global: false,
      hook: 'preHandler',
      timeWindow: '1 minute',
      keyGenerator: (request) =>
        viewers.get(request)?.userId
          ? `user:${viewers.get(request)!.userId}`
          : `ip:${request.ip}`,
      errorResponseBuilder: () =>
        new Problem(
          429,
          'rate-limited',
          'Too many requests. Try again in a moment.',
        ),
    });
    app.get(
      '/api/v1/search',
      {
        config: {
          rateLimit: {
            max: (request: FastifyRequest) =>
              viewers.get(request)?.userId ? 120 : 60,
            timeWindow: '1 minute',
          },
        },
      },
      async (request) => {
        const parsed = querySchema.safeParse(request.query);
        if (!parsed.success) {
          const issue = parsed.error.issues[0]!;
          const detail =
            issue.path[0] === 'q'
              ? issue.code === 'too_big'
                ? 'Search terms can be at most 100 characters.'
                : 'Enter a search term.'
              : 'Limit must be an integer from 1 to 50.';
          throw new Problem(400, 'validation', detail);
        }
        const rows = await publishedApis(db, viewers.get(request)!);
        return searchCatalog(
          rows.map(({ api, version }) => ({
            slug: api.slug,
            title: version.title,
            version: version.version,
            description: version.description,
            document: version.document,
          })),
          parsed.data.q,
          parsed.data.limit,
        );
      },
    );
  });
}
