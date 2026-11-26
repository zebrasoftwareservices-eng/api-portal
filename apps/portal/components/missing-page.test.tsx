// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MissingPage } from './missing-page';

const state = vi.hoisted(() => ({ sessionState: 'signed-out', demo: false }));
vi.mock('next/navigation', () => ({ usePathname: () => '/pages/secret-marker' }));
vi.mock('./providers', () => ({
  usePortal: () => ({ user: null, sessionState: state.sessionState }),
}));
vi.mock('../lib/demo', () => ({ isDemo: () => state.demo }));

beforeEach(() => {
  state.sessionState = 'signed-out';
  state.demo = false;
});

it('offers Sign in to every signed-out visitor without repeating the slug', () => {
  render(<MissingPage />);
  expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  expect(screen.getByText(/signed-in developers only/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in?next=%2Fpages%2Fsecret-marker');
  expect(screen.getByRole('link', { name: 'Go to APIs' })).toHaveClass('secondary');
  expect(screen.queryByText(/secret-marker/)).not.toBeInTheDocument();
});

it('hides Sign in when the reader is signed in, the session is unknown, or this is a demo', () => {
  state.sessionState = 'signed-in';
  const { rerender } = render(<MissingPage />);
  expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Go to APIs' })).toHaveClass('default');
  state.sessionState = 'unknown';
  rerender(<MissingPage />);
  expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  state.sessionState = 'signed-out';
  state.demo = true;
  rerender(<MissingPage />);
  expect(screen.queryByText(/signed-in developers only/)).not.toBeInTheDocument();
});
