// SPDX-License-Identifier: Apache-2.0
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type Locator,
  type Page,
} from '@playwright/test';

const origin = process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:3000';
const adminEmail = 'admin@example.com';
const adminPassword = 'change-me-now';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const ICO = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
const MARKER = '.site-header { border-top: 7px solid #ff00aa !important; }';

test.use({ extraHTTPHeaders: { origin }, viewport: { width: 1280, height: 900 } });
test.describe.configure({ timeout: 90_000 });

function rgb(hex: string) {
  const body = hex.replace('#', '');
  return `rgb(${Number.parseInt(body.slice(0, 2), 16)}, ${Number.parseInt(body.slice(2, 4), 16)}, ${Number.parseInt(body.slice(4, 6), 16)})`;
}

async function signIn(request: APIRequestContext, email = adminEmail, password = adminPassword) {
  const result = await request.post('/api/auth/sign-in/email', { data: { email, password } });
  expect(result.status(), await result.text()).toBe(200);
}

async function themeEtag(request: APIRequestContext) {
  const result = await request.get('/api/v1/theme');
  expect(result.status(), await result.text()).toBe(200);
  return (await result.json()).etag as string;
}

async function openTheme(page: Page) {
  await page.goto('/admin/theme');
  await expect(page.getByText(/^(Default|Custom) theme$/)).toBeVisible();
}

async function setHex(page: Page, id: string, value: string) {
  const field = page.locator(`#${id}`);
  await field.fill(value);
  await field.blur();
}

async function saveTheme(page: Page) {
  const save = page.getByRole('button', { name: 'Save theme', exact: true });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText('Theme saved. Visitors see it on their next page load.')).toBeVisible();
}

async function cssVar(root: Locator, name: string) {
  return root.evaluate((element, property) => {
    return getComputedStyle(element).getPropertyValue(property).trim().toLowerCase();
  }, name);
}

async function styleText(style: Locator) {
  return style.evaluate((element) => element.textContent ?? '');
}

async function publicPage(browser: Browser, colorScheme: 'light' | 'dark' = 'light') {
  const context = await browser.newContext({ colorScheme, extraHTTPHeaders: { origin } });
  const page = await context.newPage();
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'APIs', exact: true, level: 1 })).toBeVisible();
  return { context, page };
}

test.afterEach(async ({ playwright, baseURL }) => {
  const admin = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL ?? origin },
  });
  try {
    await signIn(admin);
    const reset = await admin.delete('/api/v1/admin/theme');
    const status = reset.status();
    const text = await reset.text();
    expect(status, text).toBe(200);
  } finally {
    await admin.dispose();
  }
});

test('013 AC 1: a saved primary colour and PNG logo show on the next public page load', async ({
  page,
  browser,
}) => {
  const request = page.context().request;
  await signIn(request);
  await openTheme(page);
  await setHex(page, 'theme-color-light-primary', '#aa11bb');
  await page.locator('#theme-logo').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(page.getByText('Not saved yet')).toBeVisible();
  await saveTheme(page);
  const visitor = await publicPage(browser);
  try {
    await expect.poll(() => cssVar(visitor.page.locator('html'), '--primary')).toBe('#aa11bb');
    await expect(visitor.page.locator('a.button', { hasText: 'Sign up' })).toHaveCSS(
      'background-color',
      rgb('#aa11bb'),
    );
    await expect(visitor.page.locator('img.brand-logo')).toHaveAttribute(
      'src',
      /\/api\/v1\/theme\/assets\/logo\?v=/,
    );
    await expect(visitor.page.locator('img.brand-logo')).toHaveAttribute('alt', 'Developer Portal');
  } finally {
    await visitor.context.close();
  }
});

