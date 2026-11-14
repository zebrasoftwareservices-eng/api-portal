// SPDX-License-Identifier: Apache-2.0
import { cache } from 'react';
import { serverClient } from './server';
export const productBySlug = cache(async (slug: string) =>
  (await serverClient()).GET('/v1/products/{productSlug}', {
    params: { path: { productSlug: slug } },
  }),
);
