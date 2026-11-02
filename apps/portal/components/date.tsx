// SPDX-License-Identifier: Apache-2.0
export function DateValue({ value }: { value: string }) {
  return (
    <time dateTime={value}>
      {new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeZone: 'UTC',
      }).format(new Date(value))}
    </time>
  );
}
