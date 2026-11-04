// SPDX-License-Identifier: Apache-2.0
import type { NextConfig } from 'next';
export default {
  output: 'standalone',
  transpilePackages: ['@portal/sdk', '@portal/ui'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.SERVER_URL || 'http://localhost:4000'}/api/:path*`,
      },
    ];
  },
} satisfies NextConfig;
