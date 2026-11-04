// SPDX-License-Identifier: Apache-2.0
import { createClient } from '@portal/sdk';
import { cookies } from 'next/headers';
import { isDemo } from './demo';
export async function serverClient() {
  return createClient({
    baseUrl: `${process.env.SERVER_URL || 'http://localhost:4000'}/api`,
    headers: { cookie: (await cookies()).toString() },
    cache: 'no-store',
  });
}
export async function currentUser() {
  if (isDemo()) return null;
  try {
    const client = await serverClient();
    const { data } = await client.GET('/v1/me');
    return data || null;
  } catch {
    return null;
  }
}
