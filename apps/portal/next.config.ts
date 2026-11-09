// SPDX-License-Identifier: Apache-2.0
import type { NextConfig } from 'next';
import { demoEnabled, loadSampleDocument } from './lib/demo-build';
export default async function config(): Promise<NextConfig> {
  const demo = demoEnabled(process.env);
  return {
    output: 'standalone',
    transpilePackages: ['@portal/sdk', '@portal/ui'],
    env: {
      PORTAL_DEMO_ACTIVE: demo ? 'true' : 'false',
      PORTAL_DEMO_SAMPLE_API: demo
        ? JSON.stringify(await loadSampleDocument())
        : '',
    },
    async rewrites() {
      if (demo)
        return {
          beforeFiles: [
            '/setup/:path*',
            '/sign-in',
            '/sign-up',
            '/dashboard/:path*',
            '/admin/:path*',
          ].map((source) => ({ source, destination: '/quickstart-required' })),
          afterFiles: [],
          fallback: [],
        };
      return [
        {
          source: '/api/:path*',
          destination: `${process.env.SERVER_URL || 'http://localhost:4000'}/api/:path*`,
        },
      ];
    },
  };
}