test('013 AC 2: preview updates before save, then both colour schemes use the saved font and radius', async ({
  page,
  browser,
}) => {
  const request = page.context().request;
  await signIn(request);
  const before = await themeEtag(request);
  const framing = await request.get('/');
  expect(framing.headers()['content-security-policy']).toContain("frame-ancestors 'self'");
  expect(framing.headers()['x-frame-options']).toMatch(/SAMEORIGIN/i);
  await openTheme(page);
  await setHex(page, 'theme-color-light-primary', '#123456');
  await page.getByRole('tablist', { name: 'Colour mode' }).getByRole('tab', { name: 'Dark', exact: true }).click();
  await setHex(page, 'theme-color-dark-primary', '#abcdef');
  await page.getByLabel('Font', { exact: true }).selectOption('inter');
  await page.locator('#theme-radius').fill('16');
  await page.locator('#theme-radius').blur();
  const preview = page.frameLocator('iframe[title="Preview of the public portal with your unsaved theme"]');
  const previewStyle = preview.locator('style[data-portal-theme-preview]');
  await expect.poll(() => styleText(previewStyle)).toContain('--primary: #123456;');
  await expect.poll(() => styleText(previewStyle)).toContain('--primary: #abcdef;');
  await expect.poll(() => styleText(previewStyle)).toContain('--radius: 16px;');
  await expect.poll(() => styleText(previewStyle)).toContain('Inter Variable');
  await page.getByRole('group', { name: 'Preview mode' }).getByRole('button', { name: 'Dark', exact: true }).click();
  await expect.poll(() => cssVar(preview.locator('html'), '--primary')).toBe('#abcdef');
  expect(await themeEtag(request)).toBe(before);
  const unchanged = await publicPage(browser);
  try {
    await expect.poll(() => cssVar(unchanged.page.locator('html'), '--primary')).toBe('#1d4ed8');
  } finally {
    await unchanged.context.close();
  }
  await saveTheme(page);
  const light = await browser.newContext({ colorScheme: 'light', extraHTTPHeaders: { origin } });
  const lightPage = await light.newPage();
  const hosts: string[] = [];
  lightPage.on('request', (seen) => hosts.push(new URL(seen.url()).host));
  try {
    await lightPage.goto('/');
    await expect(lightPage.getByRole('heading', { name: 'APIs', exact: true, level: 1 })).toBeVisible();
    await expect.poll(() => cssVar(lightPage.locator('html'), '--primary')).toBe('#123456');
    await expect.poll(() => cssVar(lightPage.locator('html'), '--portal-font-sans')).toContain('inter variable');
    await expect(lightPage.locator('a.button', { hasText: 'Sign up' })).toHaveCSS('border-radius', '14px');
    expect(hosts.join(' ')).not.toMatch(/fonts\.(googleapis|gstatic)|use\.typekit|cdnfonts/);
  } finally {
    await light.close();
  }
  const dark = await publicPage(browser, 'dark');
  try {
    await expect.poll(() => cssVar(dark.page.locator('html'), '--primary')).toBe('#abcdef');
  } finally {
    await dark.context.close();
  }
});

test('013 AC 3: unsaved custom CSS stays in the preview, then saved CSS reaches public and developer pages', async ({
  page,
  browser,
  playwright,
  baseURL,
}) => {
  const request = page.context().request;
  await signIn(request);
  await openTheme(page);
  await page.getByLabel('Custom CSS', { exact: true }).fill(MARKER);
  const preview = page.frameLocator('iframe[title="Preview of the public portal with your unsaved theme"]');
  await expect.poll(() => styleText(preview.locator('style[data-portal-theme-preview]'))).toContain(MARKER);
  const before = await publicPage(browser);
  try {
    await expect(before.page.locator('link[href*="custom.css"]')).toHaveCount(0);
    await expect(before.page.locator('header.site-header')).not.toHaveCSS('border-top-width', '7px');
  } finally {
    await before.context.close();
  }
  await saveTheme(page);
  const after = await publicPage(browser);
  try {
    await expect(after.page.locator('link[href*="/v1/theme/custom.css"]')).toHaveCount(1);
    await expect(after.page.locator('header.site-header')).toHaveCSS('border-top-width', '7px');
    await expect(after.page.locator('header.site-header')).toHaveCSS('border-top-color', rgb('#ff00aa'));
  } finally {
    await after.context.close();
  }
  const developer = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL ?? origin },
  });
  const context = await browser.newContext({ extraHTTPHeaders: { origin } });
  try {
    const email = `theme-qa-${crypto.randomUUID()}@example.com`;
    expect(
      (
        await developer.post('/api/auth/sign-up/email', {
          data: { name: 'Theme QA', email, password: 'QA-password-123' },
        })
      ).status(),
    ).toBe(200);
    await context.addCookies(await developer.storageState().then((state) => state.cookies));
    const dashboard = await context.newPage();
    await dashboard.goto('/dashboard');
    await expect(dashboard.getByRole('heading', { name: 'My apps', exact: true })).toBeVisible();
    await expect(dashboard.locator('header.site-header')).toHaveCSS('border-top-width', '7px');
  } finally {
    await context.close();
    await developer.dispose();
  }
});

