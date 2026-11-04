// SPDX-License-Identifier: Apache-2.0
import preset from '@portal/ui/tailwind-preset';
export default {
  presets: [preset],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};
