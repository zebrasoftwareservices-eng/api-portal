// SPDX-License-Identifier: Apache-2.0
import type { components } from './schema.js';

export type PublicNavigation = components['schemas']['PublicNavigation'];
export type NavigationSettings = components['schemas']['NavigationSettings'];
export type SaveNavigationRequest = components['schemas']['SaveNavigationRequest'];

export const DEFAULT_NAVIGATION = {
  header: [
    { kind: 'builtin', key: 'apis', hidden: false },
    { kind: 'builtin', key: 'my-apps', hidden: false },
  ],
  footer: [],
} as const satisfies Pick<SaveNavigationRequest, 'header' | 'footer'>;