test('013 AC 4: breaking custom CSS leaves the admin area usable by direct load and client navigation', async ({
  page,
}) => {
  const request = page.context().request;
  await signIn(request);
  await openTheme(page);
  await page.getByLabel('Custom CSS', { exact: true }).fill('body { display: none }');
  await saveTheme(page);
  await page.goto('/');
  await expect(page.locator('body')).toBeHidden();
  await expect(page.locator('link[href*="/v1/theme/custom.css"]')).toHaveCount(1);
  await page.evaluate(() => {
    const next = (window as unknown as { next?: { router?: { push: (href: string) => void } } }).next;
    if (!next?.router?.push) throw new Error('App router is not available for client navigation');
    document.documentElement.dataset.qaNav = 'client';
    next.router.push('/admin/theme');
  });
  await expect(page).toHaveURL(/\/admin\/theme$/);
  await expect(page.locator('html')).toHaveAttribute('data-qa-nav', 'client');
  await expect(page.getByText(/^(Default|Custom) theme$/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Theme', exact: true, level: 1 })).toBeVisible();
  await expect(page.locator('link[href*="/v1/theme"]')).toHaveCount(0);
  await expect(page.locator('img.brand-logo')).toHaveCount(0);
  await expect(page.locator('header a.brand')).toHaveText('Developer Portal');
  const direct = await page.context().newPage();
  try {
    const response = await direct.goto('/admin/theme');
    expect(response?.status()).toBe(200);
    await expect(direct.getByRole('heading', { name: 'Theme', exact: true, level: 1 })).toBeVisible();
    await expect(direct.locator('link[href*="/v1/theme"]')).toHaveCount(0);
    await expect(direct.locator('header a.brand')).toHaveText('Developer Portal');
    await direct.getByRole('link', { name: 'Theme', exact: true }).click();
    await expect(direct).toHaveURL(/\/admin\/theme$/);
    await expect(direct.getByRole('heading', { name: 'Theme', exact: true, level: 1 })).toBeVisible();
  } finally {
    await direct.close();
  }
  await page.getByLabel('Custom CSS', { exact: true }).fill('');
  await saveTheme(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'APIs', exact: true, level: 1 })).toBeVisible();
  await expect(page.locator('link[href*="custom.css"]')).toHaveCount(0);
});

