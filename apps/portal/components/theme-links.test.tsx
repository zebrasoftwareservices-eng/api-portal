// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPreviewLogo, usePreviewLogo } from './theme-provider';
import { ThemeLinks } from './theme-links';
import { DEFAULT_PUBLIC_THEME, type PublicTheme } from '../lib/theme';

const nav = vi.hoisted(() => ({ path: '/', preview: '' }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.path,
  useSearchParams: () => new URLSearchParams(nav.preview),
}));

const theme: PublicTheme = {
  ...DEFAULT_PUBLIC_THEME,
  stylesheetUrl: '/v1/theme.css?v=1',
  customCssUrl: '/v1/theme/custom.css?v=1',
};

function LogoProbe() {
  const logo = usePreviewLogo();
  return <output>{logo === undefined ? 'live' : logo || 'built-in'}</output>;
}

afterEach(() => {
  cleanup();
  nav.path = '/';
  nav.preview = '';
  setPreviewLogo(undefined);
  Object.defineProperty(window, 'parent', { configurable: true, value: window });
});

describe('ThemeLinks', () => {
  it('renders nothing under /admin and plain stylesheets elsewhere', () => {
    const { container, rerender } = render(<ThemeLinks theme={theme} />);
    const links = container.querySelectorAll('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/api/v1/theme.css?v=1');
    expect(links[0]).not.toHaveAttribute('precedence');
    expect(links[1]).toHaveAttribute('href', '/api/v1/theme/custom.css?v=1');
    nav.path = '/admin/theme';
    rerender(<ThemeLinks theme={theme} />);
    expect(container.querySelector('link')).toBeNull();
    expect(container.querySelector('style')).toBeNull();
  });

  it('applies a same-origin preview message only while framed', async () => {
    Object.defineProperty(window, 'parent', { configurable: true, value: {} });
    nav.preview = 'themePreview=1';
    const { container } = render(
      <>
        <ThemeLinks theme={theme} />
        <LogoProbe />
      </>,
    );
    const style = await waitFor(() => {
      const node = container.querySelector('style[data-portal-theme-preview]');
      expect(node).not.toBeNull();
      return node as HTMLStyleElement;
    });
    expect(container.querySelector('link')).toBeNull();
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://evil.example',
        data: { type: 'portal-theme-preview', css: 'body{display:none}', mode: 'dark', logo: 'blob:no' },
      }),
    );
    expect(style.textContent).toBe('');
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: 'portal-theme-preview', css: 'body{color:red}', mode: 'dark', logo: 'blob:logo' },
      }),
    );
    expect(style.textContent).toBe('body{color:red}');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    await waitFor(() => expect(container.querySelector('output')).toHaveTextContent('blob:logo'));
  });

  it('keeps the live stylesheets when the page is not framed', () => {
    nav.preview = 'themePreview=1';
    const { container } = render(<ThemeLinks theme={theme} />);
    expect(container.querySelectorAll('link')).toHaveLength(2);
    expect(container.querySelector('style')).toBeNull();
  });
});
