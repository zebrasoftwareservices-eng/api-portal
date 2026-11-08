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

it('returns existing developers to the API while preserving signup preselection', async () => {
  const { signInLink, signUpLink } = await import('./navigation');
  expect(signInLink('/dashboard/apps/new?api=orders')).toBe(
    '/sign-in?next=%2Fapis%2Forders',
  );
  expect(signUpLink('/apis/orders')).toBe(
    '/sign-up?next=%2Fdashboard%2Fapps%2Fnew%3Fapi%3Dorders',
  );
  expect(signInLink('/dashboard/apps/new')).toBe(
    '/sign-in?next=%2Fdashboard%2Fapps%2Fnew',
  );
  expect(signUpLink('/dashboard/apps/new?api=orders')).toBe(
    '/sign-up?next=%2Fdashboard%2Fapps%2Fnew%3Fapi%3Dorders',
  );
  expect(signInLink()).toBe('/sign-in');
  expect(signUpLink()).toBe('/sign-up');
  expect(signInLink('//evil.example')).toBe('/sign-in?next=%2Fdashboard');
  expect(signUpLink('/apis/orders?other=value')).toBe(
    '/sign-up?next=%2Fapis%2Forders%3Fother%3Dvalue',
  );
  expect(signInLink('/dashboard/apps/new?api=an%20api')).toBe(
    '/sign-in?next=%2Fapis%2Fan%2520api',
  );
  expect(signUpLink('/apis/an%20api')).toBe(
    '/sign-up?next=%2Fdashboard%2Fapps%2Fnew%3Fapi%3Dan%2520api',
  );
});
