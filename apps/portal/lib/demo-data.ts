// SPDX-License-Identifier: Apache-2.0
import 'server-only';
import type { Api, ApiDetail } from './types';
export type SampleDocument = {
  info: { title: string; version: string; description?: string };
  servers: { url: string }[];
} & Record<string, unknown>;
export function demoData() {
  const document = JSON.parse(
    process.env.PORTAL_DEMO_SAMPLE_API || '',
  ) as SampleDocument;
  const api: Pick<
    Api,
    'slug' | 'title' | 'version' | 'description' | 'gatewayBaseUrl'
  > & {
    versions: Omit<
      ApiDetail['versions'][number],
      'markdownUrl' | 'downloadUrl'
    >[];
  } = {
    slug: 'sample',
    versions: [
      {
        version: document.info.version,
        isLatest: true,
        publishedAt: '2026-11-08T00:00:00Z',
        documentUrl: `/api/v1/apis/sample/versions/${encodeURIComponent(document.info.version)}/openapi.json`,
      },
    ],
    title: document.info.title,
    version: document.info.version,
    description: document.info.description,
    gatewayBaseUrl: document.servers[0]!.url,
  };
  return {
    document,
    api,
    changelog: [
      {
        version: api.version,
        publishedAt: api.versions[0]!.publishedAt,
        releaseNote: 'First release of the sample API.',
        changes: null,
      },
    ],
  };
}
