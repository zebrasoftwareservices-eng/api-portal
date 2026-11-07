// SPDX-License-Identifier: Apache-2.0
'use client';
import { createClient } from '@portal/sdk';
import { createAuthClient } from 'better-auth/react';
import { toast } from 'sonner';
import type { Problem } from './types';
export const auth = createAuthClient();
const baseUrl =
  typeof window === 'undefined'
    ? 'http://localhost:3000/api'
    : `${window.location.origin}/api`;
export const api = createClient({ baseUrl });
// Only the API page's access check bypasses global redirects and toasts.
export const quietApi = createClient({ baseUrl });
api.use({
  onResponse({ response, schemaPath }) {
    if (response.status === 401 && schemaPath !== '/v1/me') {
      toast.error('Your session has ended. Sign in to continue.');
      window.location.assign(
        `/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
    }
    if (response.status === 403) window.location.assign('/not-found');
    if (response.status === 429)
      toast.error('Too many requests. Wait a moment and try again.');
    return response;
  },
  onError() {
    toast.error(
      "Can't reach the portal server. Check your connection and try again.",
    );
  },
});
export function networkProblem(): Problem {
  return {
    type: '/problems/network',
    title: "Can't reach the portal server",
    status: 0,
    detail:
      "Can't reach the portal server. Check your connection and try again.",
  };
}
export function retrySeconds(response: Response) {
  const value = response.headers.get('Retry-After');
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n)
    ? Math.max(0, n)
    : Math.max(0, Math.ceil((Date.parse(value) - Date.now()) / 1000)) || 0;
}
