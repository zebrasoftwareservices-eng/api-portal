// SPDX-License-Identifier: Apache-2.0
import { COLOR_KEYS, type ThemeValues } from './types.js';

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

export async function sha256Hex(data: string | Uint8Array) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', arrayBuffer(bytes));
  let hex = '';
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

function canonicalColors(colors: ThemeValues['colors']['light']) {
  return COLOR_KEYS.map((key) => `${key}=${colors[key]}`).join(',');
}

/** Stable text hashed into the theme etag. Asset bytes are represented by their sha256. */
export function canonicalTheme(
  values: ThemeValues,
  assets: readonly { kind: string; sha256: string }[],
) {
  const assetPart = [...assets]
    .sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0))
    .map((asset) => `${asset.kind}=${asset.sha256}`)
    .join(',');
  return [
    `light:${canonicalColors(values.colors.light)}`,
    `dark:${canonicalColors(values.colors.dark)}`,
    `font:${values.font}`,
    `radius:${values.radius}`,
    `mode:${values.defaultMode}`,
    `css:${values.customCss}`,
    `assets:${assetPart}`,
  ].join('\n');
}

/** First 16 hex characters of the sha256 of the canonical theme. */
export async function themeEtag(
  values: ThemeValues,
  assets: readonly { kind: string; sha256: string }[] = [],
) {
  const hash = await sha256Hex(canonicalTheme(values, assets));
  return hash.slice(0, 16);
}
