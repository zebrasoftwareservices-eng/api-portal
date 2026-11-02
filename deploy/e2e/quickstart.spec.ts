// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';

test('quickstart serves the seeded catalog and same-origin API', async ({
  page,
  request,
}) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole('heading', { name: 'APIs', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Sample HTTP API/ }),
  ).toBeVisible();
  const catalog = await request.get('/api/v1/apis');
  expect(catalog.status()).toBe(200);
  expect((await catalog.json()).items).toEqual(
    expect.arrayContaining([expect.objectContaining({ slug: 'sample' })]),
  );
});
