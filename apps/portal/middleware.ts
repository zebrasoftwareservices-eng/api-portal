// SPDX-License-Identifier: Apache-2.0
import { NextResponse, type NextRequest } from 'next/server';
import { createAuthClient } from 'better-auth/client';
import { isDemo } from './lib/demo';
export async function middleware(request: NextRequest) {
  if (isDemo()) return NextResponse.next();
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
      request.nextUrl.pathname.startsWith('/admin') &&
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
export const config = { matcher: ['/dashboard/:path*', '/admin/:path*'] };
