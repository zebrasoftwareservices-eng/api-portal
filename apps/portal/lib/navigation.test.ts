// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { keyDestination, safeNext } from './navigation';
describe('continuation links', () => {
  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/\nevil.example',
    'javascript:alert(1)',
    null,
  ])('rejects unsafe next %s', (value) => {
    expect(safeNext(value)).toBe('/dashboard');
  });
  it('keeps the API preselection through signup', () => {
    const href = keyDestination('sample', false);
    expect(
      new URL(href, 'https://portal.example').searchParams.get('next'),
    ).toBe('/dashboard/apps/new?api=sample');
    expect(safeNext('/dashboard/apps/new?api=sample')).toBe(
      '/dashboard/apps/new?api=sample',
    );
  });
});
