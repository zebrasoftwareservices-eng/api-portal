// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';

// Same anchor as apps/portal/lib/operation-anchor.ts. The sidebar id ends with it.
function anchorPart(value: string) {
  return Array.from(value, (character) =>
    character.codePointAt(0)!.toString(16),
  ).join('-');
}
function operationSlug(method: string, path: string) {
  return `${method.toLowerCase()}-${anchorPart(path)}`;
}

const sampleOrder = [
  ['get', '/get'],
  ['post', '/post'],
  ['get', '/status/{code}'],
  ['get', '/uuid'],
  ['get', '/headers'],
] as const;

test('022 AC8: quickstart sample sidebar keeps authored path order', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/apis/sample');
  const sidebar = page.getByRole('navigation', {
    name: 'Sidebar for Sample HTTP API',
    exact: true,
  });
  await expect(sidebar).toBeVisible();
  await expect(
    sidebar.getByRole('button', { name: /Inspect a GET request/ }),
  ).toBeVisible();
  const ids = await sidebar
    .locator('[data-sidebar-id]')
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-sidebar-id') ?? ''),
    );
  const expected = sampleOrder.map(([method, path]) =>
    operationSlug(method, path),
  );
  const operations = ids.filter((id) =>
    expected.some((slug) => id.endsWith(`/${slug}`) || id.endsWith(slug)),
  );
  expect(
    operations.map((id) => expected.find((slug) => id.endsWith(slug))),
  ).toEqual(expected);
});
