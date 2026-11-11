// SPDX-License-Identifier: Apache-2.0
import { createClient } from '@portal/sdk';
import { cookies } from 'next/headers';
import { cache } from 'react';
import type { User } from './types';
import { isDemo } from './demo';
export async function serverClient() {
  const client = createClient({
    baseUrl: `${process.env.SERVER_URL || 'http://localhost:4000'}/api`,
    headers: { cookie: (await cookies()).toString() },
    cache: 'no-store',
  });
  client.use({
    onResponse({ response }) {
      if (response.status >= 500)
        throw Object.assign(new Error('Portal server unavailable'), {
          digest: 'PORTAL_SERVER_UNAVAILABLE',
        });
      return response;
    },
    onError() {
      throw Object.assign(new Error('Portal server unavailable'), {
        digest: 'PORTAL_SERVER_UNAVAILABLE',
      });
    },
  });
  return client;
}
export type SessionState =
  | { state: 'signed-in'; user: User }
  | { state: 'signed-out' }
  | { state: 'unknown' };
export const currentUser = cache(async (): Promise<SessionState> => {
  if (isDemo()) return { state: 'signed-out' };
  try {
    const client = await serverClient();
    const { data, response } = await client.GET('/v1/me');
    if (data) return { state: 'signed-in', user: data };
    return { state: response.status === 401 ? 'signed-out' : 'unknown' };
  } catch {
    return { state: 'unknown' };
  }
});
export async function signedInUser() {
  const session = await currentUser();
  return session.state === 'signed-in' ? session.user : null;
}
