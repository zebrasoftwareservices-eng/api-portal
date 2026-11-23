// SPDX-License-Identifier: Apache-2.0
import type { NextConfig } from 'next';
import { demoEnabled, loadSampleDocument } from './lib/demo-build';
import { PORTAL_FRAME_HEADERS } from './lib/theme';
export default async function config(): Promise<NextConfig> {
  const demo = demoEnabled(process.env);
  return {
    output: 'standalone',
    htmlLimitedBots: /.*/,
    transpilePackages: ['@portal/sdk', '@portal/theme', '@portal/ui'],
    env: {
      PORTAL_DEMO_ACTIVE: demo ? 'true' : 'false',
      PORTAL_DEMO_SAMPLE_API: demo
        ? JSON.stringify(await loadSampleDocument())
        : '',
    },
    async headers() {
      return [
        {
          source: '/:path*',
          headers: [...PORTAL_FRAME_HEADERS],
        },
        {
          source: '/invitations/accept',
          headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
        },
      ];
    },
    async rewrites() {
      if (demo)
        return {
          beforeFiles: [
            '/setup/:path*',
            '/sign-in',
            '/sign-up',
            '/profile',
            '/forgot-password',
            '/reset-password',
            '/confirm-email',
            '/dashboard/:path*',
            '/admin/:path*',
          ].map((source) => ({ source, destination: '/quickstart-required' })),
          afterFiles: [],
          fallback: [],
        };
      // Self-hosted images proxy API traffic in ingress/proxy.ts so SERVER_URL
      // remains runtime configuration. Vercel does not run that launcher.
      return process.env.VERCEL === '1'
        ? [
            {
              source: '/api/:path((?!v1/internal(?:/|$)).*)',
              destination: `${process.env.SERVER_URL || 'http://localhost:4000'}/api/:path*`,
            },
          ]
        : [];
    },
  };
}
