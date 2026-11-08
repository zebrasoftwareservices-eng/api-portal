// SPDX-License-Identifier: Apache-2.0
import { quietApi } from './client';
import { keyDestination } from './navigation';
import type { App } from './types';

export type Access =
  | { kind: 'signed-out' }
  | { kind: 'checking' }
  | { kind: 'none' }
  | { kind: 'one'; app: { id: string; name: string } }
  | { kind: 'several' }
  | { kind: 'failed' };

export function accessFromApps(apps: App[], slug: string): Access {
  const matches = apps.filter((app) =>
    app.subscriptions.some((subscription) => subscription.slug === slug),
  );
  const first = matches[0];
  if (!first) return { kind: 'none' };
  if (matches.length > 1) return { kind: 'several' };
  return { kind: 'one', app: { id: first.id, name: first.name } };
}

export async function checkAccess(
  slug: string,
  signal: AbortSignal,
): Promise<Access> {
  try {
    const { data, response } = await quietApi.GET('/v1/apps', {
      signal,
      cache: 'no-store',
    });
    if (signal.aborted) return { kind: 'failed' };
    if (response.status === 401) return { kind: 'signed-out' };
    if (response.status !== 200 || !Array.isArray(data?.items))
      return { kind: 'failed' };
    // An unreadable success is a failed check, never evidence of no access.
    if (
      !data.items.every(
        (app) =>
          typeof app?.id === 'string' &&
          typeof app.name === 'string' &&
          Array.isArray(app.subscriptions) &&
          app.subscriptions.every((s) => typeof s?.slug === 'string'),
      )
    )
      return { kind: 'failed' };
    return accessFromApps(data.items, slug);
  } catch {
    return { kind: 'failed' };
  }
}

export function accessAction(
  access: Access,
  slug: string,
): { label: string; href: string } | null {
  switch (access.kind) {
    case 'signed-out':
      return { label: 'Get an API key', href: keyDestination(slug, false) };
    case 'none':
      return { label: 'Get an API key', href: keyDestination(slug, true) };
    case 'one':
      return {
        label: `Open in ${access.app.name}`,
        href: `/dashboard/apps/${access.app.id}`,
      };
    case 'several':
      return {
        label: 'View your apps',
        href: `/dashboard?api=${encodeURIComponent(slug)}`,
      };
    default:
      return null;
  }
}

export function recoverySentence(access: Access): string {
  switch (access.kind) {
    case 'signed-out':
    case 'none':
      return 'If you get a 403, select Get an API key to create an app that includes this API.';
    case 'one':
      return `If you get a 403, select Open in ${access.app.name} and use one of its active keys.`;
    case 'several':
      return 'If you get a 403, select View your apps and use a key from an app with access.';
    default:
      return 'If you get a 403, use a key from an app that includes this API.';
  }
}
