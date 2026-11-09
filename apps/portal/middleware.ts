// SPDX-License-Identifier: Apache-2.0
import { NextResponse, type NextRequest } from 'next/server';
import { createAuthClient } from 'better-auth/client';
import { createClient } from '@portal/sdk';
import { isDemo } from './lib/demo';
let adminExists = false;
export async function middleware(request: NextRequest) {
  if (isDemo()) return NextResponse.next();
  const path = request.nextUrl.pathname;
  const protectedPage =
    path.startsWith('/dashboard') ||
    path.startsWith('/admin') ||
    path === '/setup/gateway';
  try {
    if (!adminExists) {
      const client = createClient({
        baseUrl: `${process.env.SERVER_URL || 'http://localhost:4000'}/api`,
        cache: 'no-store',
      });
      const { data, error } = await client.GET('/v1/setup');
      if (error || !data) throw new Error('Setup unavailable');
      if (data.adminRequired)
        return path === '/setup'
          ? NextResponse.next()
          : NextResponse.redirect(new URL('/setup', request.url));
      adminExists = true;
    }
    if (path === '/setup')
      return NextResponse.redirect(new URL('/', request.url));
  } catch {
    if (!protectedPage) return NextResponse.next();
    return new NextResponse(
      'The portal server is unavailable. Try again in a moment.',
      { status: 503 },
    );
  }
  if (!protectedPage) return NextResponse.next();
  const auth = createAuthClient({
    baseURL: process.env.SERVER_URL || 'http://localhost:4000',
  });
  try {
    const { data } = await auth.getSession({
      fetchOptions: {
        headers: { cookie: request.headers.get('cookie') || '' },
      },
    });
    if (!data?.user) {
      const target = new URL('/sign-in', request.url);
      target.searchParams.set(
        'next',
        request.nextUrl.pathname + request.nextUrl.search,
      );
      return NextResponse.redirect(target);
    }
    if (
      (path.startsWith('/admin') || path === '/setup/gateway') &&
      (!('role' in data.user) || data.user.role !== 'admin')
    )
      return NextResponse.rewrite(new URL('/not-found', request.url), {
        status: 404,
      });
    return NextResponse.next();
  } catch {
    return new NextResponse(
      'The portal server is unavailable. Try again in a moment.',
      { status: 503 },
    );
  }
}
export const config = { matcher: ['/((?!api(?:/|$)|_next/|.*\\.[^/]+$).*)'] };
