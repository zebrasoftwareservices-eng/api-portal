// SPDX-License-Identifier: Apache-2.0
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
} from '@playwright/test';
import { execFileSync } from 'node:child_process';
const origin = process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:3000';
const kong = process.env.KONG_ADMIN_URL ?? 'http://localhost:8001';
const proxy = process.env.KONG_PROXY_PUBLIC_URL ?? 'http://localhost:8000';
const mailpit = process.env.MAILPIT_URL ?? 'http://localhost:8025';
test.use({ extraHTTPHeaders: { origin } });
const compose = (...args: string[]) =>
  execFileSync('node', ['scripts/worktree-compose.mjs', ...args], {
    timeout: 120000,
    stdio: 'pipe',
  });
async function json(
  response: Pick<APIResponse, 'status' | 'text' | 'json'>,
  status = 200,
) {
  expect(response.status(), await response.text()).toBe(status);
  return response.json();
}
async function login(request: APIRequestContext) {
  await json(
    await request.post('/api/auth/sign-in/email', {
      data: { email: 'admin@example.com', password: 'change-me-now' },
    }),
  );
}

test('010 AC1–13: approval, outage, unchanged plan key, Manual assignment and revoke retry against real Kong', async ({
  page,
  context,
  playwright,
  browser,
}) => {
  test.setTimeout(240000);
  const operatorContext = await browser.newContext({
    baseURL: origin,
    extraHTTPHeaders: { origin },
  });
  const operator = operatorContext.request;
  const adminPage = await operatorContext.newPage();
  await login(operator);
  const slug = `access-${crypto.randomUUID()}`;
  const service = crypto.randomUUID();
  const email = `${slug}@example.com`;
  const messages = async (subject: string) => {
    const inbox = await json(await operator.get(`${mailpit}/api/v1/messages`));
    return inbox.messages.filter(
      (m: { Subject: string; To: { Address: string }[] }) =>
        m.Subject.startsWith(subject) &&
        m.To.some((to) => to.Address === email),
    );
  };
  const emailContains = async (
    subject: string,
    content: string,
    count: number,
  ) => {
    await expect
      .poll(async () => (await messages(subject)).length, { timeout: 30000 })
      .toBe(count);
    const items = await messages(subject);
    const bodies = await Promise.all(
      items.map((m: { ID: string }) => jsonMessage(m.ID)),
    );
    expect(bodies.some((body) => body.Text.includes(content))).toBe(true);
  };
  const jsonMessage = async (id: string) =>
    json(await operator.get(`${mailpit}/api/v1/message/${id}`));
  await json(
    await operator.put(`${kong}/services/${service}`, {
      data: { name: slug, url: 'http://httpbin:8080' },
    }),
  );
  await json(
    await operator.post(`${kong}/services/${service}/routes`, {
      data: { paths: [`/${slug}`] },
    }),
    201,
  );
  await json(
    await operator.post(`${kong}/services/${service}/plugins`, {
      data: { name: 'key-auth', config: { key_names: ['apikey'] } },
    }),
    201,
  );
  const api = await json(
    await operator.post('/api/v1/admin/apis', {
      data: {
        slug,
        gatewayServiceId: service,
        spec: {
          content: JSON.stringify({
            openapi: '3.1.0',
            info: { title: slug, version: '1.0.0' },
            paths: {
              '/get': { get: { responses: { '200': { description: 'OK' } } } },
            },
          }),
        },
      },
    }),
    201,
  );
  const product = await json(
    await operator.post('/api/v1/admin/products', {
      data: { name: slug, slug, description: 'Access QA', apiIds: [api.id] },
    }),
    201,
  );
  const plan = async (
    name: string,
    requiresApproval: boolean,
    rateLimit: number,
  ) =>
    json(
      await operator.post(`/api/v1/admin/products/${product.id}/plans`, {
        data: {
          name,
          apiIds: [api.id],
          requiresApproval,
          rateLimit,
          rateLimitUnit: 'minute',
          monthlyQuota: 10000,
        },
      }),
      201,
    );
  const basic = await plan('Basic', false, 100);
  const partner = await plan('Partner', true, 200);
  await json(
    await context.request.post('/api/auth/sign-up/email', {
      data: {
        name: 'Access QA',
        email,
        password: 'QA-access-password-123',
      },
    }),
  );
  const teamId = (await json(await context.request.get('/api/v1/teams')))
    .items[0].id;
  const consumersBefore = (await json(await operator.get(`${kong}/consumers`)))
    .data;
  await page.goto(`/products/${slug}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    )
    .toBe(0);
  const cards = page.locator('.plan-cards > *');
  const bounds = await cards.evaluateAll((elements) =>
    elements.map((el) => {
      const { x, y, width, height } = el.getBoundingClientRect();
      return { x, y, width, height };
    }),
  );
  expect(bounds.length).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < bounds.length; i++) {
    expect(bounds[i]!.y).toBeGreaterThanOrEqual(
      bounds[i - 1]!.y + bounds[i - 1]!.height,
    );
    expect(bounds[i]!.width).toBeCloseTo(bounds[0]!.width, 0);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .getByRole('button', { name: 'Request access', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Subscription name', { exact: true })
    .fill('Partner access');
  await dialog.getByRole('button', { name: 'Send request' }).click();
  await expect(dialog.getByRole('alert')).toContainText(/reason|why/i);
  await dialog
    .getByLabel('Why does your team need this plan?')
    .fill('Production integration');
  const sent = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/v1/access-requests') &&
      r.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Send request' }).click();
  const pending = await json(await sent, 201);
  expect(pending.status).toBe('pending');
  const queue = await json(await operator.get('/api/v1/admin/access-requests'));
  expect(queue.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: pending.id,
        reason: 'Production integration',
      }),
    ]),
  );
  const duplicate = await context.request.post('/api/v1/access-requests', {
    data: { teamId, planId: partner.id, name: 'Duplicate', reason: 'Please' },
  });
  await json(duplicate, 409);
  expect((await json(await operator.get(`${kong}/consumers`))).data).toEqual(
    consumersBefore,
  );
  compose('stop', 'kong');
  try {
    const failed = await operator.post(
      `/api/v1/admin/access-requests/${pending.id}/approve`,
      { data: {} },
    );
    expect(failed.status(), await failed.text()).toBe(503);
    expect(failed.headers()['content-type']).toContain(
      'application/problem+json',
    );
    expect(
      (await json(await operator.get('/api/v1/admin/access-requests'))).items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: pending.id, status: 'pending' }),
      ]),
    );
    expect(await messages('Access approved')).toHaveLength(0);
  } finally {
    compose('start', '--wait', 'kong');
  }
  await adminPage.goto('/admin/requests');
  const approveButton = adminPage
    .locator('article')
    .filter({ hasText: slug })
    .getByRole('button', { name: 'Approve…' });
  await approveButton.click();
  await adminPage.keyboard.press('Escape');
  await expect(adminPage.getByRole('dialog')).toHaveCount(0);
  await expect(approveButton).toBeFocused();
  await approveButton.click();
  await adminPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(approveButton).toBeFocused();
  await approveButton.click();
  await adminPage
    .getByLabel('Note to the requester (included in the email)')
    .fill('Welcome partner');
  const approval = adminPage.waitForResponse((r) =>
    r.url().endsWith(`/access-requests/${pending.id}/approve`),
  );
  await adminPage
    .getByRole('button', { name: 'Approve request', exact: true })
    .click();
  const approved = await json(await approval);
  await emailContains('Access approved', 'Welcome partner', 1);
  const approvedApp = await json(
    await context.request.get(`/api/v1/apps/${approved.app.id}`),
  );
  expect(approvedApp.keyIssued).toBe(false);
  expect(approvedApp.credentials).toEqual([]);
  expect(JSON.stringify(approved)).not.toContain('"key":');
  await page.goto(`/dashboard/apps/${approved.app.id}`);
  await page.getByRole('button', { name: 'Reveal key', exact: true }).click();
  const reveal = page.getByRole('alertdialog');
  const key = await reveal.getByLabel('API key', { exact: true }).inputValue();
  expect(key.length).toBeGreaterThan(10);
  await reveal.getByRole('button', { name: "I've saved it" }).click();
  const call = (value = key) =>
    context.request.get(`${proxy}/${slug}/get`, { headers: { apikey: value } });
  await expect.poll(async () => (await call()).status()).toBe(200);
  await page.reload();
  expect(await page.content()).not.toContain(key);
  expect(
    (await json(await context.request.get(`/api/v1/apps/${approved.app.id}`)))
      .keyIssued,
  ).toBe(true);
  await json(
    await context.request.put(`/api/v1/apps/${approved.app.id}/plan`, {
      data: { planId: basic.id },
    }),
  );
  const change = await json(
    await context.request.put(`/api/v1/apps/${approved.app.id}/plan`, {
      data: { planId: partner.id, reason: 'More capacity' },
    }),
    202,
  );
  await json(
    await context.request.put(`/api/v1/apps/${approved.app.id}/plan`, {
      data: { planId: partner.id, reason: 'Duplicate' },
    }),
    409,
  );
  expect(
    (await json(await context.request.get(`/api/v1/apps/${approved.app.id}`)))
      .plan.id,
  ).toBe(basic.id);
  expect((await call()).status()).toBe(200);
  await json(
    await operator.post(`/api/v1/admin/access-requests/${change.id}/reject`, {
      data: { note: '  ' },
    }),
    400,
  );
  await json(
    await operator.post(`/api/v1/admin/access-requests/${change.id}/reject`, {
      data: { note: 'Try again' },
    }),
  );
  expect((await call()).status()).toBe(200);
  const again = await json(
    await context.request.put(`/api/v1/apps/${approved.app.id}/plan`, {
      data: { planId: partner.id, reason: 'Retry' },
    }),
    202,
  );
  await json(
    await operator.post(`/api/v1/admin/access-requests/${again.id}/approve`, {
      data: {},
    }),
  );
  expect(
    (await json(await context.request.get(`/api/v1/apps/${approved.app.id}`)))
      .plan.id,
  ).toBe(partner.id);
  expect((await call()).status()).toBe(200);
  const plugins = await json(
    await operator.get(
      `${kong}/consumers/portal-app-${approved.app.id}/plugins`,
    ),
  );
  expect(plugins.data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'rate-limiting',
        config: expect.objectContaining({ minute: 200 }),
      }),
    ]),
  );
  await emailContains('Access request rejected', 'Try again', 1);
  const access = `/api/v1/admin/products/${product.id}/access`;
  await json(
    await operator.put(access, { data: { visibility: 'hidden' } }),
    409,
  );
  await json(
    await operator.put(access, {
      data: { visibility: 'hidden', existingSubscriptions: 'keep' },
    }),
  );
  expect((await call()).status()).toBe(200);
  const anonymous = await playwright.request.newContext({ baseURL: origin });
  await json(
    await operator.put(access, {
      data: {
        visibility: 'internal',
        teamIds: [],
        existingSubscriptions: 'keep',
      },
    }),
    400,
  );
  for (const visibility of ['hidden', 'internal', 'manual', 'hidden']) {
    await json(
      await operator.put(access, {
        data: {
          visibility,
          ...(visibility === 'internal' ? { teamIds: [teamId] } : {}),
          existingSubscriptions: 'keep',
        },
      }),
    );
    for (const path of [
      `/products/${slug}`,
      `/apis/${slug}`,
      `/apis/${slug}/changelog`,
    ]) {
      const response = await anonymous.get(path);
      expect.soft(response.status(), `${visibility}: ${path}`).toBe(404);
      expect.soft(await response.text()).toContain('Page not found');
    }
  }
  for (const path of [
    `/products/unknown-${slug}`,
    `/apis/unknown-${slug}`,
    `/apis/unknown-${slug}/changelog`,
  ]) {
    expect.soft((await anonymous.get(path)).status(), path).toBe(404);
  }
  for (const path of [
    `/products/${slug}`,
    `/apis/${slug}`,
    `/apis/${slug}/changelog`,
  ]) {
    expect(
      (await context.request.get(path)).status(),
      `signed-in Hidden: ${path}`,
    ).toBe(200);
  }
  await expect
    .poll(() => Date.now() % 60000 < 30000, { timeout: 31000 })
    .toBe(true);
  const statuses: number[] = [];
  for (let i = 0; i < 201; i++) statuses.push((await call()).status());
  expect(statuses).toContain(200);
  expect(statuses).toContain(429);
  compose('stop', 'kong');
  try {
    const restricted = await json(
      await operator.put(access, {
        data: { visibility: 'manual', existingSubscriptions: 'revoke' },
      }),
    );
    expect(restricted.revocation.pending).toBe(1);
    expect(await messages('Subscription revoked')).toHaveLength(0);
    expect(
      (await json(await context.request.get(`/api/v1/apps/${approved.app.id}`)))
        .status,
    ).toBe('revoke-pending');
  } finally {
    compose('start', '--wait', 'kong');
  }
  // Replay the setting while the persisted revocation job retries independently.
  await json(
    await operator.put(access, {
      data: { visibility: 'manual', existingSubscriptions: 'revoke' },
    }),
  );
  await expect
    .poll(async () => (await call()).status(), { timeout: 30000 })
    .toBe(401);
  await expect
    .poll(
      async () =>
        (
          await json(
            await context.request.get(`/api/v1/apps/${approved.app.id}`),
          )
        ).status,
      { timeout: 30000 },
    )
    .toBe('revoked');
  await emailContains('Subscription revoked', 'Partner access', 1);
  const assigned = await json(
    await operator.post('/api/v1/admin/subscriptions', {
      data: { teamId, planId: basic.id, name: 'Assigned' },
    }),
    201,
  );
  await emailContains('Subscription assigned', 'Assigned', 1);
  expect(assigned.keyIssued).toBe(false);
  expect(JSON.stringify(assigned)).not.toContain('"key":');
  expect((await context.request.get(`/products/${slug}`)).status()).toBe(200);
  expect.soft((await anonymous.get(`/products/${slug}`)).status()).toBe(404);
  const assignedKey = await json(
    await context.request.post(`/api/v1/apps/${assigned.id}/credentials`),
    201,
  );
  expect((await call(assignedKey.key)).status()).toBe(200);
  // A second team is named while the assigned team is excluded by Manual → Internal.
  const adminTeam = (await json(await operator.get('/api/v1/teams'))).items[0];
  await adminPage.goto(`/admin/products/${slug}`);
  await adminPage.getByRole('radio', { name: 'Internal', exact: true }).check();
  await adminPage.getByRole('combobox').fill('admin@example.com');
  await adminPage.getByRole('option', { name: /admin@example.com/ }).click();
  await adminPage
    .getByRole('button', { name: 'Save access', exact: true })
    .click();
  const confirmation = adminPage.getByRole('alertdialog');
  await expect(confirmation.getByRole('heading')).toHaveText(
    '1 team has an active subscription',
  );
  await expect(
    confirmation.getByRole('radio', { name: /Keep them working/ }),
  ).toBeChecked();
  await confirmation
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  expect((await json(await operator.get(access))).visibility).toBe('manual');
  expect((await call(assignedKey.key)).status()).toBe(200);
  // Open assignment while still Manual, then let another admin change the setting.
  await adminPage.reload();
  await adminPage
    .getByRole('button', { name: 'Assign to a team', exact: true })
    .click();
  const assignment = adminPage.getByRole('dialog');
  await assignment.getByRole('combobox').fill(email);
  await assignment
    .getByRole('option', {
      name: new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    })
    .click();
  await assignment
    .getByLabel('Subscription name', { exact: true })
    .fill('Excluded assignment');
  await json(
    await operator.put(access, {
      data: {
        visibility: 'internal',
        teamIds: [adminTeam.id],
        existingSubscriptions: 'keep',
      },
    }),
  );
  expect((await call(assignedKey.key)).status()).toBe(200);
  const conflictResponse = adminPage.waitForResponse(
    (r) =>
      r.url().endsWith('/api/v1/admin/subscriptions') &&
      r.request().method() === 'POST',
  );
  await assignment
    .getByRole('button', { name: 'Create subscription', exact: true })
    .click();
  expect(await json(await conflictResponse, 409)).toMatchObject({
    type: '/problems/team-not-named',
  });
  await expect(assignment.getByRole('alert')).toContainText(
    'Add the team to this product first',
  );
  await expect(
    assignment.getByLabel('Subscription name', { exact: true }),
  ).toHaveValue('Excluded assignment');
  await assignment.getByRole('button', { name: 'Cancel', exact: true }).click();
  // AC12–13: include origin:admin in confirmation, Keep, outage and retry.
  await json(await operator.put(access, { data: { visibility: 'open' } }));
  const assignedConfirmation = await json(
    await operator.put(access, { data: { visibility: 'hidden' } }),
    409,
  );
  expect(assignedConfirmation).toMatchObject({
    affectedTeams: 1,
    affectedSubscriptions: 1,
  });
  await json(
    await operator.put(access, {
      data: { visibility: 'hidden', existingSubscriptions: 'keep' },
    }),
  );
  expect((await call(assignedKey.key)).status()).toBe(200);
  compose('stop', 'kong');
  try {
    const restricted = await json(
      await operator.put(access, {
        data: { visibility: 'manual', existingSubscriptions: 'revoke' },
      }),
    );
    expect(restricted.revocation).toEqual({ revoked: 0, pending: 1 });
    expect(
      (await json(await context.request.get(`/api/v1/apps/${assigned.id}`)))
        .status,
    ).toBe('revoke-pending');
    expect(await messages('Subscription revoked')).toHaveLength(1);
  } finally {
    compose('start', '--wait', 'kong');
  }
  await expect
    .poll(async () => (await call(assignedKey.key)).status(), {
      timeout: 30000,
    })
    .toBe(401);
  await emailContains('Subscription revoked', 'Assigned', 2);
  await json(
    await operator.put(access, {
      data: { visibility: 'manual', existingSubscriptions: 'revoke' },
    }),
  );
  expect(
    (await json(await context.request.get(`/api/v1/apps/${assigned.id}`)))
      .status,
  ).toBe('revoked');
  expect((await call(assignedKey.key)).status()).toBe(401);
  expect(await messages('Subscription revoked')).toHaveLength(2);
  await anonymous.dispose();
  await operatorContext.close();
});
