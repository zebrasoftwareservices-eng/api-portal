// SPDX-License-Identifier: Apache-2.0
import { expect, test, type Page } from '@playwright/test';
async function referenceReady(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/apis/sample');
  await expect(
    page.getByRole('heading', { name: 'Generate a UUID', exact: true }),
  ).toBeVisible();
}
for (const width of [390, 1280]) {
  test(`JSO-162 catalog card spacing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const card = page.locator('a.api-card[href="/apis/sample"]');
    await expect(card).toBeVisible();
    const layout = await card.evaluate((element) => {
      const url = element.querySelector('.catalog-card-links .mono')!;
      const action = element.querySelector('.catalog-card-links span')!;
      const a = url.getBoundingClientRect(),
        b = action.getBoundingClientRect();
      return {
        separate: url !== action,
        overlap:
          a.left < b.right &&
          a.right > b.left &&
          a.top < b.bottom &&
          a.bottom > b.top,
        text: element.textContent,
      };
    });
    expect(layout.separate).toBe(true);
    expect(layout.overlap).toBe(false);
    expect(layout.text).toMatch(/\sView reference →/);
  });
}

test('JSO-222 JSO-183 catalog tab title includes portal', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('APIs · Developer Portal');
});

test('JSO-224 reference has one visible H1 and one title', async ({ page }) => {
  await referenceReady(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'Sample HTTP API', exact: true }),
  ).toHaveCount(1);
});

test('JSO-173 version and Copy centres align with their text', async ({
  page,
}) => {
  await referenceReady(page);
  const changelog = await page
    .getByRole('link', { name: 'Changelog', exact: true })
    .boundingBox();
  const badge = await page.locator('main .badge').first().boundingBox();
  expect
    .soft(badge!.y + badge!.height / 2)
    .toBeGreaterThanOrEqual(changelog!.y);
  expect
    .soft(badge!.y + badge!.height / 2)
    .toBeLessThanOrEqual(changelog!.y + changelog!.height);
  const copy = page.getByRole('button', { name: 'Copy base url', exact: true });
  if (await copy.count()) {
    const button = await copy.boundingBox();
    const url = await page.locator('main code').first().boundingBox();
    expect(button!.y + button!.height / 2).toBeGreaterThanOrEqual(url!.y);
    expect(button!.y + button!.height / 2).toBeLessThanOrEqual(
      url!.y + url!.height,
    );
  }
});

test('JSO-172 JSO-188 reference never shows developer toolbar', async ({
  page,
}) => {
  await referenceReady(page);
  for (const text of ['Developer Tools', 'Configure', 'Share', 'Deploy'])
    await expect(
      page.getByText(text, { exact: true }).filter({ visible: true }),
    ).toHaveCount(0);
});

test('JSO-174 live reference starts with an empty authentication value', async ({
  page,
}) => {
  await referenceReady(page);
  test.skip(
    (await page.getByRole('region', { name: 'Demo notice' }).count()) > 0,
    'Demo intentionally removes authentication.',
  );
  await expect(
    page.getByRole('textbox', { name: 'Value', exact: true }),
  ).toHaveValue('');
});

test.skip('JSO-225 sidebar operations follow authored path order', async ({
  page,
}) => {
  await referenceReady(page);
  const sidebar = page.getByRole('navigation', {
    name: 'Sidebar for Sample HTTP API',
    exact: true,
  });
  // Scalar labels operations with their summaries rather than their paths.
  // These correspond to /get, /post, /status/{code}, /uuid and /headers in the seed.
  await expect(sidebar.locator('li button')).toHaveText([
    /Introduction/,
    /Inspect a GET request/,
    /Inspect a POST request/,
    /Return an HTTP status/,
    /Generate a UUID/,
    /Inspect request headers/,
  ]);
});

test('JSO-188 browser fetches the live document once per page load', async ({
  page,
}) => {
  const documents: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v1/apis/sample/openapi.json')
      documents.push(request.url());
  });
  await referenceReady(page);
  const demo = await page.getByRole('region', { name: 'Demo notice' }).count();
  expect(documents).toHaveLength(demo ? 0 : 1);
});

test('JSO-226 demo hides Scalar server and authentication cards by visible text', async ({
  page,
}) => {
  await referenceReady(page);
  test.skip(
    (await page.getByRole('region', { name: 'Demo notice' }).count()) === 0,
    'Demo-only cards.',
  );
  for (const text of ['Servers', 'Authentication'])
    await expect(
      page
        .locator('.scalar-api-reference')
        .getByText(text, { exact: true })
        .filter({ visible: true }),
    ).toHaveCount(0);
});

test('JSO-223 JSO-228 unknown API returns HTTP 404 and default title', async ({
  page,
}) => {
  const response = await page.goto('/apis/nope');
  expect.soft(response!.status()).toBe(404);
  await expect(page).toHaveTitle('Developer Portal');
});