test('013 AC 5: reset restores the shipped theme and a second reset stays on that theme', async ({
  page,
  browser,
}) => {
  const request = page.context().request;
  await signIn(request);
  await openTheme(page);
  await setHex(page, 'theme-color-light-primary', '#445566');
  await page.locator('#theme-logo').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await saveTheme(page);
  const saved = await themeEtag(request);
  await page.getByRole('button', { name: 'Reset to default', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('heading', { name: 'Reset the theme to the default?' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Reset to default', exact: true }).click();
  await expect(page.getByText('Theme reset to the default.')).toBeVisible();
  await expect(page.getByText('Default theme', { exact: true })).toBeVisible();
  const restored = await themeEtag(request);
  expect(restored).not.toBe(saved);
  const again = await request.delete('/api/v1/admin/theme');
  expect(again.status(), await again.text()).toBe(200);
  expect((await again.json()).etag).toBe(restored);
  expect((await again.json()).isDefault).toBe(true);
  const visitor = await publicPage(browser);
  try {
    await expect.poll(() => cssVar(visitor.page.locator('html'), '--primary')).toBe('#1d4ed8');
    await expect(visitor.page.locator('img.brand-logo')).toHaveCount(0);
    await expect(visitor.page.locator('header a.brand')).toHaveText('Developer Portal');
  } finally {
    await visitor.context.close();
  }
});

test('013 AC 6: export downloads the theme and import restores the same etag', async ({
  page,
  browser,
}) => {
  const request = page.context().request;
  await signIn(request);
  await openTheme(page);
  await setHex(page, 'theme-color-light-accent', '#102030');
  await page.locator('#theme-logo').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await page.locator('#theme-favicon').setInputFiles({
    name: 'favicon.ico',
    mimeType: 'image/x-icon',
    buffer: ICO,
  });
  await saveTheme(page);
  const saved = await themeEtag(request);
  const [download, exported] = await Promise.all([
    page.waitForEvent('download'),
    page.waitForResponse(
      (response) => response.url().includes('/api/v1/admin/theme/export') && response.request().method() === 'GET',
    ),
    page.getByRole('button', { name: 'Export', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('portal-theme.json');
  expect(exported.headers()['content-disposition']).toContain('portal-theme.json');
  const file = await exported.json();
  expect(file).toMatchObject({
    format: 'portal-theme',
    version: 1,
    values: { colors: { light: { accent: '#102030' } } },
    logo: { contentType: 'image/png' },
    favicon: { contentType: 'image/x-icon' },
  });
  expect(file.logo.data).toEqual(expect.any(String));
  expect(file.favicon.data).toEqual(expect.any(String));
  await page.getByRole('button', { name: 'Reset to default', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Reset to default', exact: true }).click();
  await expect(page.getByText('Default theme', { exact: true })).toBeVisible();
  await page.locator('input[aria-label="Import"]').setInputFiles({
    name: 'portal-theme.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  const importDialog = page.getByRole('alertdialog');
  await expect(importDialog.getByRole('heading', { name: 'Import portal-theme.json?' })).toBeVisible();
  await importDialog.getByRole('button', { name: 'Import and apply', exact: true }).click();
  await expect(page.getByText('Theme imported and applied.')).toBeVisible();
  expect(await themeEtag(request)).toBe(saved);
  const visitor = await publicPage(browser);
  try {
    await expect(visitor.page.locator('img.brand-logo')).toHaveAttribute(
      'src',
      /\/api\/v1\/theme\/assets\/logo\?v=/,
    );
  } finally {
    await visitor.context.close();
  }
});

test('013 AC 7: bad uploads and imports name the problem and leave the live theme unchanged', async ({
  page,
}) => {
  const request = page.context().request;
  await signIn(request);
  await openTheme(page);
  const before = await themeEtag(request);
  await page.locator('#theme-logo').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(513 * 1024, 1),
  });
  await expect(page.getByText('The logo is 513 KB; the limit is 512 KB.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save theme', exact: true })).toBeDisabled();
  await page.locator('#theme-logo').setInputFiles({
    name: 'logo.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from('GIF89a'),
  });
  await expect(page.getByText('The logo must be a PNG, SVG or WebP image.')).toBeVisible();
  await page.locator('input[aria-label="Import"]').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{'),
  });
  await expect(page.getByRole('alert').filter({ hasText: "isn't a valid JSON file" })).toContainText(
    "broken.json isn't a valid JSON file",
  );
  await setHex(page, 'theme-color-light-primary', 'red');
  await expect(page.getByText('Enter a six-digit hex colour, like #1d4ed8.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save theme', exact: true })).toBeDisabled();
  const current = await request.get('/api/v1/admin/theme');
  expect(current.status()).toBe(200);
  const values = (await current.json()).values;
  values.colors.dark.primary = 'red';
  const colour = await request.put('/api/v1/admin/theme', { data: { values } });
  expect(colour.status(), await colour.text()).toBe(400);
  expect(colour.headers()['content-type']).toContain('application/problem+json');
  expect(await colour.json()).toMatchObject({
    type: '/problems/validation',
    errors: [expect.objectContaining({ pointer: '/values/colors/dark/primary' })],
  });
  const mismatch = await request.put('/api/v1/admin/theme', {
    data: {
      values: (await (await request.get('/api/v1/admin/theme')).json()).values,
      logo: { contentType: 'image/webp', data: PNG.toString('base64') },
    },
  });
  expect(mismatch.status(), await mismatch.text()).toBe(400);
  expect((await mismatch.json()).errors[0].pointer).toBe('/logo/data');
  const invalid = await request.post('/api/v1/admin/theme/import', {
    headers: { 'content-type': 'application/json' },
    data: Buffer.from('{'),
  });
  expect(invalid.status(), await invalid.text()).toBe(400);
  expect(invalid.headers()['content-type']).toContain('application/problem+json');
  expect((await invalid.json()).detail).toBe('The file is not valid JSON');
  expect(await themeEtag(request)).toBe(before);
  const saved = await request.get('/api/v1/admin/theme');
  const valuesAgain = (await saved.json()).values;
  valuesAgain.colors.light.border = '#aabbcc';
  const duplicate = await request.put('/api/v1/admin/theme', { data: { values: valuesAgain } });
  expect(duplicate.status(), await duplicate.text()).toBe(200);
  const repeated = await request.put('/api/v1/admin/theme', {
    data: { values: (await duplicate.json()).values },
  });
  expect(repeated.status(), await repeated.text()).toBe(200);
  expect((await repeated.json()).etag).toBe((await duplicate.json()).etag);
});

test('013 AC 8: a contrast warning is shown and save is still allowed', async ({ page }) => {
  const request = page.context().request;
  await signIn(request);
  await openTheme(page);
  await setHex(page, 'theme-color-light-foreground', '#eeeeee');
  const warning = page.locator('#theme-warning-light-foreground-background');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('Low contrast');
  await expect(warning).toContainText('between Text and Background');
  await expect(warning).toContainText('at least 4.5:1');
  await saveTheme(page);
  const saved = await request.get('/api/v1/admin/theme');
  expect((await saved.json()).values.colors.light.foreground).toBe('#eeeeee');
});

test('013 AC 9: visitors get 401 and developers get 403, and the theme page is not shown', async ({
  page,
  request,
  playwright,
  baseURL,
}) => {
  await signIn(request);
  const before = await themeEtag(request);
  await request.post('/api/auth/sign-out');
  await page.goto('/admin/theme');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fadmin%2Ftheme$/);
  await expect(page.getByRole('button', { name: 'Save theme', exact: true })).toHaveCount(0);
  const visitor = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL ?? origin },
  });
  const developer = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL ?? origin },
  });
  try {
    for (const [method, path] of [
      ['GET', '/api/v1/admin/theme'],
      ['PUT', '/api/v1/admin/theme'],
      ['DELETE', '/api/v1/admin/theme'],
      ['POST', '/api/v1/admin/theme/import'],
    ] as const) {
      const anonymous = await visitor.fetch(path, { method });
      expect(anonymous.status(), `${method} ${path}`).toBe(401);
      expect(anonymous.headers()['content-type']).toContain('application/problem+json');
      expect((await anonymous.json()).type).toBe('/problems/unauthenticated');
    }
    const email = `theme-dev-${crypto.randomUUID()}@example.com`;
    expect(
      (
        await developer.post('/api/auth/sign-up/email', {
          data: { name: 'Theme Developer', email, password: 'QA-password-123' },
        })
      ).status(),
    ).toBe(200);
    for (const [method, path] of [
      ['PUT', '/api/v1/admin/theme'],
      ['POST', '/api/v1/admin/theme/import'],
      ['DELETE', '/api/v1/admin/theme'],
    ] as const) {
      const refused = await developer.fetch(path, { method });
      expect(refused.status(), `${method} ${path}`).toBe(403);
      expect((await refused.json()).type).toBe('/problems/forbidden');
    }
    const context = await page.context().browser()!.newContext({
      extraHTTPHeaders: { origin },
      storageState: await developer.storageState(),
    });
    try {
      const developerPage = await context.newPage();
      const response = await developerPage.goto('/admin/theme');
      expect(response?.status()).toBe(404);
      await expect(developerPage.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible();
      await expect(developerPage.getByRole('button', { name: 'Save theme', exact: true })).toHaveCount(0);
    } finally {
      await context.close();
    }
  } finally {
    await visitor.dispose();
    await developer.dispose();
  }
  expect(await themeEtag(request)).toBe(before);
});

test('013 AC 10: with no saved theme the portal serves the shipped default', async ({ page, request }) => {
  const theme = await request.get('/api/v1/theme');
  expect(theme.status()).toBe(200);
  expect(theme.headers()['cache-control']).toBe('no-store');
  expect(await theme.json()).toMatchObject({
    isDefault: true,
    font: 'system',
    defaultMode: 'system',
    logoUrl: null,
    faviconUrl: null,
    customCssUrl: null,
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'APIs', exact: true, level: 1 })).toBeVisible();
  await expect(page.locator('a[href="/apis/sample"]')).toBeVisible();
  await expect(page.locator('header a.brand')).toHaveText('Developer Portal');
  await expect(page.locator('img.brand-logo')).toHaveCount(0);
  await expect.poll(() => cssVar(page.locator('html'), '--primary')).toBe('#1d4ed8');
  await expect(page.locator('link[href*="/v1/theme.css"]')).toHaveCount(1);
  await expect(page.locator('link[href*="custom.css"]')).toHaveCount(0);
});

test('013 failure path: an ended session is named and does not save', async ({ page, playwright, baseURL }) => {
  const request = page.context().request;
  await signIn(request);
  const before = await themeEtag(request);
  await openTheme(page);
  await setHex(page, 'theme-color-light-primary', '#abcabc');
  const ended = await request.post('/api/auth/sign-out');
  expect(ended.status()).toBe(200);
  await page.getByRole('button', { name: 'Save theme', exact: true }).click();
  await expect(page.getByText('Your session ended. Sign in again in a new tab, then select Save theme.')).toBeVisible();
  const check = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL ?? origin },
  });
  try {
    const theme = await check.get('/api/v1/theme');
    expect((await theme.json()).etag).toBe(before);
    expect((await theme.json()).isDefault).toBe(true);
  } finally {
    await check.dispose();
  }
});
