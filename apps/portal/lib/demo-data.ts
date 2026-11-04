// SPDX-License-Identifier: Apache-2.0
import 'server-only';
import type { Api } from './types';
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
  > = {
    slug: 'sample',
    title: document.info.title,
    version: document.info.version,
    description: document.info.description,
    gatewayBaseUrl: document.servers[0]!.url,
  };
  return { document, api };
}
