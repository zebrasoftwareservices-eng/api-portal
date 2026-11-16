// SPDX-License-Identifier: Apache-2.0
import {
  COLOR_CSS,
  FONTS,
  type ThemeColors,
  type ThemeValues,
} from './types.js';

const HEX = /^#[0-9a-fA-F]{6}$/;

function colorBlock(colors: ThemeColors, indent: string) {
  return COLOR_CSS.map(([key, name]) => {
    const value = colors[key];
    if (!HEX.test(value))
      throw new Error(`Theme colour ${key} is not a six-digit hex value`);
    return `${indent}${name}: ${value};`;
  }).join('\n');
}

/**
 * Tokens only. Custom CSS is served from its own file and is never inlined here.
 * Light tokens go on `:root`. Dark tokens go under `prefers-color-scheme` when
 * `defaultMode` is `system`, and always under `[data-theme=dark]`.
 */
export function renderThemeCss(values: ThemeValues) {
  if (!Number.isInteger(values.radius) || values.radius < 0 || values.radius > 24)
    throw new Error('Theme radius is out of range');
  const font = FONTS[values.font];
  if (!font) throw new Error('Theme font is not in the offered list');
  const light = [
    ':root {',
    colorBlock(values.colors.light, '  '),
    `  --radius: ${values.radius}px;`,
    `  --portal-font-sans: ${font};`,
    '}',
  ].join('\n');
  const dark = colorBlock(values.colors.dark, '    ');
  const forced = [':root[data-theme=dark] {', colorBlock(values.colors.dark, '  '), '}'].join(
    '\n',
  );
  if (values.defaultMode !== 'system') return `${light}\n${forced}\n`;
  const media = [
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme=light]) {',
    dark,
    '  }',
    '}',
  ].join('\n');
  return `${light}\n${media}\n${forced}\n`;
}
