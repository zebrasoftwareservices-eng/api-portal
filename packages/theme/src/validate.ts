// SPDX-License-Identifier: Apache-2.0
import { sha256Hex } from './hash.js';
import {
  ASSET_CONTENT_TYPES,
  ASSET_KINDS,
  COLOR_KEYS,
  CUSTOM_CSS_MAX_CHARS,
  FAVICON_MAX_BYTES,
  LOGO_MAX_BYTES,
  THEME_FONTS,
  type AssetContentType,
  type AssetKind,
  type FieldError,
  type ParsedAsset,
  type ParsedThemeWrite,
  type ThemeColors,
  type ThemeFont,
  type ThemeMode,
  type ThemeValues,
  ASSET_BASE64_MAX_CHARS,
} from './types.js';

const HEX = /^#[0-9a-fA-F]{6}$/;
const MODES = ['system', 'light', 'dark'] as const;
const LIMITS: Record<AssetKind, number> = {
  logo: LOGO_MAX_BYTES,
  favicon: FAVICON_MAX_BYTES,
};
const ALLOWED: Record<AssetKind, readonly AssetContentType[]> = {
  logo: ['image/png', 'image/svg+xml', 'image/webp'],
  favicon: ['image/png', 'image/svg+xml', 'image/x-icon'],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** CSS with comments removed. An unclosed comment hides the rest of the sheet. */
export function cssWithoutComments(css: string) {
  let out = '';
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 1;
      out += ' ';
      continue;
    }
    out += css[i];
  }
  return out;
}

export function hasCssImport(css: string) {
  return /@import/i.test(cssWithoutComments(css));
}

function colorErrors(palette: unknown, pointer: string) {
  const errors: FieldError[] = [];
  if (!isRecord(palette)) {
    errors.push({ pointer, message: 'Choose a colour for each token.' });
    return errors;
  }
  for (const key of COLOR_KEYS) {
    const value = palette[key];
    if (typeof value !== 'string' || !HEX.test(value))
      errors.push({
        pointer: `${pointer}/${key}`,
        message: 'Enter a six-digit hex colour, like #1d4ed8.',
      });
  }
  for (const key of Object.keys(palette)) {
    if (!COLOR_KEYS.includes(key as (typeof COLOR_KEYS)[number]))
      errors.push({ pointer: `${pointer}/${key}`, message: 'Unknown colour.' });
  }
  return errors;
}

/** Field errors for a theme document. An empty list means the values are safe to store. */
export function validateTheme(values: unknown): FieldError[] {
  const errors: FieldError[] = [];
  if (!isRecord(values))
    return [{ pointer: '/values', message: 'Theme values must be an object.' }];
  const allowed = ['colors', 'font', 'radius', 'defaultMode', 'customCss'];
  for (const key of Object.keys(values)) {
    if (!allowed.includes(key))
      errors.push({ pointer: `/values/${key}`, message: 'Unknown field.' });
  }
  if (!isRecord(values.colors))
    errors.push({
      pointer: '/values/colors',
      message: 'Colours must include a light and a dark palette.',
    });
  else {
    for (const mode of ['light', 'dark'] as const)
      errors.push(...colorErrors(values.colors[mode], `/values/colors/${mode}`));
    for (const key of Object.keys(values.colors)) {
      if (key !== 'light' && key !== 'dark')
        errors.push({ pointer: `/values/colors/${key}`, message: 'Unknown palette.' });
    }
  }
  if (typeof values.font !== 'string' || !THEME_FONTS.includes(values.font as ThemeFont))
    errors.push({
      pointer: '/values/font',
      message: 'Choose a font from the list.',
    });
  if (
    typeof values.radius !== 'number' ||
    !Number.isInteger(values.radius) ||
    values.radius < 0 ||
    values.radius > 24
  )
    errors.push({
      pointer: '/values/radius',
      message: 'Radius must be a whole number from 0 to 24.',
    });
  if (typeof values.defaultMode !== 'string' || !MODES.includes(values.defaultMode as ThemeMode))
    errors.push({
      pointer: '/values/defaultMode',
      message: 'Choose system, light or dark.',
    });
  if (typeof values.customCss !== 'string')
    errors.push({ pointer: '/values/customCss', message: 'Custom CSS must be text.' });
  else {
    if (values.customCss.length > CUSTOM_CSS_MAX_CHARS)
      errors.push({
        pointer: '/values/customCss',
        message: `Custom CSS is ${values.customCss.length} characters; the limit is ${CUSTOM_CSS_MAX_CHARS}.`,
      });
    if (hasCssImport(values.customCss))
      errors.push({
        pointer: '/values/customCss',
        message: "Custom CSS can't use @import",
      });
  }
  return errors;
}

