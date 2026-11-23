// SPDX-License-Identifier: Apache-2.0
import { expect, it } from 'vitest';
import type { PublicPage } from './page-metadata';
import { previewMetadata, publicPageMetadata } from './page-metadata';

const page = (overrides: Partial<PublicPage> = {}): PublicPage => ({
  slug: 'getting-started',
  title: 'Getting started',
  body: 'marker-body',
  description: null,
  seoTitle: null,
  ogImageUrl: null,
  visibility: 'public',
  updatedAt: '2026-11-23T00:00:00.000Z',
  ...overrides,
});

it('uses one 404 title for a missing slug and for a page the caller cannot read', () => {
  expect(publicPageMetadata(404)).toEqual(publicPageMetadata(404, page()));
  expect(publicPageMetadata(404, page({ slug: 'other', title: 'Hidden', description: 'secret', body: 'secret-body' }))).toEqual({
    title: 'Page not found',
  });
});

it('writes the SEO fields and leaves empty description and image out', () => {
  expect(publicPageMetadata(200, page({
    seoTitle: 'Start here',
    description: 'Sign up and call the API.',
    ogImageUrl: 'https://cdn.example/og.png',
  }))).toEqual({
    title: { absolute: 'Start here' },
    description: 'Sign up and call the API.',
    openGraph: {
      title: 'Start here',
      description: 'Sign up and call the API.',
      images: ['https://cdn.example/og.png'],
      type: 'article',
    },
  });
  expect(publicPageMetadata(200, page())).toEqual({
    title: 'Getting started',
    description: null,
    openGraph: { title: 'Getting started', type: 'article' },
  });
});

it('marks a signed-in page and every preview noindex', () => {
  expect(publicPageMetadata(200, page({ visibility: 'signed-in' })).robots).toEqual({
    index: false,
    follow: false,
  });
  expect(previewMetadata(200, { title: 'Getting started' })).toEqual({
    title: 'Preview: Getting started',
    robots: { index: false, follow: false },
  });
  expect(previewMetadata(403)).toEqual({ title: 'Page not found' });
  expect(previewMetadata(404)).toEqual({ title: 'Page not found' });
});
