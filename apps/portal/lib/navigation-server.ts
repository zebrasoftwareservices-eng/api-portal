// SPDX-License-Identifier: Apache-2.0
import { createClient, type PublicNavigation } from '@portal/sdk';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { isDemo } from './demo';
import { DEFAULT_PUBLIC_NAVIGATION } from './portal-nav';

export { DEFAULT_PUBLIC_NAVIGATION } from './portal-nav';

export async function fetchPublicNavigation(): Promise<PublicNavigation> {
  if (isDemo()) return DEFAULT_PUBLIC_NAVIGATION;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const client = createClient({
      baseUrl: `${process.env.SERVER_URL || 'http://localhost:4000'}/api`,
      headers: { cookie: (await cookies()).toString() },
      cache: 'no-store',
    });
    const { data, response } = await client.GET('/v1/navigation', {
      signal: controller.signal,
    });
    if (!response.ok || !data) return DEFAULT_PUBLIC_NAVIGATION;
    return data;
  } catch {
    return DEFAULT_PUBLIC_NAVIGATION;
  } finally {
    clearTimeout(timer);
  }
}

export const loadPublicNavigation = cache(fetchPublicNavigation);