export function themeFromValid(values: Record<string, unknown>): ThemeValues {
  const colors = values.colors as { light: ThemeColors; dark: ThemeColors };
  return {
    colors: {
      light: Object.fromEntries(COLOR_KEYS.map((key) => [key, colors.light[key]])) as ThemeColors,
      dark: Object.fromEntries(COLOR_KEYS.map((key) => [key, colors.dark[key]])) as ThemeColors,
    },
    font: values.font as ThemeFont,
    radius: values.radius as number,
    defaultMode: values.defaultMode as ThemeMode,
    customCss: values.customCss as string,
  };
}

function kindLabel(kind: AssetKind) {
  return kind === 'logo' ? 'Logo' : 'Favicon';
}

function sizeMessage(kind: AssetKind, bytes: number) {
  const limit = LIMITS[kind];
  return `${kindLabel(kind)} is ${Math.ceil(bytes / 1024)} KB; the limit is ${limit / 1024} KB`;
}

function typeMessage(kind: AssetKind, contentType: string) {
  if (kind === 'logo' && contentType === 'image/x-icon') return "Logos can't be ICO.";
  if (kind === 'favicon' && contentType === 'image/webp') return "Favicons can't be WebP.";
  return kind === 'logo'
    ? 'Logo must be a PNG, SVG or WebP.'
    : 'Favicon must be a PNG, SVG or ICO.';
}

function startsWith(data: Uint8Array, bytes: number[]) {
  return bytes.every((byte, index) => data[index] === byte);
}

function svgText(data: Uint8Array) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data).replace(/^\uFEFF/, '');
  } catch {
    return null;
  }
}

function isSvgDocument(text: string) {
  const body = text.trim().replace(/^<\?xml\b[^?]*\?>\s*/i, '');
  return /^<svg(\s|>|\/)/i.test(body);
}

function svgDenyMessages(text: string) {
  const messages: string[] = [];
  if (/<\s*script/i.test(text)) messages.push("SVG can't contain <script.");
  if (/<\s*foreignobject/i.test(text)) messages.push("SVG can't contain <foreignObject.");
  if (/[\s/]on[a-z]+\s*=/i.test(text)) messages.push("SVG can't contain an event handler.");
  if (/javascript\s*:/i.test(text)) messages.push("SVG can't contain a javascript: URL.");
  if (hasExternalHref(text)) messages.push("SVG can't contain an external href.");
  return messages;
}

function hasExternalHref(text: string) {
  const expression = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
  for (const match of text.matchAll(expression)) {
    const value = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (!value.startsWith('#')) return true;
  }
  return false;
}

function matchesMagic(data: Uint8Array, contentType: AssetContentType) {
  if (contentType === 'image/png')
    return data.length >= 4 && startsWith(data, [0x89, 0x50, 0x4e, 0x47]);
  if (contentType === 'image/webp') {
    return (
      data.length >= 12 &&
      startsWith(data, [0x52, 0x49, 0x46, 0x46]) &&
      data[8] === 0x57 &&
      data[9] === 0x45 &&
      data[10] === 0x42 &&
      data[11] === 0x50
    );
  }
  if (contentType === 'image/x-icon')
    return data.length >= 4 && startsWith(data, [0x00, 0x00, 0x01, 0x00]);
  const text = svgText(data);
  return text !== null && isSvgDocument(text);
}

