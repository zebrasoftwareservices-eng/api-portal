// SPDX-License-Identifier: Apache-2.0
import { apis, apiVersions, type Database } from '@portal/db';
import { and, eq, desc, sql } from 'drizzle-orm';
import { valid, rcompare } from 'semver';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { requireUser, type Auth } from './auth.js';
import { loadViewer, canSeeApi } from './access-policy.js';
import { Problem, notFound } from './problem.js';
import { importDocument, specSchema, versionName } from './import.js';
import {
  apiDetail,
  loadDocument,
  publishedApis,
  publicDocument,
} from './catalog.js';
import { summarise } from './changes.js';
import type { Linter } from './lint/index.js';
export function orderVersions<T extends { version: string; publishedAt: Date }>(
  versions: T[],
): T[] {
  const semver = versions.every((v) => valid(v.version));
  return [...versions].sort(
    (a, b) =>
      (semver ? rcompare(a.version, b.version) : 0) ||
      b.publishedAt.getTime() - a.publishedAt.getTime() ||
      a.version.localeCompare(b.version),
  );
}
export const versionDocumentUrl = (slug: string, version: string) =>
  `/api/v1/apis/${slug}/versions/${encodeURIComponent(version)}/openapi.json`;
export const changelogEntry = (v: typeof apiVersions.$inferSelect) => ({
  version: v.version,
  publishedAt: v.publishedAt.toISOString(),
  releaseNote: v.releaseNote,
  changes: v.changeSummary,
});
const duplicate = () =>
  new Problem(409, 'api-version-exists', 'This API version already exists.');
export function registerVersions(
  server: FastifyInstance,
  db: Database,
  auth: Auth,
  linter: Linter,
) {
  const find = async (slug: string) => {
    const [row] = await publishedApis(db, undefined, { slug });
    if (!row) throw notFound();
    return row;
  };
  server.get<{ Params: { slug: string } }>(
    '/api/v1/apis/:slug/changelog',
    async (req) => {
      const row = await find(req.params.slug);
      if (!(await canSeeApi(db, await loadViewer(db, auth, req), row.api.id)))
        throw notFound();
      return {
        items: (
          await db
            .select()
            .from(apiVersions)
            .where(eq(apiVersions.apiId, row.api.id))
            .orderBy(desc(apiVersions.publishedAt), desc(apiVersions.id))
        ).map(changelogEntry),
      };
    },
  );
  server.get<{ Params: { slug: string; version: string } }>(
    '/api/v1/apis/:slug/versions/:version/openapi.json',
    async (req) => {
      const row = await find(req.params.slug);
      if (!(await canSeeApi(db, await loadViewer(db, auth, req), row.api.id)))
        throw notFound();
      const [version] = await db
        .select({ id: apiVersions.id })
        .from(apiVersions)
        .where(
          and(
            eq(apiVersions.apiId, row.api.id),
            eq(apiVersions.version, req.params.version),
          ),
        );
      if (!version) throw notFound();
      return publicDocument(row, await loadDocument(db, version.id));
    },
  );
  server.put<{ Params: { slug: string } }>(
    '/api/v1/admin/apis/:slug/latest-version',
    async (req) => {
      await requireUser(auth, req, true);
      const input = z.strictObject({ version: versionName }).parse(req.body);
      const result = await db.execute(
        sql`update apis set latest_version_id = v.id, updated_at = now() from api_versions v where apis.slug = ${req.params.slug} and v.api_id = apis.id and v.version = ${input.version} returning apis.id`,
      );
      if (!result.length) throw notFound();
      return apiDetail(db, await find(req.params.slug));
    },
  );
  server.post<{ Params: { slug: string } }>(
    '/api/v1/admin/apis/:slug/versions',
    { bodyLimit: 6 * 1024 * 1024 },
    async (req, reply) => {
      const user = await requireUser(auth, req, true);
      const input = z
        .strictObject({
          spec: specSchema,
          releaseNote: z.string().max(5000).optional(),
          makeLatest: z.boolean().default(true),
        })
        .parse(req.body);
      const row = await find(req.params.slug);
      if (!(await canSeeApi(db, await loadViewer(db, auth, req), row.api.id)))
        throw notFound();
      const imported = await importDocument(
        input.spec,
        fetch,
        linter,
        async (version) => {
          const [existing] = await db
            .select({ id: apiVersions.id })
            .from(apiVersions)
            .where(
              and(
                eq(apiVersions.apiId, row.api.id),
                eq(apiVersions.version, version),
              ),
            );
          if (existing) throw duplicate();
        },
      );
      const info = imported.document.info as {
        version: string;
        title: string;
        description?: string;
      };
      const version = await db.transaction(async (tx) => {
        await tx
          .select({ id: apis.id })
          .from(apis)
          .where(eq(apis.id, row.api.id))
          .for('update');
        const existing = await tx
          .select()
          .from(apiVersions)
          .where(eq(apiVersions.apiId, row.api.id));
        if (existing.some((v) => v.version === info.version)) throw duplicate();
        const id = uuidv7(),
          publishedAt = new Date();
        const ordered = orderVersions([
          ...existing,
          { ...existing[0]!, id, version: info.version, publishedAt },
        ]);
        const baseline = ordered[ordered.findIndex((v) => v.id === id) + 1];
        const [inserted] = await tx
          .insert(apiVersions)
          .values({
            id,
            apiId: row.api.id,
            ...info,
            document: imported.document,
            sourceUrl: imported.sourceUrl,
            sourceContent: imported.sourceContent,
            sourceFormat: imported.sourceFormat,
            lintWarnings: imported.lintWarnings,
            releaseNote: input.releaseNote,
            changeSummary: baseline
              ? summarise(baseline.document, imported.document)
              : null,
            createdBy: user.id,
            publishedAt,
          })
          .onConflictDoNothing()
          .returning();
        if (!inserted) throw duplicate();
        if (input.makeLatest)
          await tx
            .update(apis)
            .set({ latestVersionId: id, updatedAt: new Date() })
            .where(eq(apis.id, row.api.id));
        return inserted;
      });
      return reply
        .code(201)
        .header('Location', versionDocumentUrl(row.api.slug, version.version))
        .send({
          api: await apiDetail(db, await find(req.params.slug)),
          version: changelogEntry(version),
          lintWarnings: imported.lintWarnings,
        });
    },
  );
}
