// SPDX-License-Identifier: Apache-2.0
// Portal helpers around @portal/theme. Contrast, default tokens and preview CSS
// come from that package so the editor matches the stylesheet the server serves.
import {
  CUSTOM_CSS_MAX_CHARS,
  DEFAULT_THEME,
  FAVICON_MAX_BYTES,
  FONTS,
  LOGO_MAX_BYTES,
  SYSTEM_FONT_STACK,
  THEME_FONTS,
  contrastRatio,
  hasCssImport,
  renderThemeCss,
  type ThemeColorKey,
  type ThemeColors,
  type ThemeFont,
  type ThemeMode,
  type ThemeValues,
} from '@portal/theme';

export { DEFAULT_THEME, FONTS, contrastRatio, renderThemeCss };
export type { ThemeColors, ThemeFont, ThemeMode, ThemeValues };
export type ColorKey = ThemeColorKey;
export type DefaultMode = ThemeMode;
export type PreviewMode = 'light' | 'dark';
export const SYSTEM_STACK = SYSTEM_FONT_STACK;
export const CSS_LIMIT = CUSTOM_CSS_MAX_CHARS;
export const LOGO_LIMIT = LOGO_MAX_BYTES;
export const FAVICON_LIMIT = FAVICON_MAX_BYTES;
export const IMPORT_LIMIT = 2 * 1024 * 1024;
export const FONT_IDS = THEME_FONTS;
export const FONT_LABELS: Record<ThemeFont, string> = {
  system: 'System default',
  inter: 'Inter',
  'ibm-plex-sans': 'IBM Plex Sans',
  'source-sans-3': 'Source Sans 3',
  'noto-sans': 'Noto Sans',
  'atkinson-hyperlegible': 'Atkinson Hyperlegible',
};
export type PublicTheme = {
  isDefault: boolean;
  etag: string;
  defaultMode: DefaultMode;
  font: ThemeFont;
  stylesheetUrl: string;
  customCssUrl: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
};
export type ThemeAssetInfo = {
  contentType: string;
  byteSize: number;
  url: string;
};
export type ThemeSettings = {
  isDefault: boolean;
  etag: string;
  values: ThemeValues;
  defaults: ThemeValues;
  logo: ThemeAssetInfo | null;
  favicon: ThemeAssetInfo | null;
  updatedAt: string | null;
};
export const DEFAULT_PUBLIC_THEME: PublicTheme = {
  isDefault: true,
  etag: 'default',
  defaultMode: 'system',
  font: 'system',
  stylesheetUrl: '/api/v1/theme.css?v=default',
  customCssUrl: null,
  logoUrl: null,
  faviconUrl: null,
};
export const COLOR_FIELDS: { key: ColorKey; label: string; hint: string }[] = [
  { key: 'background', label: 'Background', hint: 'Page background · --background' },
  { key: 'foreground', label: 'Text', hint: 'Body text and headings · --foreground' },
  { key: 'muted', label: 'Muted background', hint: 'Code blocks, table headers · --muted' },
  { key: 'mutedForeground', label: 'Muted text', hint: 'Hints and metadata · --muted-foreground' },
  { key: 'primary', label: 'Primary', hint: 'Buttons, links, focus ring · --primary' },
  { key: 'primaryForeground', label: 'Text on primary', hint: 'Button labels · --primary-foreground' },
  { key: 'accent', label: 'Accent', hint: 'Hover and selected rows · --accent' },
  { key: 'accentForeground', label: 'Text on accent', hint: 'Text on hover rows · --accent-foreground' },
  { key: 'border', label: 'Border', hint: 'Dividers and card edges · --border' },
];
export const CONTRAST_PAIRS: {
  text: ColorKey;
  surface: ColorKey;
  textLabel: string;
  surfaceLabel: string;
  under: ColorKey;
}[] = [
  { text: 'foreground', surface: 'background', textLabel: 'Text', surfaceLabel: 'Background', under: 'foreground' },
  { text: 'mutedForeground', surface: 'background', textLabel: 'Muted text', surfaceLabel: 'Background', under: 'mutedForeground' },
  { text: 'mutedForeground', surface: 'muted', textLabel: 'Muted text', surfaceLabel: 'Muted background', under: 'mutedForeground' },
  { text: 'primary', surface: 'background', textLabel: 'Primary', surfaceLabel: 'Background', under: 'primary' },
  { text: 'primaryForeground', surface: 'primary', textLabel: 'Text on primary', surfaceLabel: 'Primary', under: 'primaryForeground' },
  { text: 'accentForeground', surface: 'accent', textLabel: 'Text on accent', surfaceLabel: 'Accent', under: 'accentForeground' },
];
export function portalAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/api/') || url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/v1/')) return `/api${url}`;
  return url;
}
export function normalizePublicTheme(value: Partial<PublicTheme> | null | undefined): PublicTheme {
  const font = FONT_IDS.includes(value?.font as ThemeFont) ? (value?.font as ThemeFont) : 'system';
  const mode = value?.defaultMode;
  return {
    isDefault: value?.isDefault !== false,
    etag: value?.etag || 'default',
    defaultMode: mode === 'light' || mode === 'dark' || mode === 'system' ? mode : 'system',
    font,
    stylesheetUrl: portalAssetUrl(value?.stylesheetUrl) || DEFAULT_PUBLIC_THEME.stylesheetUrl,
    customCssUrl: portalAssetUrl(value?.customCssUrl),
    logoUrl: portalAssetUrl(value?.logoUrl),
    faviconUrl: portalAssetUrl(value?.faviconUrl),
  };
}
export function formatRatio(ratio: number) {
  return (Math.round(ratio * 10) / 10).toFixed(1);
}
export type ContrastWarning = (typeof CONTRAST_PAIRS)[number] & { ratio: number };
export function contrastWarnings(colors: ThemeColors): ContrastWarning[] {
  return CONTRAST_PAIRS.flatMap((pair) => {
    const ratio = contrastRatio(colors[pair.text], colors[pair.surface]);
    return ratio < 4.5 ? [{ ...pair, ratio }] : [];
  });
}
export function normalizeHex(input: string): string | null {
  const body = input.trim().toLowerCase().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/.test(body)) return `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`;
  if (/^[0-9a-f]{6}$/.test(body)) return `#${body}`;
  return null;
}
export const HEX_ERROR = 'Enter a six-digit hex colour, like #1d4ed8.';
export function customCssProblem(css: string): string | null {
  if (css.length > CSS_LIMIT) {
    return `Custom CSS is ${css.length.toLocaleString('en-US')} characters; the limit is 65,536.`;
  }
  if (hasCssImport(css)) {
    return "Custom CSS can't use @import. Use url() inside @font-face to load a font.";
  }
  return null;
}
export function themeValuesEqual(a: ThemeValues, b: ThemeValues) {
  return JSON.stringify(a) === JSON.stringify(b);
}
export function cloneTheme(values: ThemeValues): ThemeValues {
  return structuredClone(values);
}
const LOGO_TYPES: Record<string, string> = {
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};
const FAVICON_TYPES: Record<string, string> = {
  png: 'image/png',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
};
function extensionOf(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return ext === name.toLowerCase() ? '' : ext;
}
export function assetContentType(kind: 'logo' | 'favicon', file: File): string | null {
  const table = kind === 'logo' ? LOGO_TYPES : FAVICON_TYPES;
  const ext = extensionOf(file.name);
  const raw = file.type.toLowerCase();
  const mime = raw === 'image/vnd.microsoft.icon' ? 'image/x-icon' : raw;
  const fromExt = table[ext] || '';
  const fromMime = (Object.values(table) as string[]).includes(mime) ? mime : '';
  if (fromExt && fromMime && fromExt !== fromMime) return null;
  if (mime && mime !== 'application/octet-stream' && !fromMime) return null;
  if (ext && !fromExt) return null;
  return fromMime || fromExt || null;
}
export function assetProblem(kind: 'logo' | 'favicon', file: File): string | null {
  if (!assetContentType(kind, file)) {
    return kind === 'logo'
      ? 'The logo must be a PNG, SVG or WebP image.'
      : 'The favicon must be a PNG, SVG or ICO image.';
  }
  const limit = kind === 'logo' ? LOGO_LIMIT : FAVICON_LIMIT;
  if (file.size > limit) {
    const kb = Math.max(1, Math.round(file.size / 1024));
    return kind === 'logo'
      ? `The logo is ${kb.toLocaleString('en-US')} KB; the limit is 512 KB.`
      : `The favicon is ${kb.toLocaleString('en-US')} KB; the limit is 128 KB.`;
  }
  return null;
}
export function formatBytes(bytes: number) {
  const kb = Math.max(1, Math.round(bytes / 1024));
  return `${kb.toLocaleString('en-US')} KB`;
}
export function fieldTarget(pointer: string): { id: string; mode?: PreviewMode } | null {
  const color = /^\/values\/colors\/(light|dark)\/([A-Za-z]+)$/.exec(pointer);
  if (color && (COLOR_FIELDS.some((field) => field.key === color[2]))) {
    return { id: `theme-color-${color[1]}-${color[2]}`, mode: color[1] as PreviewMode };
  }
  if (pointer.startsWith('/logo')) return { id: 'theme-logo' };
  if (pointer.startsWith('/favicon')) return { id: 'theme-favicon' };
  if (pointer === '/values/customCss') return { id: 'theme-custom-css' };
  if (pointer === '/values/font') return { id: 'theme-font' };
  if (pointer === '/values/radius') return { id: 'theme-radius' };
  if (pointer === '/values/defaultMode') return { id: 'theme-default-mode' };
  return null;
}
export const PORTAL_FRAME_HEADERS = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
] as const;
