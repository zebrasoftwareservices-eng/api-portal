// SPDX-License-Identifier: Apache-2.0
import { apis, gateways, type Database } from '@portal/db';
import { eq, desc } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { notFound } from './problem.js';
export async function publishedApis(db: Database) {
  return db
    .select({ api: apis, gateway: gateways })
    .from(apis)
    .innerJoin(gateways, eq(apis.gatewayId, gateways.id))
    .orderBy(desc(apis.publishedAt));
}
export type PublishedApi = Awaited<ReturnType<typeof publishedApis>>[number];
export const baseUrl = (row: PublishedApi) =>
  row.gateway.proxyPublicUrl.replace(/\/$/, '') + row.api.routePath;
export function apiSummary(row: PublishedApi) {
  return {
    id: row.api.id,
    slug: row.api.slug,
    title: row.api.title,
    version: row.api.version,
    description: row.api.description,
    gatewayBaseUrl: baseUrl(row),
    publishedAt: row.api.publishedAt.toISOString(),
  };
}
export function apiDetail(row: PublishedApi) {
  return {
    ...apiSummary(row),
    documentUrl: `/api/v1/apis/${row.api.slug}/openapi.json`,
    gatewayService: {
      id: row.api.gatewayServiceId,
      name: row.api.gatewayServiceName,
    },
  };
}
export function publicDocument(row: PublishedApi) {
  const document = structuredClone(row.api.document);
  document.servers = [{ url: baseUrl(row) }];
  const components = (document.components ?? {}) as Record<string, unknown>;
  const schemes = (components.securitySchemes ?? {}) as Record<
    string,
    { type?: string }
  >;
  if (!Object.values(schemes).some((s) => s.type === 'apiKey')) {
    components.securitySchemes = {
      ...schemes,
      portalApiKey: { type: 'apiKey', in: 'header', name: 'apikey' },
    };
    document.components = components;
    document.security = [{ portalApiKey: [] }];
  }
  return document;
}
export function registerCatalog(app: FastifyInstance, db: Database) {
  const find = async (slug: string) => {
    const row = (await publishedApis(db)).find((r) => r.api.slug === slug);
    if (!row) throw notFound();
    return row;
  };
  app.get('/api/v1/apis', async () => ({
    items: (await publishedApis(db)).map(apiSummary),
  }));
  app.get<{ Params: { slug: string } }>('/api/v1/apis/:slug', async (req) =>
    apiDetail(await find(req.params.slug)),
  );
  app.get<{ Params: { slug: string } }>(
    '/api/v1/apis/:slug/openapi.json',
    async (req) => publicDocument(await find(req.params.slug)),
  );
}
