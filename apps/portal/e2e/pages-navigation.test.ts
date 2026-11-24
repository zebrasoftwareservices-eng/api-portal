// SPDX-License-Identifier: Apache-2.0
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const adminUser = { email: 'admin@example.com', password: 'change-me-now' };
const origin = process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:3000';
const plainAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

test.use({ extraHTTPHeaders: { origin } });

function token() {
  return `p14${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
}

async function signIn(request: APIRequestContext, email: string, password: string) {
  const response = await request.post('/api/auth/sign-in/email', {
    headers: { origin },
    data: { email, password },
  });
  expect(response.status(), await response.text()).toBe(200);
}

async function signUp(request: APIRequestContext, email: string, password: string) {
  const response = await request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: { name: 'QA Pages', email, password },
  });
  expect(response.status(), await response.text()).toBe(200);
}

function isolated(browser: import('@playwright/test').Browser, baseURL?: string) {
  return browser.newContext({ baseURL: baseURL ?? origin, extraHTTPHeaders: { origin } });
}

async function resetNavigation(request: APIRequestContext) {
  await signIn(request, adminUser.email, adminUser.password);
  const response = await request.delete('/api/v1/admin/navigation');
  expect(response.ok(), await response.text()).toBe(true);
}

function head(html: string) {
  return html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '';
}

function meta(html: string, attr: 'name' | 'property', key: string) {
  const values: string[] = [];
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const named = tag.match(new RegExp(`\\b${attr}=(["'])(.*?)\\1`, 'i'));
    if (!named || named[2] !== key) continue;
    const content = tag.match(/\bcontent=(["'])([\s\S]*?)\1/i);
    values.push(content?.[2] ?? '');
  }
  return values;
}

function mainHtml(html: string) {
  return (html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim();
}

async function rawHtml(request: APIRequestContext, path: string) {
  const response = await request.get(path, { headers: { 'user-agent': plainAgent } });
  return { response, html: await response.text() };
}

const attackBody = [
  'Safe paragraph.',
  '',
  '## Steps',
  '',
  '- first item',
  '',
  '[docs](https://example.com/docs)',
  '',
  '![diagram](https://example.com/diagram.png)',
  '',
  '| Col |',
  '| --- |',
  '| cell |',
  '',
  '```',
  'echo hello',
  '```',
  '',
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<iframe src="https://evil.example"></iframe>',
  '[bad](javascript:alert(1))',
  '![secret](data:text/html,steal)',
].join('\n');

async function expectSafeArticle(page: Page) {
  const article = page.locator('article');
  await expect(article.getByRole('heading', { level: 2, name: 'Steps' })).toBeVisible();
  await expect(article.getByRole('listitem')).toContainText('first item');
  await expect(article.getByRole('link', { name: 'docs' })).toHaveAttribute('href', 'https://example.com/docs');
  await expect(article.locator('img')).toHaveAttribute('src', 'https://example.com/diagram.png');
  await expect(article.getByRole('region', { name: 'Table' })).toContainText('cell');
  await expect(article.getByRole('region', { name: 'Code' })).toContainText('echo hello');
  await expect(article).toContainText('Safe paragraph.');
  expect(await article.locator('script, iframe, [onerror]').count()).toBe(0);
  const html = await article.innerHTML();
  expect(html).not.toMatch(/javascript:|data:text|<script|<iframe|onerror/i);
}

test('014 AC1: a fresh portal keeps today\'s header, footer and pages', async ({ page, browser, baseURL }) => {
  test.setTimeout(120000);
  const admin = await isolated(browser, baseURL);
  const developer = await isolated(browser, baseURL);
  try {
    await resetNavigation(admin.request);
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
    await expect(nav.getByRole('link')).toHaveText(['APIs', 'Sign in', 'Sign up']);
    await expect(page.locator('#header-search-q')).toHaveAttribute('placeholder', 'Search APIs and endpoints');
    await expect(page.locator('footer').getByRole('navigation')).toHaveCount(0);
    await expect(page.locator('footer')).toContainText('Powered by Developer Portal');
    await expect(
      page.locator('#main').getByRole('heading', { level: 1, name: 'APIs', exact: true }),
    ).toBeVisible();
    const navigation = await (await page.request.get('/api/v1/navigation')).json();
    expect(navigation).toMatchObject({
      isDefault: true,
      header: [
        { kind: 'builtin', key: 'apis' },
        { kind: 'builtin', key: 'my-apps' },
      ],
      footer: [],
    });

    const email = `qa-${token()}@example.com`;
    await signUp(developer.request, email, 'QA-password-123');
    const developerPage = await developer.newPage();
    await developerPage.goto('/');
    await expect(
      developerPage.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link'),
    ).toHaveText(['APIs', 'My apps']);
    await expect(developerPage.getByRole('button', { name: `Account menu for ${email}` })).toBeVisible();
    await expect(developerPage.locator('footer').getByRole('navigation')).toHaveCount(0);

    await signIn(admin.request, adminUser.email, adminUser.password);
    const adminPage = await admin.newPage();
    for (const path of ['/', '/admin/pages']) {
      await adminPage.goto(path);
      const banner = adminPage.getByRole('banner');
      await expect(banner.getByRole('navigation', { name: 'Portal links' })).toHaveCount(0);
      await expect(banner.getByRole('navigation', { name: 'Admin account' })).toBeVisible();
      await expect(banner.getByRole('link', { name: 'APIs', exact: true })).toHaveCount(0);
      await expect(banner.getByRole('link', { name: 'My apps', exact: true })).toHaveCount(0);
      await expect(banner.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0);
      await expect(banner.getByRole('button', { name: `Account menu for ${adminUser.email}` })).toBeVisible();
    }
    const sidebar = adminPage.getByRole('navigation', { name: 'Admin', exact: true });
    await expect(sidebar.getByRole('link', { name: 'Pages', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Navigation', exact: true })).toBeVisible();
  } finally {
    await admin.close();
    await developer.close();
  }
});

test('014 AC2, AC3, AC6 and AC9: draft preview, publish, scripts and refused saves', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  test.setTimeout(180000);
  const id = token();
  const title = `Guide ${id}`;
  const slug = `guide-${id}`;
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await signIn(context.request, adminUser.email, adminUser.password);
  const before = await (await context.request.get('/api/v1/admin/pages')).json();
  const visitor = await isolated(browser, baseURL);
  try {
    await page.goto('/admin/pages/new');
    await page.getByLabel('Title', { exact: true }).fill('Temp');
    await page.getByLabel('Title', { exact: true }).fill('');
    await page.getByLabel('Slug').fill('Bad Slug');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Enter a title.' })).toBeVisible();
    await expect(page.getByRole('link', { name: /lowercase letters/ })).toBeVisible();
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Slug')).toHaveValue('Bad Slug');
    expect((await (await context.request.get('/api/v1/admin/pages')).json()).items).toHaveLength(before.items.length);

    await page.getByLabel('Title', { exact: true }).fill(title);
    await page.getByLabel('Slug').fill(slug);
    await page.getByLabel('Body').fill(attackBody);
    await page.getByLabel('Description (optional)').fill(`Public note ${id}`);
    await page.getByLabel('Search engine title (optional)').fill(`SEO ${id}`);
    await page.getByLabel('Link preview image (optional)').fill('https://cdn.example/og.png');
    const created = page.waitForResponse(
      (response) => response.url().includes('/api/v1/admin/pages') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    expect((await created).status()).toBe(201);
    await expect(page).toHaveURL(/\/admin\/pages\/[0-9a-f-]{36}$/);
    const editorUrl = page.url();
    const previewHref = await page.getByRole('link', { name: /^Preview/ }).getAttribute('href');
    expect(previewHref).toMatch(/^\/page-preview\//);
    await page.goto(previewHref!);
    await expect(page.getByText('Preview. Only admins can see this draft.')).toBeVisible();
    await expectSafeArticle(page);
    expect(dialogs).toEqual([]);

    const hidden = await visitor.request.get(`/pages/${slug}`, { headers: { 'user-agent': plainAgent } });
    expect(hidden.status()).toBe(404);
    const hiddenHtml = await hidden.text();
    for (const marker of [title, `Public note ${id}`, `SEO ${id}`, 'Safe paragraph', 'echo hello', 'alert(1)'])
      expect(hiddenHtml).not.toContain(marker);
    const visitorPage = await visitor.newPage();
    visitorPage.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    await visitorPage.goto(`/pages/${slug}`);
    await expect(visitorPage.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible();
    await visitorPage.goto(previewHref!);
    await expect(visitorPage.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible();

    await page.goto(editorUrl);
    await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeVisible();
    const published = page.waitForResponse(
      (response) => response.url().includes('/api/v1/admin/pages/') && response.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    expect((await published).status()).toBe(200);
    await visitorPage.goto(`/pages/${slug}`);
    await expect(visitorPage.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expectSafeArticle(visitorPage);
    expect(dialogs).toEqual([]);
    const { response: htmlResponse, html } = await rawHtml(visitor.request, `/pages/${slug}`);
    expect(htmlResponse.status()).toBe(200);
    expect(htmlResponse.headers()['cache-control'] ?? '').toMatch(/private/);
    expect(htmlResponse.headers()['cache-control'] ?? '').toMatch(/no-store/);
    const tags = head(html);
    expect(tags).toContain(`<title>SEO ${id}</title>`);
    expect(meta(tags, 'name', 'description')).toEqual([`Public note ${id}`]);
    expect(meta(tags, 'property', 'og:title')).toContain(`SEO ${id}`);
    expect(meta(tags, 'property', 'og:description')).toContain(`Public note ${id}`);
    expect(meta(tags, 'property', 'og:image')).toContain('https://cdn.example/og.png');

    await page.goto(editorUrl);
    await expect(page.getByLabel('Body')).toHaveValue(attackBody);
    await page.getByLabel('Body').fill(`Updated live ${id}`);
    const saved = page.waitForResponse(
      (response) => response.url().includes('/api/v1/admin/pages/') && response.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    expect((await saved).status()).toBe(200);
    await visitorPage.goto(`/pages/${slug}`);
    await expect(visitorPage.locator('article')).toContainText(`Updated live ${id}`);
    await expect(visitorPage.locator('article')).not.toContainText('Safe paragraph.');

    await page.goto('/admin/pages/new');
    await page.getByLabel('Title', { exact: true }).fill(`Copy ${id}`);
    await page.getByLabel('Slug').fill(slug);
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('link', { name: /Another page already uses this slug/ })).toBeVisible();
    await expect(page.getByLabel('Slug')).toHaveValue(slug);
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue(`Copy ${id}`);
  } finally {
    await visitor.close();
  }
});

test('014 AC4, AC5 and AC10: visibility, search, leak, 404 parity and empty SEO', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(180000);
  const id = token();
  const shared = `shared${id}`;
  const publicTitle = `Lumen ${id}`;
  const privateTitle = `Harbor ${id}`;
  const draftTitle = `Warehouse ${id}`;
  const publicSlug = `lumen-${id}`;
  const privateSlug = `harbor-${id}`;
  const draftSlug = `warehouse-${id}`;
  const bareSlug = `bare-${id}`;
  const bodyLeak = `bodyleak${id}`;
  const email = `qa-${id}@example.com`;
  const password = 'QA-password-123';
  const admin = await isolated(browser, baseURL);
  const developer = await isolated(browser, baseURL);
  const visitor = await isolated(browser, baseURL);
  try {
    await signIn(admin.request, adminUser.email, adminUser.password);
    await signUp(developer.request, email, password);
    const write = async (body: Record<string, unknown>) => {
      const response = await admin.request.post('/api/v1/admin/pages', {
        data: {
          body: '',
          description: null,
          seoTitle: null,
          ogImageUrl: null,
          visibility: 'public',
          status: 'published',
          ...body,
        },
      });
      const text = await response.text();
      expect(response.status(), text).toBe(201);
      return JSON.parse(text) as { id: string };
    };
    await write({
      slug: publicSlug,
      title: publicTitle,
      description: `${shared} public`,
      seoTitle: null,
      body: 'Public body',
    });
    await write({
      slug: privateSlug,
      title: privateTitle,
      description: `${shared} private`,
      body: bodyLeak,
      visibility: 'signed-in',
    });
    await write({
      slug: draftSlug,
      title: draftTitle,
      description: `${shared} draft`,
      body: bodyLeak,
      status: 'draft',
    });
    await write({ slug: bareSlug, title: `Bare ${id}`, description: null, seoTitle: null, ogImageUrl: null });

    const visitorPage = await visitor.newPage();
    const missing = await visitorPage.goto(`/pages/missing-${id}`);
    expect(missing?.status()).toBe(404);
    await expect(visitorPage.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible();
    await expect(visitorPage.getByText('Some pages are for signed-in developers only.')).toBeVisible();
    const missingSignIn = await visitorPage.locator('#main').getByRole('link', { name: 'Sign in', exact: true }).getAttribute('href');
    const hidden = await visitorPage.goto(`/pages/${privateSlug}`);
    expect(hidden?.status()).toBe(404);
    await expect(visitorPage.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible();
    await expect(visitorPage.getByText(privateTitle)).toHaveCount(0);
    const hiddenSignIn = await visitorPage.locator('#main').getByRole('link', { name: 'Sign in', exact: true }).getAttribute('href');
    expect(missingSignIn).toContain(encodeURIComponent(`/pages/missing-${id}`));
    expect(hiddenSignIn).toContain(encodeURIComponent(`/pages/${privateSlug}`));
    const missingHtml = await rawHtml(visitor.request, `/pages/missing-${id}`);
    const hiddenHtml = await rawHtml(visitor.request, `/pages/${privateSlug}`);
    expect(mainHtml(missingHtml.html).replaceAll(`missing-${id}`, 'SLUG')).toBe(
      mainHtml(hiddenHtml.html).replaceAll(privateSlug, 'SLUG'),
    );
    for (const marker of [privateTitle, draftTitle, bodyLeak, `${shared} private`, `${shared} draft`]) {
      expect(hiddenHtml.html).not.toContain(marker);
      expect(missingHtml.html).not.toContain(marker);
    }

    const bare = await rawHtml(visitor.request, `/pages/${bareSlug}`);
    const bareHead = head(bare.html);
    expect(bareHead).toContain(`<title>Bare ${id} · Developer Portal</title>`);
    expect(meta(bareHead, 'name', 'description')).toEqual([]);
    expect(meta(bareHead, 'property', 'og:image')).toEqual([]);
    expect(meta(bareHead, 'property', 'og:description')).toEqual([]);
    expect(bare.html).not.toContain('Read API references, get a key and try a call.');

    await visitorPage.goto('/search');
    await expect(visitorPage.getByText(/page titles/)).toBeVisible();
    await visitorPage.goto(`/search?q=${encodeURIComponent(shared)}`);
    const visitorResults = visitorPage.getByRole('list', { name: 'Search results' });
    const publicResult = visitorResults.getByRole('link', { name: new RegExp(publicTitle) });
    await expect(publicResult).toHaveCount(1);
    await expect(publicResult).toHaveAttribute('href', `/pages/${publicSlug}`);
    await expect(publicResult).toContainText(`${shared} public`);
    await expect(visitorResults.getByRole('link', { name: new RegExp(privateTitle) })).toHaveCount(0);
    await expect(visitorResults.getByRole('link', { name: new RegExp(draftTitle) })).toHaveCount(0);
    const visitorSearch = await visitor.request.get(`/api/v1/search?q=${encodeURIComponent(shared)}`);
    expect((await visitorSearch.json()).items).toEqual([
      { kind: 'page', page: { slug: publicSlug, title: publicTitle, description: `${shared} public` } },
    ]);
    for (const term of [privateTitle, draftTitle, bodyLeak]) {
      const response = await visitor.request.get(`/api/v1/search?q=${encodeURIComponent(term)}`);
      expect((await response.json()).items).toEqual([]);
    }
    for (const path of ['/', `/search?q=${encodeURIComponent(shared)}`, `/pages/${draftSlug}`]) {
      const fetched = await rawHtml(visitor.request, path);
      for (const marker of [privateTitle, draftTitle, bodyLeak, `${shared} private`])
        expect(fetched.html, path).not.toContain(marker);
    }

    await visitorPage.goto(`/pages/${privateSlug}`);
    await visitorPage.locator('#main').getByRole('link', { name: 'Sign in', exact: true }).click();
    await expect(visitorPage).toHaveURL(/\/sign-in\?next=/);
    await visitorPage.getByLabel('Email', { exact: true }).fill(email);
    await visitorPage.getByLabel('Password', { exact: true }).fill(password);
    await visitorPage.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(visitorPage).toHaveURL(new RegExp(`/pages/${privateSlug}$`));
    await expect(visitorPage.getByRole('heading', { level: 1, name: privateTitle })).toBeVisible();
    await expect(visitorPage.locator('article')).toContainText(bodyLeak);

    const signedInHtml = await rawHtml(developer.request, `/pages/${privateSlug}`);
    expect(signedInHtml.response.status()).toBe(200);
    expect(meta(head(signedInHtml.html), 'name', 'robots').join(' ')).toMatch(/noindex/);
    expect(signedInHtml.response.headers()['cache-control'] ?? '').toMatch(/private/);
    expect(signedInHtml.response.headers()['cache-control'] ?? '').toMatch(/no-store/);
    const api = await developer.request.get(`/api/v1/pages/${privateSlug}`);
    expect(api.headers()['cache-control']).toBe('private, no-store');

    const developerPage = await developer.newPage();
    await developerPage.goto(`/search?q=${encodeURIComponent(shared)}`);
    const developerResults = developerPage.getByRole('list', { name: 'Search results' });
    await expect(developerResults.getByRole('link', { name: new RegExp(publicTitle) })).toHaveCount(1);
    await expect(developerResults.getByRole('link', { name: new RegExp(privateTitle) })).toHaveCount(1);
    await expect(developerResults.getByRole('link', { name: new RegExp(draftTitle) })).toHaveCount(0);
    const developerSearch = await developer.request.get(`/api/v1/search?q=${encodeURIComponent(shared)}`);
    expect((await developerSearch.json()).items.map((item: { page: { slug: string } }) => item.page.slug).sort()).toEqual(
      [privateSlug, publicSlug].sort(),
    );
    const bodySearch = await developer.request.get(`/api/v1/search?q=${encodeURIComponent(bodyLeak)}`);
    expect((await bodySearch.json()).items).toEqual([]);
    void page;
  } finally {
    await admin.close();
    await developer.close();
    await visitor.close();
  }
});

test('014 AC7 and AC8: saved navigation order, filtered links, unpublish and reset', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  test.setTimeout(180000);
  const id = token();
  const publicTitle = `Public ${id}`;
  const privateTitle = `Private ${id}`;
  const draftTitle = `Draft ${id}`;
  const publicSlug = `public-${id}`;
  const privateSlug = `private-${id}`;
  const draftSlug = `draft-${id}`;
  const guide = `Guide ${id}`;
  const status = `Status ${id}`;
  const members = `Members ${id}`;
  const draftLink = `Draft link ${id}`;
  const foot = `Foot ${id}`;
  const email = `nav-${id}@example.com`;
  await signIn(context.request, adminUser.email, adminUser.password);
  const developer = await isolated(browser, baseURL);
  const visitor = await isolated(browser, baseURL);
  try {
    await resetNavigation(context.request);
    const create = async (body: Record<string, unknown>) => {
      const response = await context.request.post('/api/v1/admin/pages', {
        data: {
          body: '',
          description: null,
          seoTitle: null,
          ogImageUrl: null,
          visibility: 'public',
          status: 'published',
          ...body,
        },
      });
      const text = await response.text();
      expect(response.status(), text).toBe(201);
      return JSON.parse(text) as { id: string };
    };
    const visible = await create({ slug: publicSlug, title: publicTitle });
    await create({ slug: privateSlug, title: privateTitle, visibility: 'signed-in' });
    const draft = await create({ slug: draftSlug, title: draftTitle, status: 'draft' });

    await page.goto('/admin/navigation');
    const header = page.getByRole('region', { name: 'Header' });
    const footer = page.getByRole('region', { name: 'Footer' });
    await expect(footer.getByText('No footer links.')).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Show Sign in' })).toHaveCount(0);
    await expect(page.getByRole('switch', { name: 'Show APIs' })).toBeChecked();
    await header.getByRole('button', { name: 'Add external link' }).click();
    const bad = header.getByRole('group').last();
    await bad.getByLabel('Label').fill('Bad');
    await bad.getByLabel('Web address').fill('javascript:alert(1)');
    await page.getByRole('button', { name: 'Save navigation', exact: true }).click();
    await expect(page.getByRole('link', { name: /full https:\/\/ address/ })).toBeVisible();
    const kept = await bad.getByLabel('Web address').inputValue();
    expect(['javascript:alert(1)', '']).toContain(kept);
    expect((await (await context.request.get('/api/v1/admin/navigation')).json()).isDefault).toBe(true);
    await bad.getByRole('button', { name: /^Remove / }).click();

    await header.getByRole('button', { name: 'Add page link' }).click();
    let row = header.getByRole('group').last();
    await row.getByLabel('Page').selectOption({ label: publicTitle });
    await row.getByLabel('Label').fill(guide);
    await header.getByRole('button', { name: 'Add external link' }).click();
    row = header.getByRole('group').last();
    await row.getByLabel('Label').fill(status);
    await row.getByLabel('Web address').fill(`https://example.com/${id}`);
    await header.getByRole('button', { name: 'Add page link' }).click();
    row = header.getByRole('group').last();
    await row.getByLabel('Page').selectOption({ label: `${privateTitle}, signed-in only` });
    await row.getByLabel('Label').fill(members);
    await header.getByRole('button', { name: 'Add page link' }).click();
    row = header.getByRole('group').last();
    await row.getByLabel('Page').selectOption({ label: `${draftTitle}, draft` });
    await row.getByLabel('Label').fill(draftLink);
    await header.getByRole('switch', { name: 'Show APIs' }).click();
    await header.getByRole('button', { name: `Move ${guide} up` }).click();
    await header.getByRole('button', { name: `Move ${guide} up` }).click();
    await footer.getByRole('button', { name: 'Add page link' }).click();
    const footRow = footer.getByRole('group').last();
    await footRow.getByLabel('Page').selectOption({ label: publicTitle });
    await footRow.getByLabel('Label').fill(foot);

    const saved = page.waitForResponse(
      (response) => response.url().includes('/api/v1/admin/navigation') && response.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Save navigation', exact: true }).click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByText('Navigation saved. Visitors see it on their next page load.')).toBeVisible();

    const visitorPage = await visitor.newPage();
    await visitorPage.setViewportSize({ width: 1280, height: 900 });
    await visitorPage.goto('/');
    await expect(
      visitorPage.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link'),
    ).toHaveText([guide, status, 'Sign in', 'Sign up']);
    await expect(visitorPage.getByRole('link', { name: members })).toHaveCount(0);
    await expect(visitorPage.getByRole('link', { name: draftLink })).toHaveCount(0);
    await expect(visitorPage.getByRole('navigation', { name: 'Footer' }).getByRole('link')).toHaveText([foot]);
    await visitorPage.setViewportSize({ width: 375, height: 800 });
    await visitorPage.getByRole('button', { name: 'Open menu', exact: true }).click();
    await expect(
      visitorPage.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link'),
    ).toHaveText([guide, status, 'Sign in', 'Sign up']);

    await signUp(developer.request, email, 'QA-password-123');
    const developerPage = await developer.newPage();
    await developerPage.goto('/');
    await expect(
      developerPage.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link'),
    ).toHaveText([guide, 'My apps', status, members]);
    await expect(developerPage.getByRole('button', { name: `Account menu for ${email}` })).toBeVisible();
    await expect(developerPage.getByRole('link', { name: draftLink })).toHaveCount(0);

    await page.goto(`/admin/pages/${draft.id}`);
    await page.getByRole('button', { name: 'Delete page', exact: true }).click();
    const deleting = page.getByRole('alertdialog');
    await expect(deleting).toContainText(`Header: ${draftLink}`);
    await deleting.getByRole('button', { name: 'Delete page', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Pages', exact: true })).toBeVisible();
    expect((await visitor.request.get(`/pages/${draftSlug}`)).status()).toBe(404);

    await page.goto(`/admin/pages/${visible.id}`);
    await page.getByRole('button', { name: 'Unpublish', exact: true }).click();
    const unpublish = page.getByRole('alertdialog');
    await expect(unpublish).toContainText(`Header: ${guide}`);
    await expect(unpublish).toContainText(`Footer: ${foot}`);
    const unpublished = page.waitForResponse(
      (response) => response.url().includes('/api/v1/admin/pages/') && response.request().method() === 'PUT',
    );
    await unpublish.getByRole('button', { name: 'Unpublish', exact: true }).click();
    expect((await unpublished).status()).toBe(200);
    await expect(page.getByText("Page unpublished. It's a draft now.")).toBeVisible();
    await visitorPage.setViewportSize({ width: 1280, height: 900 });
    await visitorPage.goto('/');
    await expect(visitorPage.getByRole('link', { name: guide })).toHaveCount(0);
    await expect(visitorPage.getByRole('link', { name: foot })).toHaveCount(0);
    expect((await visitor.request.get(`/pages/${publicSlug}`)).status()).toBe(404);
    await expect(
      visitorPage.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link'),
    ).toHaveText([status, 'Sign in', 'Sign up']);

    await page.goto('/admin/navigation');
    await page.getByRole('button', { name: 'Reset to default', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reset to default', exact: true }).click();
    await expect(page.getByText('Navigation reset to default.')).toBeVisible();
    await visitorPage.goto('/');
    await expect(
      visitorPage.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link'),
    ).toHaveText(['APIs', 'Sign in', 'Sign up']);
    await expect(visitorPage.locator('footer').getByRole('navigation')).toHaveCount(0);
  } finally {
    await resetNavigation(context.request);
    await developer.close();
    await visitor.close();
  }
});

test('014 AC9: missing permission, an ended session and a duplicate slug change nothing', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  const id = token();
  const admin = await isolated(browser, baseURL);
  const developer = await isolated(browser, baseURL);
  const visitor = await isolated(browser, baseURL);
  try {
    await signIn(admin.request, adminUser.email, adminUser.password);
    await resetNavigation(admin.request);
    const slug = `kept-${id}`;
    const created = await admin.request.post('/api/v1/admin/pages', {
      data: {
        title: `Kept ${id}`,
        slug,
        body: 'kept',
        visibility: 'public',
        status: 'draft',
        description: null,
        seoTitle: null,
        ogImageUrl: null,
      },
    });
    expect(created.status()).toBe(201);
    const beforePages = await (await admin.request.get('/api/v1/admin/pages')).text();
    const beforeNav = await (await admin.request.get('/api/v1/admin/navigation')).text();
    const write = {
      title: `Other ${id}`,
      slug: `other-${id}`,
      body: '',
      visibility: 'public',
      status: 'draft',
      description: null,
      seoTitle: null,
      ogImageUrl: null,
    };
    expect((await visitor.request.post('/api/v1/admin/pages', { data: write })).status()).toBe(401);
    expect((await visitor.request.put('/api/v1/admin/navigation', { data: { header: [], footer: [] } })).status()).toBe(401);
    expect((await visitor.request.delete('/api/v1/admin/navigation')).status()).toBe(401);
    const email = `dev-${id}@example.com`;
    await signUp(developer.request, email, 'QA-password-123');
    expect((await developer.request.post('/api/v1/admin/pages', { data: write })).status()).toBe(403);
    expect((await developer.request.get('/api/v1/admin/pages')).status()).toBe(403);
    expect((await developer.request.delete(`/api/v1/admin/pages/${(await created.json()).id}`)).status()).toBe(403);
    const missing = await admin.request.put('/api/v1/admin/navigation', {
      data: {
        header: [
          { kind: 'builtin', key: 'apis', hidden: false },
          { kind: 'builtin', key: 'my-apps', hidden: false },
          { kind: 'page', label: 'Gone', pageId: crypto.randomUUID() },
        ],
        footer: [],
      },
    });
    expect(missing.status()).toBe(400);
    const problem = await missing.json();
    expect(problem.type).toBe('/problems/validation');
    expect(problem.errors).toEqual(expect.arrayContaining([{ pointer: '/header/2/pageId', message: expect.any(String) }]));
    const race = `race-${id}`;
    const duplicate = await Promise.all([
      admin.request.post('/api/v1/admin/pages', { data: { ...write, slug: race } }),
      admin.request.post('/api/v1/admin/pages', { data: { ...write, slug: race } }),
    ]);
    expect(duplicate.map((response) => response.status()).sort()).toEqual([201, 409]);
    await admin.clearCookies();
    const ended = await admin.request.post('/api/v1/admin/pages', { data: { ...write, slug: `ended-${id}` } });
    expect(ended.status()).toBe(401);
    expect(ended.headers()['content-type'] ?? '').toContain('application/problem+json');
    await signIn(admin.request, adminUser.email, adminUser.password);
    const pages = await (await admin.request.get('/api/v1/admin/pages')).json();
    expect(pages.items.some((item: { slug: string }) => item.slug === `ended-${id}`)).toBe(false);
    expect(pages.items.some((item: { slug: string }) => item.slug === slug)).toBe(true);
    expect((await (await admin.request.get('/api/v1/admin/navigation')).json()).isDefault).toBe(true);
    expect(beforePages.length).toBeGreaterThan(0);
    expect(beforeNav).toContain('"isDefault":true');
  } finally {
    await admin.close();
    await developer.close();
    await visitor.close();
  }
});
