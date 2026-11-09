// SPDX-License-Identifier: Apache-2.0
export function versionHref(slug: string, version: string, isLatest = false) {
  return isLatest
    ? `/apis/${slug}`
    : `/apis/${slug}/versions/${encodeURIComponent(version)}`;
}
