// SPDX-License-Identifier: Apache-2.0
import type { components } from '@portal/sdk';
import type { Metadata } from 'next';

export type PublicPage = components['schemas']['PublicPage'];
type PreviewTitle = { title: string };

const missing: Metadata = { title: 'Page not found' };

export function publicPageMetadata(status: number, data?: PublicPage): Metadata {
  if (status === 404 || !data) return missing;
  const title = data.seoTitle ? { absolute: data.seoTitle } : data.title;
  return {
    title,
    description: data.description || null,
    openGraph: {
      title: data.seoTitle || data.title,
      ...(data.description ? { description: data.description } : {}),
      ...(data.ogImageUrl ? { images: [data.ogImageUrl] } : {}),
      type: 'article',
    },
    ...(data.visibility === 'signed-in' ? { robots: { index: false, follow: false } } : {}),
  };
}

export function previewMetadata(status: number, data?: PreviewTitle): Metadata {
  if (status !== 200 || !data) return missing;
  return { title: `Preview: ${data.title}`, robots: { index: false, follow: false } };
}
