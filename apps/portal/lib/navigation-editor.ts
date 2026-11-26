// SPDX-License-Identifier: Apache-2.0
import type { components } from '@portal/sdk';
import { httpsUrl } from './page-form';

export type PageSummary = components['schemas']['PageSummary'];
export type NavigationSettings = components['schemas']['NavigationSettings'];
type SettingsItem = NavigationSettings['header'][number];
type PageSnapshot = Extract<SettingsItem, { kind: 'page' }>['page'];

export type NavRow =
  | { clientId: string; kind: 'builtin'; key: 'apis' | 'my-apps'; hidden: boolean }
  | { clientId: string; kind: 'page'; label: string; pageId: string; page?: PageSnapshot }
  | { clientId: string; kind: 'link'; label: string; url: string };

export function rowFromSettings(item: SettingsItem, clientId: string): NavRow {
  if (item.kind === 'builtin') return { clientId, kind: 'builtin', key: item.key, hidden: item.hidden };
  if (item.kind === 'page')
    return { clientId, kind: 'page', label: item.label, pageId: item.pageId, page: item.page };
  return { clientId, kind: 'link', label: item.label, url: item.url };
}

export function canonicalRow(row: NavRow) {
  if (row.kind === 'builtin') return { kind: row.kind, key: row.key, hidden: row.hidden };
  if (row.kind === 'page') return { kind: row.kind, label: row.label, pageId: row.pageId };
  return { kind: row.kind, label: row.label, url: row.url };
}

export function sameNavigation(left: NavRow[], right: NavRow[]) {
  return JSON.stringify(left.map(canonicalRow)) === JSON.stringify(right.map(canonicalRow));
}

export function builtinLabel(key: 'apis' | 'my-apps') {
  return key === 'apis' ? 'APIs' : 'My apps';
}

export function pageOptionLabel(page: Pick<PageSummary, 'title' | 'status' | 'visibility'>) {
  if (page.status === 'draft') return `${page.title}, draft`;
  if (page.visibility === 'signed-in') return `${page.title}, signed-in only`;
  return page.title;
}

export function pageAudience(page: Pick<PageSummary, 'status' | 'visibility'>) {
  if (page.status === 'draft') return 'Draft. Nobody sees this link until you publish the page.';
  if (page.visibility === 'signed-in')
    return "Signed-in only. Signed-out visitors don't see this link.";
  return 'Public. Everyone sees this link.';
}

export function navigationFieldMessage(pointer: string, row: NavRow | undefined, pagesLoaded: boolean, pages: PageSummary[]) {
  if (pointer.endsWith('/label')) {
    const label = row && row.kind !== 'builtin' ? row.label : '';
    if (!label.trim()) return 'Enter a label.';
    if (label.length > 60) return 'Use 60 characters or fewer.';
    return 'Enter a label.';
  }
  if (pointer.endsWith('/url'))
    return 'Enter a full https:// address without a user name or password.';
  if (pointer.endsWith('/pageId')) {
    const pageId = row && row.kind === 'page' ? row.pageId : '';
    if (!pageId) return 'Choose a page.';
    if (pagesLoaded && !pages.some((page) => page.id === pageId))
      return 'This page no longer exists. Choose another page or remove the link.';
    return 'Choose a page.';
  }
  return 'Check this field.';
}

export function clientNavigationErrors(area: 'header' | 'footer', rows: NavRow[], pages: PageSummary[] | undefined) {
  const errors: Record<string, string> = {};
  rows.forEach((row, index) => {
    const base = `/${area}/${index}`;
    if (row.kind === 'builtin') return;
    if (!row.label.trim() || row.label.length > 60)
      errors[`${base}/label`] = navigationFieldMessage(`${base}/label`, row, Boolean(pages), pages || []);
    if (row.kind === 'link' && !httpsUrl(row.url))
      errors[`${base}/url`] = navigationFieldMessage(`${base}/url`, row, Boolean(pages), pages || []);
    if (row.kind === 'page' && (!row.pageId || (pages && !pages.some((page) => page.id === row.pageId))))
      errors[`${base}/pageId`] = navigationFieldMessage(`${base}/pageId`, row, Boolean(pages), pages || []);
  });
  return errors;
}

export function rowName(row: NavRow, index: number) {
  if (row.kind === 'builtin') return builtinLabel(row.key);
  return row.label.trim() || `link ${index + 1}`;
}
