// SPDX-License-Identifier: Apache-2.0
/** Full page load. Client navigation would keep theme stylesheets mounted. */
export function assignLocation(href: string) {
  window.location.assign(href);
}
