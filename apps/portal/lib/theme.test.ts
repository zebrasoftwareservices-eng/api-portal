// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME } from '@portal/theme';
import {
  PORTAL_FRAME_HEADERS,
  assetProblem,
  contrastWarnings,
  customCssProblem,
  fieldTarget,
  normalizeHex,
  normalizePublicTheme,
  portalAssetUrl,
  renderThemeCss,
} from './theme';

const CSS_VARS: Record<string, string> = {
  background: '--background',
  foreground: '--foreground',
  muted: '--muted',
  mutedForeground: '--muted-foreground',
  primary: '--primary',
  primaryForeground: '--primary-foreground',
  accent: '--accent',
  accentForeground: '--accent-foreground',
  border: '--border',
};

function block(css: string, start: string) {
  const at = css.indexOf(start);
  expect(at).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
}

describe('theme helpers', () => {
  it('matches the dark default tokens in styles.css, including the media query', () => {
    const css = readFileSync(join(process.cwd(), '../../packages/ui/src/styles.css'), 'utf8');
    const root = css.slice(0, css.indexOf(":root[data-theme='dark']"));
    expect(root).toContain('--card: var(--background)');
    expect(root).toContain('--ring: var(--primary)');
    for (const section of [":root[data-theme='dark']", ':root:not([data-theme=\'light\'])']) {
      const body = block(css, section);
      expect(body).not.toContain('--card:');
      for (const [key, value] of Object.entries(DEFAULT_THEME.colors.dark)) {
        expect(body).toContain(`${CSS_VARS[key]}: ${value}`);
      }
    }
  });

  it('renders light tokens on :root and dark tokens for system and data-theme', () => {
    const system = renderThemeCss(DEFAULT_THEME);
    expect(system).toContain('--background: #ffffff');
    expect(system).toContain('--background: #0f172a');
    expect(system).toContain('@media (prefers-color-scheme: dark)');
    expect(system).toContain(':root[data-theme=dark]');
    expect(system).toContain('--radius: 8px');
    const light = renderThemeCss({ ...DEFAULT_THEME, defaultMode: 'light' });
    expect(light).not.toContain('@media');
    expect(light).toContain(':root[data-theme=dark]');
  });

  it('warns below 4.5:1 and ignores @import hidden in a comment', () => {
    const warnings = contrastWarnings({ ...DEFAULT_THEME.colors.light, foreground: '#ffffff' });
    expect(warnings.some((warning) => warning.text === 'foreground' && warning.surface === 'background')).toBe(true);
    expect(contrastWarnings(DEFAULT_THEME.colors.dark)).toEqual([]);
    expect(customCssProblem('/* @import "x"; */ body { color: red; }')).toBeNull();
    expect(customCssProblem('@import "https://example.com/a.css";')).toMatch(/@import/);
    expect(customCssProblem('a'.repeat(65537))).toMatch(/65,536/);
  });

  it('normalises hex, asset urls and problem pointers', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('zz')).toBeNull();
    expect(portalAssetUrl('/v1/theme/assets/logo')).toBe('/api/v1/theme/assets/logo');
    expect(portalAssetUrl('/api/v1/theme.css')).toBe('/api/v1/theme.css');
    expect(normalizePublicTheme({ stylesheetUrl: '/v1/theme.css?v=1', font: 'inter', defaultMode: 'dark' }).stylesheetUrl).toBe(
      '/api/v1/theme.css?v=1',
    );
    expect(fieldTarget('/values/colors/dark/primary')).toEqual({
      id: 'theme-color-dark-primary',
      mode: 'dark',
    });
    expect(fieldTarget('/logo/data')?.id).toBe('theme-logo');
    expect(fieldTarget('/nope')).toBeNull();
  });

  it('rejects a logo that is too large or the wrong type', () => {
    const png = new File([new Uint8Array(8)], 'logo.png', { type: 'image/png' });
    expect(assetProblem('logo', png)).toBeNull();
    const gif = new File([new Uint8Array(8)], 'logo.gif', { type: 'image/gif' });
    expect(assetProblem('logo', gif)).toMatch(/PNG, SVG or WebP/);
    const big = new File([new Uint8Array(513 * 1024)], 'logo.png', { type: 'image/png' });
    expect(assetProblem('logo', big)).toMatch(/512 KB/);
  });

  it('allows same-origin framing only', () => {
    expect(PORTAL_FRAME_HEADERS).toEqual([
      { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    ]);
    const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8');
    expect(config).toContain('PORTAL_FRAME_HEADERS');
    const layout = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8');
    expect(layout).toContain('@fontsource-variable/inter/wght.css');
    expect(layout).toContain('@fontsource/atkinson-hyperlegible/latin-700.css');
    expect(layout).toContain('data-theme={theme.defaultMode === \'system\' ? undefined : theme.defaultMode}');
  });
});
