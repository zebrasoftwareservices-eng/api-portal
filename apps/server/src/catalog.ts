// SPDX-License-Identifier: Apache-2.0
import {
  apis,
  apiVersions,
  gateways,
  products,
  productApis,
  type Database,
} from '@portal/db';
import { eq, desc } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { orderVersions, versionDocumentUrl } from './versions.js';
import {
  anonymous,
  canSeeApi,
  loadViewer,
  productVisible,
  type Viewer,
} from './access-policy.js';
import type { Auth } from './auth.js';
import { notFound } from './problem.js';
export async function publishedApis(db: Database, viewer?: Viewer) {
  const rows = await db
    .select({ api: apis, version: apiVersions, gateway: gateways })
    .from(apis)
    .innerJoin(apiVersions, eq(apis.latestVersionId, apiVersions.id))
    .innerJoin(gateways, eq(apis.gatewayId, gateways.id))
    .orderBy(desc(apis.publishedAt));
  const links = await db
    .select({
      apiId: productApis.apiId,
      id: products.id,
      slug: products.slug,
      name: products.name,
    })
    .from(productApis)
    .innerJoin(products, eq(products.id, productApis.productId));
  const visibleRows = viewer
    ? (
        await Promise.all(
          rows.map(async (r) =>
            (await canSeeApi(db, viewer, r.api.id)) ? r : null,
          ),
        )
      ).filter((r) => r !== null)
    : rows;
  const visibleLinks = viewer
    ? (
        await Promise.all(
          links.map(async (l) =>
            (await productVisible(db, viewer, l.id)) ? l : null,
          ),
        )
      ).filter((l) => l !== null)
    : links;
  return visibleRows.map((row) => ({
    ...row,
    products: visibleLinks
      .filter((l) => l.apiId === row.api.id)
      .map((l) => ({ id: l.id, slug: l.slug, name: l.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}
export type PublishedApi = Awaited<ReturnType<typeof publishedApis>>[number];
export const baseUrl = (row: PublishedApi) =>
  row.gateway.proxyPublicUrl.replace(/\/$/, '') + row.api.routePath;
export function apiSummary(row: PublishedApi) {
  return {
    id: row.api.id,
    products: row.products,
    slug: row.api.slug,
    title: row.version.title,
    version: row.version.version,
    description: row.version.description,
    gatewayBaseUrl: baseUrl(row),
    publishedAt: row.api.publishedAt.toISOString(),
  };
}
export async function apiDetail(db: Database, row: PublishedApi) {
  const versions = orderVersions(
    await db
      .select()
      .from(apiVersions)
      .where(eq(apiVersions.apiId, row.api.id)),
  );
  return {
    ...apiSummary(row),
    versions: versions.map((v) => ({
      version: v.version,
      isLatest: v.id === row.api.latestVersionId,
      publishedAt: v.publishedAt.toISOString(),
      documentUrl: versionDocumentUrl(row.api.slug, v.version),
      markdownUrl: versionDocumentUrl(row.api.slug, v.version).replace(
        /openapi\.json$/,
        'reference.md',
      ),
      downloadUrl: versionDocumentUrl(row.api.slug, v.version).replace(
        /openapi\.json$/,
        'spec',
      ),
    })),
    documentUrl: `/api/v1/apis/${row.api.slug}/openapi.json`,
    markdownUrl: `/api/v1/apis/${row.api.slug}/reference.md`,
    downloadUrl: `/api/v1/apis/${row.api.slug}/spec`,
    gatewayService: {
      id: row.api.gatewayServiceId,
      name: row.api.gatewayServiceName,
    },
  };
}
export function publicDocument(
  row: PublishedApi,
  input = row.version.document,
) {
  const document = structuredClone(input);
  document.servers = [{ url: baseUrl(row) }];
  const components = (document.components ?? {}) as Record<string, unknown>;
  const schemes = (components.securitySchemes ?? {}) as Record<
    string,
    { type?: string }
  >;
  const apiKey = Object.entries(schemes).find(([, s]) => s.type === 'apiKey');
  if (!apiKey) {
    components.securitySchemes = {
      ...schemes,
      portalApiKey: { type: 'apiKey', in: 'header', name: 'apikey' },
    };
    document.components = components;
    document.security = [{ portalApiKey: [] }];
  } else if (document.security === undefined) {
    document.security = [{ [apiKey[0]]: [] }];
  }
  return document;
}
export function registerCatalog(
  app: FastifyInstance,
  db: Database,
  auth: Auth,
) {
  const find = async (slug: string, viewer: Viewer = anonymous) => {
    const row = (await publishedApis(db, viewer)).find(
      (r) => r.api.slug === slug,
    );
    if (!row) throw notFound();
    return row;
  };
  app.get('/api/v1/apis', async (req) => ({
    items: (await publishedApis(db, await loadViewer(db, auth, req))).map(
      apiSummary,
    ),
  }));
  app.get<{ Params: { slug: string } }>('/api/v1/apis/:slug', async (req) =>
    apiDetail(db, await find(req.params.slug, await loadViewer(db, auth, req))),
  );
  app.get<{ Params: { slug: string } }>(
    '/api/v1/apis/:slug/openapi.json',
    async (req) =>
      publicDocument(
        await find(req.params.slug, await loadViewer(db, auth, req)),
      ),
  );
}
