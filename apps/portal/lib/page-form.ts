// SPDX-License-Identifier: Apache-2.0
import type { components } from '@portal/sdk';

export type PageWrite = components['schemas']['PageWrite'];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function oneLine(value: string) {
  return value.replace(/[\r\n]+/g, ' ');
}

/** Lowercase, other characters become single hyphens, trimmed to 64. */
export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
}

export function httpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function pageFieldMessage(
  pointer: string,
  form: PageWrite,
  status = 400,
  serverMessage?: string,
) {
  if (pointer === '/title') {
    if (!form.title.trim()) return 'Enter a title.';
    if (form.title.length > 120) return 'Use 120 characters or fewer.';
    return serverMessage || 'Enter a title.';
  }
  if (pointer === '/slug') {
    if (status === 409) return 'Another page already uses this slug. Choose a different one.';
    return 'Use 2–64 lowercase letters, numbers and single hyphens, like getting-started.';
  }
  if (pointer === '/body') return 'The body can be at most 100,000 characters.';
  if (pointer === '/description') return 'Use 300 characters or fewer.';
  if (pointer === '/seoTitle') return 'Use 120 characters or fewer.';
  if (pointer === '/ogImageUrl')
    return 'Enter a full https:// address without a user name or password.';
  return serverMessage || 'Check this field.';
}

export function clientPageErrors(form: PageWrite) {
  const errors: Record<string, string> = {};
  if (!form.title.trim() || form.title.length > 120)
    errors['/title'] = pageFieldMessage('/title', form);
  if (!SLUG.test(form.slug) || form.slug.length < 2 || form.slug.length > 64)
    errors['/slug'] = pageFieldMessage('/slug', form);
  if (form.body.length > 100_000) errors['/body'] = pageFieldMessage('/body', form);
  if ((form.description?.length || 0) > 300)
    errors['/description'] = pageFieldMessage('/description', form);
  if ((form.seoTitle?.length || 0) > 120)
    errors['/seoTitle'] = pageFieldMessage('/seoTitle', form);
  if (form.ogImageUrl && !httpsUrl(form.ogImageUrl))
    errors['/ogImageUrl'] = pageFieldMessage('/ogImageUrl', form);
  return errors;
}

export function linkedAreas(navigation: { area: 'header' | 'footer' }[]) {
  const areas = [...new Set(navigation.map((entry) => entry.area))];
  if (!areas.length) return { text: '—', unlinked: true };
  return {
    text: areas.map((area) => (area === 'header' ? 'Header' : 'Footer')).join(', '),
    unlinked: false,
  };
}
