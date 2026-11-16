// SPDX-License-Identifier: Apache-2.0
import type { ThemeColors } from './types.js';
import { CONTRAST_PAIRS } from './types.js';

const HEX = /^#[0-9a-fA-F]{6}$/;

function linearize(channel: number) {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  if (!HEX.test(hex)) return null;
  const n = Number.parseInt(hex.slice(1), 16);
  const red = linearize((n >> 16) & 255);
  const green = linearize((n >> 8) & 255);
  const blue = linearize(n & 255);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG 2 contrast ratio. Invalid colours return 1 so a warning can show. */
export function contrastRatio(a: string, b: string) {
  const left = luminance(a);
  const right = luminance(b);
  if (left === null || right === null) return 1;
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

export function contrastWarnings(colors: ThemeColors, minimum = 4.5) {
  return CONTRAST_PAIRS.filter(
    ([text, surface]) => contrastRatio(colors[text], colors[surface]) < minimum,
  );
}
