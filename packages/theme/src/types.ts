// SPDX-License-Identifier: Apache-2.0

export const COLOR_KEYS = [
  'background',
  'foreground',
  'muted',
  'mutedForeground',
  'primary',
  'primaryForeground',
  'accent',
  'accentForeground',
  'border',
] as const;

export type ThemeColorKey = (typeof COLOR_KEYS)[number];
export type ThemeColors = Record<ThemeColorKey, string>;

export const THEME_FONTS = [
  'system',
  'inter',
  'ibm-plex-sans',
  'source-sans-3',
  'noto-sans',
  'atkinson-hyperlegible',
] as const;

export type ThemeFont = (typeof THEME_FONTS)[number];
export type ThemeMode = 'system' | 'light' | 'dark';

export interface ThemeValues {
  colors: { light: ThemeColors; dark: ThemeColors };
  font: ThemeFont;
  radius: number;
  defaultMode: ThemeMode;
  customCss: string;
}

/** Theme values stored in `theme_settings.values`. Custom CSS is its own column. */
export type StoredThemeValues = Omit<ThemeValues, 'customCss'>;

export const ASSET_KINDS = ['logo', 'favicon'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_CONTENT_TYPES = [
  'image/png',
  'image/svg+xml',
  'image/webp',
  'image/x-icon',
] as const;
export type AssetContentType = (typeof ASSET_CONTENT_TYPES)[number];

export interface FieldError {
  pointer: string;
  message: string;
}

export interface ParsedAsset {
  contentType: AssetContentType;
  data: Uint8Array;
  byteSize: number;
  sha256: string;
}

/** Omitted on save means keep the stored asset. `null` removes it. */
export type AssetUpdate = ParsedAsset | null | undefined;

export interface ParsedThemeWrite {
  values: ThemeValues;
  logo: AssetUpdate;
  favicon: AssetUpdate;
}

export const LOGO_MAX_BYTES = 512 * 1024;
export const FAVICON_MAX_BYTES = 128 * 1024;
export const ASSET_BASE64_MAX_CHARS = 700_000;
export const CUSTOM_CSS_MAX_CHARS = 65_536;

export const SYSTEM_FONT_STACK =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export const FONTS: Record<ThemeFont, string> = {
  system: SYSTEM_FONT_STACK,
  inter: `'Inter Variable', ${SYSTEM_FONT_STACK}`,
  'ibm-plex-sans': `'IBM Plex Sans Variable', ${SYSTEM_FONT_STACK}`,
  'source-sans-3': `'Source Sans 3 Variable', ${SYSTEM_FONT_STACK}`,
  'noto-sans': `'Noto Sans Variable', ${SYSTEM_FONT_STACK}`,
  'atkinson-hyperlegible': `'Atkinson Hyperlegible', ${SYSTEM_FONT_STACK}`,
};

/**
 * Text on surface, all judged at 4.5:1. Order matches the theme editor.
 * `border` is decorative and is not listed.
 */
export const CONTRAST_PAIRS = [
  ['foreground', 'background'],
  ['mutedForeground', 'background'],
  ['mutedForeground', 'muted'],
  ['primary', 'background'],
  ['primaryForeground', 'primary'],
  ['accentForeground', 'accent'],
] as const satisfies readonly (readonly [ThemeColorKey, ThemeColorKey])[];

const LIGHT: ThemeColors = {
  background: '#ffffff',
  foreground: '#0f172a',
  muted: '#f1f5f9',
  mutedForeground: '#475569',
  primary: '#1d4ed8',
  primaryForeground: '#ffffff',
  accent: '#eff6ff',
  accentForeground: '#1e3a8a',
  border: '#e2e8f0',
};

/** Dark palette from docs/design/tokens.md. It meets the contrast pairs at 4.5:1. */
const DARK: ThemeColors = {
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

export const DEFAULT_THEME: ThemeValues = {
  colors: { light: LIGHT, dark: DARK },
  font: 'system',
  radius: 8,
  defaultMode: 'system',
  customCss: '',
};

export const COLOR_CSS: readonly (readonly [ThemeColorKey, string])[] = [
  ['background', '--background'],
  ['foreground', '--foreground'],
  ['muted', '--muted'],
  ['mutedForeground', '--muted-foreground'],
  ['primary', '--primary'],
  ['primaryForeground', '--primary-foreground'],
  ['accent', '--accent'],
  ['accentForeground', '--accent-foreground'],
  ['border', '--border'],
];