function decodeBase64(data: string) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 !== 0) return null;
  try {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export async function parseAsset(
  kind: AssetKind,
  input: unknown,
): Promise<{ errors: FieldError[]; asset?: ParsedAsset }> {
  const pointer = `/${kind}`;
  if (!isRecord(input))
    return {
      errors: [{ pointer, message: `${kindLabel(kind)} must be a file or null.` }],
    };
  const errors: FieldError[] = [];
  for (const key of Object.keys(input)) {
    if (key !== 'contentType' && key !== 'data')
      errors.push({ pointer: `${pointer}/${key}`, message: 'Unknown field.' });
  }
  const contentType = input.contentType;
  const data = input.data;
  if (typeof contentType !== 'string' || !ASSET_CONTENT_TYPES.includes(contentType as AssetContentType))
    errors.push({
      pointer: `${pointer}/contentType`,
      message: typeMessage(kind, String(contentType)),
    });
  else if (!ALLOWED[kind].includes(contentType as AssetContentType))
    errors.push({
      pointer: `${pointer}/contentType`,
      message: typeMessage(kind, contentType),
    });
  if (typeof data !== 'string') {
    errors.push({ pointer: `${pointer}/data`, message: 'The image data must be base64.' });
    return { errors };
  }
  if (data.length > ASSET_BASE64_MAX_CHARS) {
    const estimated = Math.floor(data.length / 4) * 3;
    errors.push({ pointer: `${pointer}/data`, message: sizeMessage(kind, estimated) });
    return { errors };
  }
  if (errors.length) return { errors };
  const bytes = decodeBase64(data);
  if (!bytes) {
    return {
      errors: [{ pointer: `${pointer}/data`, message: "The image data isn't valid base64." }],
    };
  }
  if (bytes.length < 1 || bytes.length > LIMITS[kind]) {
    return {
      errors: [{ pointer: `${pointer}/data`, message: sizeMessage(kind, bytes.length) }],
    };
  }
  const declared = contentType as AssetContentType;
  if (!matchesMagic(bytes, declared)) {
    return {
      errors: [
        {
          pointer: `${pointer}/data`,
          message: `The file contents don't match ${declared}.`,
        },
      ],
    };
  }
  if (declared === 'image/svg+xml') {
    const text = svgText(bytes)!;
    const denied = svgDenyMessages(text);
    if (denied.length)
      return {
        errors: denied.map((message) => ({ pointer: `${pointer}/data`, message })),
      };
  }
  return {
    errors: [],
    asset: {
      contentType: declared,
      data: bytes,
      byteSize: bytes.length,
      sha256: await sha256Hex(bytes),
    },
  };
}

function unknownKeys(record: Record<string, unknown>, allowed: string[], pointer: string) {
  return Object.keys(record)
    .filter((key) => !allowed.includes(key))
    .map((key) => ({ pointer: `${pointer}/${key}`, message: 'Unknown field.' }));
}

/**
 * Validate a save or an import before any write. Import requires `format`, `version`
 * and both assets (`null` removes the stored file). Save omits an asset to keep it.
 */
export async function parseThemeWrite(
  input: unknown,
  mode: 'save' | 'import',
): Promise<{ errors: FieldError[]; theme?: ParsedThemeWrite }> {
  if (!isRecord(input))
    return {
      errors: [
        {
          pointer: '/',
          message: mode === 'import' ? 'The file is not a theme export.' : 'Theme values must be an object.',
        },
      ],
    };
  const errors: FieldError[] = [];
  if (mode === 'import') {
    errors.push(
      ...unknownKeys(input, ['format', 'version', 'exportedAt', 'values', 'logo', 'favicon'], ''),
    );
    if (input.format !== 'portal-theme')
      errors.push({ pointer: '/format', message: 'format must be portal-theme.' });
    if (input.version !== 1) errors.push({ pointer: '/version', message: 'version must be 1.' });
    if (input.exportedAt !== undefined && typeof input.exportedAt !== 'string')
      errors.push({ pointer: '/exportedAt', message: 'exportedAt must be a date.' });
  } else {
    errors.push(...unknownKeys(input, ['values', 'logo', 'favicon'], ''));
  }
  const valueErrors = validateTheme(input.values);
  errors.push(...valueErrors);
  const assets: Partial<Record<AssetKind, ParsedAsset | null | undefined>> = {};
  for (const kind of ASSET_KINDS) {
    if (!Object.hasOwn(input, kind)) {
      if (mode === 'import')
        errors.push({ pointer: `/${kind}`, message: `${kindLabel(kind)} is required. Use null to remove it.` });
      else assets[kind] = undefined;
      continue;
    }
    if (input[kind] === null) {
      assets[kind] = null;
      continue;
    }
    const parsed = await parseAsset(kind, input[kind]);
    errors.push(...parsed.errors);
    if (parsed.asset) assets[kind] = parsed.asset;
  }
  if (errors.length || !isRecord(input.values)) return { errors };
  return {
    errors: [],
    theme: {
      values: themeFromValid(input.values),
      logo: assets.logo,
      favicon: assets.favicon,
    },
  };
}
