// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';

test('AC 9: live quickstart has no demo notice and keeps account navigation', async ({
  page,
}) => {
  for (const path of ['/', '/apis/sample', '/sign-in', '/sign-up']) {
    await page.goto(path);
    await expect(page.getByRole('region', { name: 'Demo notice' })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('link', { name: 'Run the quickstart' }),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('link', { name: 'Sign in', exact: true }),
    ).toBeVisible();
  }
});

test('JSO-216: quickstart guidance is a real HTTP 404 outside demo mode', async ({
  page,
  request,
}) => {
  expect((await request.get('/quickstart-required')).status()).toBe(404);
  const response = await page.goto('/quickstart-required');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Demo notice' })).toHaveCount(
    0,
  );
});
