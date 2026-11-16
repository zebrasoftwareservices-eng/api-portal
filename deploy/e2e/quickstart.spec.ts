// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';

test('quickstart serves the seeded catalog and same-origin API', async ({
  page,
  request,
}) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole('heading', { name: 'APIs', exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.locator('a[href="/apis/sample"]')).toBeVisible();
  const catalog = await request.get('/api/v1/apis');
  expect(catalog.status()).toBe(200);
  expect((await catalog.json()).items).toEqual(
    expect.arrayContaining([expect.objectContaining({ slug: 'sample' })]),
  );
});
