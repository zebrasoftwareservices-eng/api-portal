// SPDX-License-Identifier: Apache-2.0
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  CONTRAST_PAIRS,
  DEFAULT_THEME,
  type ThemeColorKey,
  type ThemeColors,
} from './index.js';
import { contrastRatio } from './contrast.js';
import { renderThemeCss } from './css.js';
import { sha256Hex, themeEtag } from './hash.js';
import { hasCssImport, parseAsset, parseThemeWrite, validateTheme } from './validate.js';

const DESIGN_DARK: ThemeColors = {
  background: '#0f172a',
  foreground: '#f1f5f9',
  muted: '#1e293b',
  mutedForeground: '#94a3b8',
  primary: '#60a5fa',
  primaryForeground: '#0f172a',
  accent: '#172554',
  accentForeground: '#bfdbfe',
  border: '#334155',
};

const CSS_TOKEN: Record<string, ThemeColorKey> = {
  '--background': 'background',
  '--foreground': 'foreground',
  '--muted': 'muted',
  '--muted-foreground': 'mutedForeground',
  '--primary': 'primary',
  '--primary-foreground': 'primaryForeground',
  '--accent': 'accent',
  '--accent-foreground': 'accentForeground',
  '--border': 'border',
};

function blockAfter(css: string, needle: string) {
  const at = css.indexOf(needle);
  if (at < 0) return null;
  const open = css.indexOf('{', at);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return null;
}

function declarations(block: string) {
  const found = new Map<string, string>();
  for (const match of block.matchAll(/(--[A-Za-z0-9-]+)\s*:\s*([^;]+);/g))
    found.set(match[1]!, match[2]!.trim());
  return found;
}

function b64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function svg(body = '') {
  return b64(
    new TextEncoder().encode(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">${body}</svg>`,
    ),
  );
}

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

