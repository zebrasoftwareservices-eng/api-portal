// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_NAVIGATION, type PublicNavigation } from '@portal/sdk';

export const DEFAULT_PUBLIC_NAVIGATION: PublicNavigation = {
  isDefault: true,
  header: DEFAULT_NAVIGATION.header.map((item) => ({ kind: 'builtin' as const, key: item.key })),
  footer: [],
};

export type PortalViewer = 'visitor' | 'developer' | 'admin' | 'unknown';

export function portalViewer(
  user: { role: string } | null,
  sessionState: string,
): PortalViewer {
  if (sessionState === 'unknown') return 'unknown';
  if (!user) return 'visitor';
  if (user.role === 'admin') return 'admin';
  return 'developer';
}

/** Header and footer only render addresses the server is allowed to send. */
export function safeNavigationHref(href: string) {
  return href.startsWith('/pages/') || href.startsWith('https://');
}

export function visibleHeaderItems(navigation: PublicNavigation, viewer: PortalViewer) {
  return navigation.header.filter((item) => {
    if (item.kind === 'builtin' && item.key === 'my-apps') return viewer === 'developer';
    if (item.kind !== 'builtin' && !safeNavigationHref(item.href)) return false;
    return true;
  });
}

export function visibleFooterItems(navigation: PublicNavigation, pathname: string) {
  const links: Extract<PublicNavigation['footer'][number], { kind: 'page' | 'link' }>[] = [];
  if (pathname === '/setup' || pathname === '/admin' || pathname.startsWith('/admin/')) return links;
  for (const item of navigation.footer) {
    if (item.kind !== 'builtin' && safeNavigationHref(item.href)) links.push(item);
  }
  return links;
}
