// SPDX-License-Identifier: Apache-2.0
import type { components } from '@portal/sdk';
import { cache } from 'react';
import { isDemo } from './demo';
import { previewMetadata, publicPageMetadata } from './page-metadata';
import { serverClient } from './server';

export type PublicPage = components['schemas']['PublicPage'];
export type PageDetail = components['schemas']['PageDetail'];
export { previewMetadata, publicPageMetadata };

export const pageBySlug = cache(async (slug: string) => {
  if (isDemo()) return { data: undefined, status: 404 } as const;
  const client = await serverClient();
  const { data, response } = await client.GET('/v1/pages/{slug}', {
    params: { path: { slug } },
  });
  return { data, status: response.status };
});

export const pageForPreview = cache(async (pageId: string) => {
  if (isDemo()) return { data: undefined, status: 404 } as const;
  const client = await serverClient();
  const { data, response } = await client.GET('/v1/admin/pages/{pageId}', {
    params: { path: { pageId } },
  });
  return { data, status: response.status };
});
