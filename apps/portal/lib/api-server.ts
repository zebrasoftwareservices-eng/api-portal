// SPDX-License-Identifier: Apache-2.0
import { cache } from 'react';
import { serverClient } from './server';

// One read for the slug layout, the page and generateMetadata. The layout
// calls notFound() from this result before any loading boundary can flush.
export const apiBySlug = cache(async (slug: string) =>
  (await serverClient()).GET('/v1/apis/{slug}', {
    params: { path: { slug } },
  }),
);
