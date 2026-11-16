// SPDX-License-Identifier: Apache-2.0
import { createClient } from '@portal/sdk';
import { cache } from 'react';
import { isDemo } from './demo';
import { DEFAULT_PUBLIC_THEME, normalizePublicTheme, type PublicTheme } from './theme';
type ThemeGet = {
  GET: (
    path: string,
    init?: { signal?: AbortSignal },
  ) => Promise<{ data?: Partial<PublicTheme>; response: Response }>;
};
export async function fetchPublicTheme(): Promise<PublicTheme> {
  if (isDemo()) return DEFAULT_PUBLIC_THEME;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const client = createClient({
      baseUrl: `${process.env.SERVER_URL || 'http://localhost:4000'}/api`,
      cache: 'no-store',
    }) as unknown as ThemeGet;
    const { data, response } = await client.GET('/v1/theme', { signal: controller.signal });
    if (!response.ok || !data) return DEFAULT_PUBLIC_THEME;
    return normalizePublicTheme(data);
  } catch {
    return DEFAULT_PUBLIC_THEME;
  } finally {
    clearTimeout(timer);
  }
}
export const loadPublicTheme = cache(fetchPublicTheme);
