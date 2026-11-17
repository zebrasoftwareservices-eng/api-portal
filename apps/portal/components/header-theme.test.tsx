// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from './header';
import { ThemeProvider, setPreviewLogo } from './theme-provider';
import { DEFAULT_PUBLIC_THEME } from '../lib/theme';

const state = vi.hoisted(() => ({
  pathname: '/',
  user: null as null | { email: string; role: string },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('./providers', () => ({
  usePortal: () => ({ user: state.user, sessionState: 'signed-out' }),
}));
vi.mock('../lib/demo', () => ({
  isDemo: () => false,
  QUICKSTART_URL: 'https://example.com/quickstart',
}));
vi.mock('./header-search', () => ({ HeaderSearch: () => null }));

beforeEach(() => {
  state.pathname = '/';
  state.user = null;
  setPreviewLogo(undefined);
});
afterEach(() => setPreviewLogo(undefined));

describe('header theme logo', () => {
  it('shows the public logo and the built-in name under admin', () => {
    const { rerender } = render(
      <ThemeProvider theme={{ ...DEFAULT_PUBLIC_THEME, logoUrl: '/api/v1/theme/assets/logo' }}>
        <Header />
      </ThemeProvider>,
    );
    expect(screen.getByRole('img', { name: 'Developer Portal' })).toHaveAttribute(
      'src',
      '/api/v1/theme/assets/logo',
    );
    state.pathname = '/admin/theme';
    rerender(
      <ThemeProvider theme={{ ...DEFAULT_PUBLIC_THEME, logoUrl: '/api/v1/theme/assets/logo' }}>
        <Header />
      </ThemeProvider>,
    );
    expect(screen.queryByRole('img', { name: 'Developer Portal' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Developer Portal' })).toBeInTheDocument();
  });

  it('uses a full page load for the Admin entry', () => {
    state.user = { email: 'admin@example.com', role: 'admin' };
    render(
      <ThemeProvider theme={DEFAULT_PUBLIC_THEME}>
        <Header />
      </ThemeProvider>,
    );
    expect(screen.getByRole('link', { name: 'Admin' }).tagName).toBe('A');
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin/apis');
  });
});
