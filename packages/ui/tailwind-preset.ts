// SPDX-License-Identifier: Apache-2.0
import type { Config } from 'tailwindcss';
export default {
  content: [],
  theme: {
    extend: {
      colors: Object.fromEntries(
        [
          'background',
          'foreground',
          'card',
          'popover',
          'primary',
          'secondary',
          'muted',
          'accent',
          'destructive',
          'border',
          'input',
          'ring',
        ].map((n) => [n, `var(--${n})`]),
      ),
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--portal-font-sans)'],
        mono: ['var(--portal-font-mono)'],
      },
    },
  },
} satisfies Config;
