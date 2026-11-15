// SPDX-License-Identifier: Apache-2.0
import { createClient } from '@portal/sdk';
import { notFound } from 'next/navigation';
import { isDemo } from '../../lib/demo';

export async function GET() {
  if (isDemo()) notFound();
  try {
    const client = createClient({
      baseUrl: `${process.env.SERVER_URL || 'http://localhost:4000'}/api`,
      credentials: 'omit',
      cache: 'no-store',
    });
    const { data, error, response } = await client.GET('/v1/llms.txt', {
      parseAs: 'text',
    });
    const headers = new Headers();
    for (const name of ['content-type', 'cache-control']) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(data ?? error, { status: response.status, headers });
  } catch {
    return new Response('The portal is starting or unavailable.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}
