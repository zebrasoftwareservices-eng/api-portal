// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ServerUnavailable } from './server-unavailable';
import ErrorPage from '../app/error';
const { refresh, pathname } = vi.hoisted(() => ({
  refresh: vi.fn(),
  pathname: { value: '/dashboard' },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => pathname.value,
}));
it('JSO-189 retries middleware and server components, and announces a failed retry', () => {
  const reset = vi.fn();
  render(<ServerUnavailable reset={reset} />);
  expect(screen.getByRole('heading')).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(refresh).toHaveBeenCalledOnce();
  expect(reset).toHaveBeenCalledOnce();
  expect(screen.getByRole('status')).toHaveTextContent(
    "Still can't reach the portal server.",
  );
});
it('JSO-190 keeps non-outage errors distinct', () => {
  render(<ErrorPage error={new Error('Rendering failed')} reset={vi.fn()} />);
  expect(screen.getByRole('heading')).toHaveTextContent('Something went wrong');
});
it('hides the home link when already on the catalog', () => {
  pathname.value = '/';
  render(<ServerUnavailable />);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  pathname.value = '/dashboard';
});
