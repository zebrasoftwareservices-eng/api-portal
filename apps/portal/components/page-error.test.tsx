// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PageError } from './page-error';

vi.mock('next/navigation', () => ({
  usePathname: () => '/pages/guide',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

it('shows the render failure with try again, and the unavailable page when the server is down', () => {
  const reset = vi.fn();
  const { rerender } = render(<PageError error={new Error('boom')} reset={reset} />);
  expect(screen.getByRole('heading', { name: "This page couldn't be shown" })).toBeInTheDocument();
  screen.getByRole('button', { name: 'Try again' }).click();
  expect(reset).toHaveBeenCalled();
  rerender(<PageError error={Object.assign(new Error('down'), { digest: 'PORTAL_SERVER_UNAVAILABLE' })} reset={reset} />);
  expect(screen.getByRole('heading', { name: "We can't reach the portal server" })).toBeInTheDocument();
});
