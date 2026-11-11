// SPDX-License-Identifier: Apache-2.0
'use client';
export function DateValue({ value }: { value: string }) {
  return (
    <time dateTime={value} suppressHydrationWarning>
      {new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        ...(typeof window === 'undefined' ? { timeZone: 'UTC' } : {}),
      }).format(new Date(value))}
    </time>
  );
}