describe('defaults', () => {
  it('matches the light tokens in styles.css and the designed dark palette', async () => {
    const css = (await readFile(
      new URL('../../ui/src/styles.css', import.meta.url),
      'utf8',
    )).replaceAll("'", '"');
    const rootMatch = /^:root\s*\{/m.exec(css);
    expect(rootMatch).not.toBeNull();
    const light = declarations(blockAfter(css.slice(rootMatch!.index), ':root')!);
    for (const [token, key] of Object.entries(CSS_TOKEN))
      expect(light.get(token)?.toLowerCase()).toBe(DEFAULT_THEME.colors.light[key]);
    expect(light.get('--radius')).toBe(`${DEFAULT_THEME.radius}px`);
    expect(DEFAULT_THEME.colors.dark).toEqual(DESIGN_DARK);
    expect(DEFAULT_THEME.font).toBe('system');
    expect(DEFAULT_THEME.defaultMode).toBe('system');
    expect(DEFAULT_THEME.customCss).toBe('');
    for (const selector of [
      ':root:not([data-theme=light])',
      ':root:not([data-theme="light"])',
      ':root[data-theme=dark]',
      ':root[data-theme="dark"]',
    ]) {
      const block = blockAfter(css, selector);
      if (!block) continue;
      const dark = declarations(block);
      for (const [token, key] of Object.entries(CSS_TOKEN)) {
        const value = dark.get(token);
        if (value === undefined) continue;
        expect(value.toLowerCase(), selector).toBe(DEFAULT_THEME.colors.dark[key]);
      }
      for (const key of Object.values(CSS_TOKEN))
        expect(dark.get(Object.keys(CSS_TOKEN).find((token) => CSS_TOKEN[token] === key)!), selector).toBeDefined();
    }
  });

  it('passes AA for every contrast pair in both palettes', () => {
    for (const palette of [DEFAULT_THEME.colors.light, DEFAULT_THEME.colors.dark])
      for (const [text, surface] of CONTRAST_PAIRS)
        expect(contrastRatio(palette[text], palette[surface])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(CONTRAST_PAIRS).toHaveLength(6);
  });
});

describe('renderThemeCss', () => {
  it('writes light tokens, the system dark query and the dark attribute', () => {
    const css = renderThemeCss(DEFAULT_THEME);
    expect(css).toContain(':root {');
    expect(css).toContain('--primary: #1d4ed8;');
    expect(css).toContain('--radius: 8px;');
    expect(css).toContain(`--portal-font-sans: ${DEFAULT_THEME.font === 'system' ? '' : ''}`);
    expect(css).toContain('--portal-font-sans:');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(':root:not([data-theme=light])');
    expect(css).toContain(':root[data-theme=dark]');
    expect(css).toContain('--primary: #60a5fa;');
    expect(css).not.toContain('custom-marker');
  });

  it('omits the color-scheme query unless the default mode is system', () => {
    const forced = renderThemeCss({ ...DEFAULT_THEME, defaultMode: 'light' });
    expect(forced).not.toContain('prefers-color-scheme');
    expect(forced).toContain(':root[data-theme=dark]');
    const dark = renderThemeCss({ ...DEFAULT_THEME, defaultMode: 'dark' });
    expect(dark).not.toContain('prefers-color-scheme');
    expect(dark).toContain('--primary: #1d4ed8;');
  });

  it('uses the self-hosted family and leaves custom CSS out', () => {
    const css = renderThemeCss({
      ...DEFAULT_THEME,
      font: 'inter',
      customCss: 'body{display:none} custom-marker',
    });
    expect(css).toContain("'Inter Variable'");
    expect(css).not.toContain('custom-marker');
    expect(css).not.toContain('display:none');
  });
});

describe('validateTheme', () => {
  it('accepts the default and names bad fields', () => {
    expect(validateTheme(DEFAULT_THEME)).toEqual([]);
    const bad = structuredClone(DEFAULT_THEME);
    bad.colors.dark.primary = 'blue';
    bad.font = 'comic-sans' as typeof bad.font;
    bad.radius = 25;
    bad.defaultMode = 'sepia' as typeof bad.defaultMode;
    bad.customCss = '@IMPORT url("https://evil.example/x.css");';
    const pointers = validateTheme(bad).map((error) => error.pointer);
    expect(pointers).toContain('/values/colors/dark/primary');
    expect(pointers).toContain('/values/font');
    expect(pointers).toContain('/values/radius');
    expect(pointers).toContain('/values/defaultMode');
    expect(pointers).toContain('/values/customCss');
    expect(validateTheme(bad).find((error) => error.pointer === '/values/customCss')?.message).toBe(
      "Custom CSS can't use @import",
    );
  });

  it('allows @import inside a comment and rejects it outside', () => {
    const commented = structuredClone(DEFAULT_THEME);
    commented.customCss = '/* @import "https://evil.example/x.css"; */\nbody { color: red; }';
    expect(hasCssImport(commented.customCss)).toBe(false);
    expect(validateTheme(commented)).toEqual([]);
    const imported = structuredClone(DEFAULT_THEME);
    imported.customCss = 'body { background: url(https://example.com/a.png); }\n@import "x.css";';
    expect(validateTheme(imported).map((error) => error.pointer)).toContain('/values/customCss');
  });

  it('rejects custom CSS over 64 KB', () => {
    const huge = structuredClone(DEFAULT_THEME);
    huge.customCss = 'a'.repeat(65_537);
    expect(validateTheme(huge)[0]?.pointer).toBe('/values/customCss');
  });
});

describe('themeEtag', () => {
  it('is a stable 16-character hash of the values and asset hashes', async () => {
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    const first = await themeEtag(DEFAULT_THEME, []);
    expect(first).toMatch(/^[0-9a-f]{16}$/);
    expect(await themeEtag(DEFAULT_THEME, [])).toBe(first);
    const recolored = structuredClone(DEFAULT_THEME);
    recolored.colors.light.primary = '#112233';
    expect(await themeEtag(recolored, [])).not.toBe(first);
    const withCss = structuredClone(DEFAULT_THEME);
    withCss.customCss = 'body{}';
    expect(await themeEtag(withCss, [])).not.toBe(first);
    expect(await themeEtag(DEFAULT_THEME, [{ kind: 'logo', sha256: 'abc' }])).not.toBe(first);
    expect(
      await themeEtag(DEFAULT_THEME, [
        { kind: 'favicon', sha256: 'b' },
        { kind: 'logo', sha256: 'a' },
      ]),
    ).toBe(
      await themeEtag(DEFAULT_THEME, [
        { kind: 'logo', sha256: 'a' },
        { kind: 'favicon', sha256: 'b' },
      ]),
    );
  });
});

describe('assets', () => {
  it('accepts a PNG logo, a WebP logo and an ICO favicon', async () => {
    const png = await parseAsset('logo', { contentType: 'image/png', data: b64(PNG) });
    expect(png.errors).toEqual([]);
    expect(png.asset?.byteSize).toBe(PNG.length);
    const webp = new Uint8Array(12);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect((await parseAsset('logo', { contentType: 'image/webp', data: b64(webp) })).errors).toEqual(
      [],
    );
    const ico = Uint8Array.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
    expect(
      (await parseAsset('favicon', { contentType: 'image/x-icon', data: b64(ico) })).errors,
    ).toEqual([]);
  });

  it('rejects the wrong kind, a mismatched type, a script SVG and an external href', async () => {
    expect(
      (await parseAsset('logo', { contentType: 'image/x-icon', data: b64(Uint8Array.from([0, 0, 1, 0])) }))
        .errors[0],
    ).toMatchObject({ pointer: '/logo/contentType', message: "Logos can't be ICO." });
    expect(
      (await parseAsset('favicon', { contentType: 'image/webp', data: b64(PNG) })).errors[0]?.message,
    ).toBe("Favicons can't be WebP.");
    const mismatch = await parseAsset('logo', { contentType: 'image/webp', data: b64(PNG) });
    expect(mismatch.errors[0]?.pointer).toBe('/logo/data');
    expect(mismatch.errors[0]?.message).toContain("don't match");
    for (const [body, message] of [
      ['<script>alert(1)</script>', '<script'],
      ['<foreignObject></foreignObject>', 'foreignObject'],
      ['', ''],
    ] as const) {
      if (!body) continue;
      const parsed = await parseAsset('logo', {
        contentType: 'image/svg+xml',
        data: svg(body),
      });
      expect(parsed.errors[0]?.message).toContain(message);
    }
    const onload = await parseAsset('logo', {
      contentType: 'image/svg+xml',
      data: b64(new TextEncoder().encode('<svg onload="alert(1)"></svg>')),
    });
    expect(onload.errors[0]?.message).toContain('event handler');
    const javascript = await parseAsset('logo', {
      contentType: 'image/svg+xml',
      data: svg('<a href="javascript:alert(1)">x</a>'),
    });
    expect(javascript.errors.some((error) => error.message.includes('javascript'))).toBe(true);
    const external = await parseAsset('logo', {
      contentType: 'image/svg+xml',
      data: svg('<use href="https://evil.example/a.svg#x"/>'),
    });
    expect(external.errors[0]?.message).toContain('external href');
    const internal = await parseAsset('logo', {
      contentType: 'image/svg+xml',
      data: svg('<use href="#icon"/>'),
    });
    expect(internal.errors).toEqual([]);
    const prolog = await parseAsset('logo', {
      contentType: 'image/svg+xml',
      data: b64(
        new TextEncoder().encode(
          '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg"></svg>',
        ),
      ),
    });
    expect(prolog.errors).toEqual([]);
  });

  it('reports an oversized logo before decoding and a just-over logo after', async () => {
    const huge = new Uint8Array(600 * 1024);
    huge.set(PNG.subarray(0, 8), 0);
    const early = await parseAsset('logo', { contentType: 'image/png', data: b64(huge) });
    expect(early.errors[0]).toMatchObject({
      pointer: '/logo/data',
      message: 'Logo is 600 KB; the limit is 512 KB',
    });
    const justOver = new Uint8Array(512 * 1024 + 1);
    justOver.set([0x89, 0x50, 0x4e, 0x47], 0);
    const late = await parseAsset('logo', { contentType: 'image/png', data: b64(justOver) });
    expect(late.errors[0]?.message).toBe('Logo is 513 KB; the limit is 512 KB');
  });
});

describe('parseThemeWrite', () => {
  it('keeps an omitted asset and requires both assets on import', async () => {
    const save = await parseThemeWrite({ values: DEFAULT_THEME }, 'save');
    expect(save.errors).toEqual([]);
    expect(save.theme?.logo).toBeUndefined();
    expect(save.theme?.favicon).toBeUndefined();
    const imported = await parseThemeWrite(
      { format: 'portal-theme', version: 1, values: DEFAULT_THEME, logo: null, favicon: null },
      'import',
    );
    expect(imported.errors).toEqual([]);
    expect(imported.theme?.logo).toBeNull();
    const bad = await parseThemeWrite(
      { format: 'other', version: 2, values: DEFAULT_THEME, logo: null, favicon: null },
      'import',
    );
    expect(bad.errors.map((error) => error.pointer)).toEqual(
      expect.arrayContaining(['/format', '/version']),
    );
  });
});
