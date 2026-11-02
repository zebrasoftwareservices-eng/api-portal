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
