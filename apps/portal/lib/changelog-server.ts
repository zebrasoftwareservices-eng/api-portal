// SPDX-License-Identifier: Apache-2.0
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { apiBySlug } from './api-server';
import { serverClient } from './server';
import { isDemo } from './demo';
import { demoData } from './demo-data';

// Shared by the layout and page; the visibility decision precedes streaming.
export const changelogBySlug = cache(async (slug: string) => {
  let api;
  let entries;
  if (isDemo()) {
    if (slug !== 'sample') notFound();
    const demo = demoData();
    api = demo.api;
    entries = demo.changelog;
  } else {
    const client = await serverClient();
    const [detail, changelog] = await Promise.all([
      apiBySlug(slug),
      client.GET('/v1/apis/{slug}/changelog', { params: { path: { slug } } }),
    ]);
    if (detail.error?.status === 404 || changelog.error?.status === 404)
      notFound();
    if (!detail.data || !changelog.data)
      throw new Error("We couldn't load the changelog. Try again in a moment.");
    api = detail.data;
    entries = changelog.data.items;
  }
  return { api, entries };
});
