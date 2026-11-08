// SPDX-License-Identifier: Apache-2.0
export function safeNext(value: string | null | undefined) {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    [...value].some((c) => c.charCodeAt(0) <= 32)
  )
    return '/dashboard';
  try {
    const url = new URL(value, 'https://portal.invalid');
    return url.origin === 'https://portal.invalid'
      ? `${url.pathname}${url.search}${url.hash}`
      : '/dashboard';
  } catch {
    return '/dashboard';
  }
}
export function keyDestination(slug: string, signedIn: boolean) {
  const next = `/dashboard/apps/new?api=${encodeURIComponent(slug)}`;
  return signedIn ? next : `/sign-up?next=${encodeURIComponent(next)}`;
}

export function signInLink(next?: string) {
  if (!next) return '/sign-in';
  const url = new URL(safeNext(next), 'https://portal.invalid');
  const slug = url.searchParams.get('api');
  const destination =
    url.pathname === '/dashboard/apps/new' && slug
      ? `/apis/${encodeURIComponent(slug)}`
      : safeNext(next);
  return `/sign-in?next=${encodeURIComponent(destination)}`;
}
export function signUpLink(next?: string) {
  if (!next) return '/sign-up';
  const safe = safeNext(next);
  const match = /^\/apis\/([^/?#]+)$/.exec(safe);
  if (match?.[1]) {
    try {
      return keyDestination(decodeURIComponent(match[1]), false);
    } catch {
      // Keep a malformed encoded path safe without inventing an API slug.
    }
  }
  return `/sign-up?next=${encodeURIComponent(safe)}`;
}
