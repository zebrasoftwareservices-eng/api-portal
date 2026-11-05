// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';

test('Node.js POST samples survive selection and a returning visit without errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/apis/sample');
  await page.getByRole('tab', { name: 'Node.js', exact: true }).first().click();
  const post = page.getByRole('group', {
    name: 'Request Example for post/post',
    exact: true,
  });
  await expect(post).toContainText("import { request } from 'undici'");
  await expect(post).toContainText('JSON.stringify({})');
  await expect(
    page.getByText(/Error generating (?:code )?snippet/),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem('scalar-reference-selected-client-v2'),
      ),
    )
    .toBe('node/undici');
  await page.reload();
  await expect(post).toContainText("import { request } from 'undici'");
  await expect(post).toContainText('JSON.stringify({})');
  await expect(
    page.getByText(/Error generating (?:code )?snippet/),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
