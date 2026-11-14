// SPDX-License-Identifier: Apache-2.0
import { expect, test, type APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const mailpit = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const kong = process.env.KONG_ADMIN_URL ?? 'http://localhost:8001';
const proxy = process.env.KONG_PROXY_PUBLIC_URL ?? 'http://localhost:8000';
const password = 'QA-security-password-123';
test.use({
  extraHTTPHeaders: {
    origin: process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:3000',
  },
});
const compose = (...args: string[]) =>
  execFileSync(
    'docker',
    [
      'compose',
      ...(process.env.QA_COMPOSE_PROJECT
        ? ['-p', process.env.QA_COMPOSE_PROJECT]
        : []),
      '-f',
      'deploy/docker-compose.yml',
      ...(process.env.QA_COMPOSE_OVERRIDE
        ? ['-f', process.env.QA_COMPOSE_OVERRIDE]
        : []),
      ...args,
    ],
    { encoding: 'utf8' },
  );

test('007 review blockers: noncanonical sign-ins share limits and parallel sign-ins finish', async ({
  request,
}) => {
  // Two sequential batches each allow 20 s, plus the path-limit setup.
  test.setTimeout(90_000);
  const email = `review-path-${randomUUID()}@example.com`;
  const data = { email, password: 'incorrect-password' };
  const paths = [
    '/api/auth/sign-in/email',
    '/api/auth/sign-in//email',
    '/api/auth//sign-in/email',
    '/api/auth/sign-in/email/',
  ];
  for (let index = 0; index < 10; index++) {
    const failed = await request.post(paths[index % paths.length]!, { data });
    expect(failed.status()).toBe(401);
  }
  for (const path of paths) {
    const blocked = await request.post(path, { data });
    expect(blocked.status()).toBe(429);
    expect(blocked.headers()['content-type']).toContain(
      'application/problem+json',
    );
    expect(Number(blocked.headers()['retry-after'])).toBeGreaterThan(0);
  }
  for (const shared of [true, false]) {
    const batch = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        request.post('/api/auth/sign-in/email', {
          data: {
            email: `review-pool-${batch}-${shared ? 0 : index}@example.com`,
            password: 'incorrect-password',
          },
          timeout: 20000,
        }),
      ),
    );
    expect(responses.filter((r) => r.status() === 401)).toHaveLength(
      shared ? 10 : 12,
    );
    expect(responses.filter((r) => r.status() === 429)).toHaveLength(
      shared ? 2 : 0,
    );
    expect(
      (await request.get('/api/v1/health', { timeout: 5000 })).status(),
    ).toBe(200);
  }
});

test('007 U1: removing saved SMTP settings clears the saved-source test result', async ({
  page,
  context,
}) => {
  expect(
    (
      await signin(context.request, 'admin@example.com', 'change-me-now')
    ).status(),
  ).toBe(200);
  const saved = {
    host: 'mailpit',
    port: 1025,
    security: 'none',
    username: '',
    senderName: 'Security QA',
    senderAddress: 'qa@example.com',
  };
  try {
    expect(
      (
        await context.request.put('/api/v1/admin/settings/mail', {
          data: saved,
        })
      ).status(),
    ).toBe(200);
    await page.goto('/admin/settings/mail');
    await page
      .getByRole('button', { name: 'Send test email', exact: true })
      .click();
    await expect(
      page.getByText(/Test email sent .* using the saved settings/),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Remove saved settings', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Remove settings', exact: true })
      .click();
    await expect(
      page.getByText("ⓘ Portal email uses the server's environment settings", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(/Test email sent .* using the saved settings/),
    ).toHaveCount(0);
  } finally {
    await context.request.delete('/api/v1/admin/settings/mail');
  }
});

test('007 U2: a gateway refusal after a correct-password retry clears the prior password error', async ({
  page,
  context,
}) => {
  await signup(context.request, `stale-delete-${randomUUID()}@example.com`);
  await page.goto('/profile');
  await page
    .getByRole('button', { name: 'Delete account…', exact: true })
    .click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByLabel('Password', { exact: true }).fill('wrong-password');
  await dialog
    .getByRole('button', { name: 'Delete account', exact: true })
    .click();
  await expect(dialog.getByText(/This password is incorrect/)).toBeVisible();
  // Keep the real wrong-password path, then deterministically exercise the
  // gateway-error rendering without interrupting the shared Compose stack.
  await page.route('**/api/v1/me', (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({
          status: 503,
          contentType: 'application/problem+json',
          json: {
            type: '/problems/gateway-unavailable',
            title: 'Gateway unavailable',
            status: 503,
            detail: 'Your account was not deleted. Try again.',
          },
        })
      : route.continue(),
  );
  await dialog.getByLabel('Password', { exact: true }).fill(password);
  await dialog
    .getByRole('button', { name: 'Delete account', exact: true })
    .click();
  await expect(dialog.getByText(/Gateway unavailable/)).toBeVisible();
  await expect(dialog.getByText(/This password is incorrect/)).toHaveCount(0);
});

test('007 U3: saving corrected SMTP settings clears the previous test error', async ({
  page,
  context,
}) => {
  expect(
    (
      await signin(context.request, 'admin@example.com', 'change-me-now')
    ).status(),
  ).toBe(200);
  try {
    expect(
      (
        await context.request.put('/api/v1/admin/settings/mail', {
          data: {
            host: 'mailpit',
            port: 1,
            security: 'none',
            username: '',
            senderName: 'Security QA',
            senderAddress: 'qa@example.com',
          },
        })
      ).status(),
    ).toBe(200);
    await page.goto('/admin/settings/mail');
    await page
      .getByRole('button', { name: 'Send test email', exact: true })
      .click();
    await expect(page.getByText(/Can't reach the mail server/)).toBeVisible();
    await page.getByLabel('Port', { exact: true }).fill('1025');
    await page
      .getByRole('button', { name: 'Save mail settings', exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await (
              await context.request.get('/api/v1/admin/settings/mail')
            ).json()
          ).saved.port,
      )
      .toBe(1025);
    await expect(page.getByText(/Can't reach the mail server/)).toHaveCount(0);
  } finally {
    await context.request.delete('/api/v1/admin/settings/mail');
  }
});
async function signup(request: APIRequestContext, email: string) {
  const result = await request.post('/api/auth/sign-up/email', {
    data: { email, name: 'Security QA', password },
  });
  expect(result.status(), await result.text()).toBe(200);
  return (await result.json()).user;
}
async function message(
  request: APIRequestContext,
  email: string,
  subject?: string,
) {
  let id = '';
  await expect
    .poll(
      async () => {
        const result = await (
          await request.get(`${mailpit}/api/v1/messages`)
        ).json();
        const found = result.messages.find(
          (m: { ID: string; To: { Address: string }[]; Subject: string }) =>
            m.To.some((t) => t.Address === email) &&
            (!subject || m.Subject.toLowerCase().includes(subject)),
        );
        id = found?.ID ?? '';
        return !!id;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  return (await request.get(`${mailpit}/api/v1/message/${id}`)).json();
}
function link(mail: { Text: string }) {
  const url = mail.Text.match(/https?:\/\/[^\s<>]+/g)?.find((u) =>
    /token=|reset-password\//.test(u),
  );
  expect(url, mail.Text).toBeTruthy();
  return url!;
}
async function signin(
  request: APIRequestContext,
  email: string,
  secret = password,
) {
  return request.post('/api/auth/sign-in/email', {
    data: { email, password: secret },
  });
}

test('007 AC1/3: Mailpit verification gates real Kong writes and profile reflects verification', async ({
  page,
  context,
  playwright,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const admin = await playwright.request.newContext({ baseURL });
  expect(
    (await signin(admin, 'admin@example.com', 'change-me-now')).status(),
  ).toBe(200);
  const settings = await (
    await admin.get('/api/v1/admin/settings/accounts')
  ).json();
  expect(settings.requireVerifiedEmail).toBe(false);
  expect((await (await admin.get('/api/v1/me')).json()).emailVerified).toBe(
    true,
  );
  const email = `verify-${crypto.randomUUID()}@example.com`;
  await signup(context.request, email);
  const mail = await message(context.request, email);
  const sample = (
    await (await context.request.get('/api/v1/apis')).json()
  ).items.find((a: { slug: string }) => a.slug === 'sample');
  const body = { name: `Verified ${crypto.randomUUID()}`, apiIds: [sample.id] };
  try {
    expect(
      (
        await admin.put('/api/v1/admin/settings/accounts', {
          data: { requireVerifiedEmail: true, rateLimits: settings.rateLimits },
        })
      ).status(),
    ).toBe(200);
    const denied = await context.request.post('/api/v1/apps', { data: body });
    expect(denied.status()).toBe(403);
    expect(denied.headers()['content-type']).toContain(
      'application/problem+json',
    );
    expect((await denied.json()).type).toBe('/problems/email-not-verified');
    expect(
      (await (await context.request.get('/api/v1/apps')).json()).items,
    ).toHaveLength(0);
    await page.goto('/dashboard/apps/new?api=sample');
    await expect(
      page.getByRole('button', { name: 'Create app and get key' }),
    ).toHaveAttribute('aria-disabled', 'true');
    await page.goto(link(mail));
    await expect(
      page.getByText('Your email address is verified.', { exact: true }),
    ).toBeVisible();
    expect(
      (await context.request.post('/api/v1/apps', { data: body })).status(),
    ).toBe(201);
  } finally {
    await admin.put('/api/v1/admin/settings/accounts', {
      data: { requireVerifiedEmail: false, rateLimits: settings.rateLimits },
    });
    await admin.dispose();
  }
});

test('007 AC4/5/6/7: browser reset, single-use links, profile and password/session lifecycle', async ({
  page,
  context,
  playwright,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const email = `reset-${crypto.randomUUID()}@example.com`;
  await signup(context.request, email);
  const other = await playwright.request.newContext({ baseURL });
  expect((await signin(other, email)).status()).toBe(200);
  await context.clearCookies();
  await page.goto('/sign-in');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(
    page.getByRole('heading', { name: 'Check your email' }),
  ).toBeVisible();
  const resetLink = link(await message(context.request, email, 'reset'));
  await page.goto(resetLink);
  await page
    .getByLabel('New password', { exact: true })
    .fill('Reset-password-123');
  await page
    .getByRole('button', { name: 'Change password', exact: true })
    .click();
  await expect(page).toHaveURL(/sign-in/);
  expect((await other.get('/api/v1/me')).status()).toBe(401);
  expect((await signin(context.request, email)).status()).toBe(401);
  expect(
    (await signin(context.request, email, 'Reset-password-123')).status(),
  ).toBe(200);
  await page.goto(resetLink);
  await expect(
    page.getByRole('heading', { name: 'This link has expired' }),
  ).toBeVisible();
  await page.goto('/profile');
  await page.getByLabel('Name', { exact: true }).fill('Renamed Security QA');
  await page.getByRole('button', { name: 'Save name' }).click();
  await page.getByRole('button', { name: /^Account menu for/ }).click();
  await expect(page.getByRole('menu')).toContainText(email);
  await page.keyboard.press('Escape');
  await expect
    .poll(
      async () => (await (await context.request.get('/api/v1/me')).json()).name,
    )
    .toBe('Renamed Security QA');
  await page.getByLabel('Current password').fill('wrong-password');
  await page
    .getByLabel('New password', { exact: true })
    .fill('Changed-password-123');
  await page
    .getByRole('button', { name: 'Change password', exact: true })
    .click();
  await expect(page.getByText(/This password is incorrect/)).toBeVisible();
  expect((await signin(other, email, 'Reset-password-123')).status()).toBe(200);
  await page.getByLabel('Current password').fill('Reset-password-123');
  await page
    .getByRole('button', { name: 'Change password', exact: true })
    .click();
  await expect
    .poll(async () => (await other.get('/api/v1/me')).status())
    .toBe(401);
  expect((await signin(other, email, 'Reset-password-123')).status()).toBe(401);
  expect((await signin(other, email, 'Changed-password-123')).status()).toBe(
    200,
  );
  const newEmail = `changed-${crypto.randomUUID()}@example.com`;
  // A link delivered to the old mailbox must lose authority after email change.
  expect(
    (
      await context.request.post('/api/auth/request-password-reset', {
        data: { email, redirectTo: '/reset-password' },
      })
    ).status(),
  ).toBe(200);
  let oldMailboxReset = '';
  await expect
    .poll(
      async () => {
        oldMailboxReset = new URL(
          link(await message(context.request, email, 'reset')),
        ).pathname
          .split('/')
          .pop()!;
        return oldMailboxReset;
      },
      { timeout: 30_000 },
    )
    .not.toBe(new URL(resetLink).pathname.split('/').pop());
  // Opening a valid link redirects to the reset form without consuming it.
  const validReset = await context.request.get(
    `/api/auth/reset-password/${oldMailboxReset}?callbackURL=/reset-password`,
    { maxRedirects: 0 },
  );
  expect(validReset.status()).toBe(302);
  expect(validReset.headers().location).not.toContain('INVALID_TOKEN');
  await page.getByRole('button', { name: 'Change email', exact: true }).click();
  await page.getByLabel('New email').fill(newEmail);
  await page.getByRole('button', { name: 'Send confirmation link' }).click();
  const confirm = link(await message(context.request, newEmail));
  expect((await (await context.request.get('/api/v1/me')).json()).email).toBe(
    email,
  );
  expect((await signin(other, email, 'Changed-password-123')).status()).toBe(
    200,
  );
  await page.goto(confirm);
  await page.getByRole('button', { name: 'Confirm new email' }).click();
  await expect(
    page.getByRole('heading', { name: 'Email changed' }),
  ).toBeVisible();
  const invalidated = await context.request.post('/api/auth/reset-password', {
    data: { token: oldMailboxReset, newPassword: 'Must-not-change-123' },
  });
  expect(invalidated.status()).toBe(400);
  expect((await invalidated.json()).code).toBe('INVALID_TOKEN');
  expect((await signin(other, email, 'Changed-password-123')).status()).toBe(
    401,
  );
  expect((await signin(other, newEmail, 'Changed-password-123')).status()).toBe(
    200,
  );
  await other.dispose();
});

test('007 AC2/8: saved SMTP precedence, errors and live default email/sign-in limits', async ({
  page,
  context,
  playwright,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const admin = await playwright.request.newContext({ baseURL });
  expect(
    (await signin(admin, 'admin@example.com', 'change-me-now')).status(),
  ).toBe(200);
  const original = await (
    await admin.get('/api/v1/admin/settings/accounts')
  ).json();
  const email = `limits-${crypto.randomUUID()}@example.com`;
  await signup(context.request, email);
  const secret = 'SMTP-QA-secret-007';
  const saved = {
    host: 'mailpit',
    port: 1025,
    security: 'none',
    username: null,
    password: secret,
    senderName: 'Saved QA Sender',
    senderAddress: 'saved@example.com',
  };
  try {
    await page.goto('/admin/settings/mail');
    // A developer cannot access admin settings.
    expect(
      (await context.request.get('/api/v1/admin/settings/mail')).status(),
    ).toBe(403);
    const initial = await admin.get('/api/v1/admin/settings/mail');
    expect((await initial.json()).source).toBe('environment');
    const response = await admin.put('/api/v1/admin/settings/mail', {
      data: saved,
    });
    expect(response.status()).toBe(200);
    expect(await response.text()).not.toContain(secret);
    expect(
      (
        await admin.post('/api/v1/admin/settings/mail/test', {
          data: { to: email },
        })
      ).status(),
    ).toBe(200);
    const testMail = await message(admin, email, 'test');
    expect(testMail.From.Address).toBe('saved@example.com');
    for (let i = 0; i < 3; i++)
      expect(
        (
          await context.request.post('/api/auth/request-password-reset', {
            data: { email, redirectTo: '/reset-password' },
          })
        ).status(),
      ).toBe(200);
    const limited = await context.request.post(
      '/api/auth/request-password-reset',
      { data: { email } },
    );
    expect(limited.status()).toBe(429);
    expect(Number(limited.headers()['retry-after'])).toBeGreaterThan(0);
    expect(limited.headers()['content-type']).toContain(
      'application/problem+json',
    );
    expect((await message(admin, email, 'reset')).From.Address).toBe(
      'saved@example.com',
    );
    for (let i = 0; i < 3; i++)
      expect(
        (
          await context.request.post('/api/auth/send-verification-email', {
            data: { email },
          })
        ).status(),
      ).toBe(200);
    expect(
      (
        await context.request.post('/api/auth/send-verification-email', {
          data: { email },
        })
      ).status(),
    ).toBe(429);
    await expect
      .poll(
        () =>
          Number(
            compose(
              'exec',
              '-T',
              'postgres',
              'psql',
              '-U',
              'portal',
              '-d',
              'portal',
              '-Atc',
              "select count(*) from pgboss.job where name = 'send-email' and state in ('created','retry','active');",
            ).trim(),
          ),
        { timeout: 30_000 },
      )
      .toBe(0);
    const delivered = (
      await (await admin.get(`${mailpit}/api/v1/messages`)).json()
    ).messages.filter((m: { To: { Address: string }[] }) =>
      m.To.some((t) => t.Address === email),
    );
    expect(
      delivered.filter((m: { Subject: string }) =>
        m.Subject.startsWith('Reset'),
      ),
    ).toHaveLength(3);
    expect(
      delivered.filter((m: { Subject: string }) =>
        m.Subject.startsWith('Verify'),
      ),
    ).toHaveLength(4);
    for (let i = 0; i < 10; i++)
      expect(
        (await signin(context.request, email, 'wrong-password')).status(),
      ).toBe(401);
    expect((await signin(context.request, email)).status()).toBe(429);
    expect(
      (
        await admin.put('/api/v1/admin/settings/accounts', {
          data: {
            requireVerifiedEmail: false,
            rateLimits: {
              ...original.rateLimits,
              signInFailures: { max: 11, windowMinutes: 15 },
            },
          },
        })
      ).status(),
    ).toBe(200);
    expect((await signin(context.request, email)).status()).toBe(200);
    await page.goto('/forgot-password');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(
      page.getByRole('heading', { name: 'Check your email' }),
    ).toBeVisible();
    compose(
      'exec',
      '-T',
      'mailpit',
      'sh',
      '-c',
      'printf "qa:correct-password\\n" > /tmp/qa007-smtp-auth',
    );
    compose(
      'exec',
      '-d',
      'mailpit',
      'sh',
      '-c',
      'echo $$ > /tmp/qa007-smtp-auth.pid; exec /mailpit --smtp 0.0.0.0:1027 --listen 0.0.0.0:8027 --smtp-auth-file /tmp/qa007-smtp-auth --smtp-auth-allow-insecure > /tmp/qa007-smtp-auth.log 2>&1',
    );
    await expect
      .poll(
        () => {
          try {
            compose(
              'exec',
              '-T',
              'mailpit',
              'wget',
              '-q',
              '-O',
              '-',
              'http://127.0.0.1:8027/livez',
            );
            return true;
          } catch {
            return false;
          }
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    await admin.put('/api/v1/admin/settings/mail', {
      data: { ...saved, port: 1027, username: 'qa' },
    });
    const authStart = Date.now();
    const badLogin = await admin.post('/api/v1/admin/settings/mail/test', {
      data: { to: email },
    });
    expect(Date.now() - authStart).toBeLessThan(15_000);
    expect((await badLogin.json()).type).toBe('/problems/smtp-auth-failed');
    expect(await badLogin.text()).not.toContain(secret);
    await admin.put('/api/v1/admin/settings/mail', {
      data: { ...saved, host: '127.0.0.1', port: 1 },
    });
    const start = Date.now();
    const refused = await admin.post('/api/v1/admin/settings/mail/test', {
      data: { to: email },
    });
    expect(Date.now() - start).toBeLessThan(15_000);
    expect((await refused.json()).type).toBe('/problems/smtp-unreachable');
    expect(await refused.text()).not.toContain(secret);
    const logs = compose('logs', '--no-color', 'server');
    expect(logs).not.toContain(secret);
    const rows = compose(
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'portal',
      '-d',
      'portal',
      '-Atc',
      'select password_ciphertext from mail_settings; select data from pgboss.job;',
    );
    expect(rows).not.toContain(secret);
    expect(rows).not.toMatch(/token=|reset-password\//);
  } finally {
    await admin.put('/api/v1/admin/settings/accounts', {
      data: { requireVerifiedEmail: false, rateLimits: original.rateLimits },
    });
    await admin.delete('/api/v1/admin/settings/mail');
    compose(
      'exec',
      '-T',
      'mailpit',
      'sh',
      '-c',
      'if test -f /tmp/qa007-smtp-auth.pid; then kill "$(cat /tmp/qa007-smtp-auth.pid)" 2>/dev/null || true; rm -f /tmp/qa007-smtp-auth.pid; fi',
    );
    await admin.dispose();
  }
});

test('007 AC9: deletion revokes two live keys, preserves account during Admin API outage and protects last admin', async ({
  request,
  playwright,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const email = `delete-${crypto.randomUUID()}@example.com`;
  await signup(request, email);
  const sample = (await (await request.get('/api/v1/apis')).json()).items.find(
    (a: { slug: string }) => a.slug === 'sample',
  );
  const created = [];
  for (let i = 0; i < 2; i++) {
    const result = await request.post('/api/v1/apps', {
      data: { name: `Deletion ${i}`, apiIds: [sample.id] },
    });
    expect(result.status()).toBe(201);
    created.push(await result.json());
  }
  const call = (key: string) =>
    request.get(`${proxy}/sample/get`, { headers: { apikey: key } });
  for (const { credential } of created)
    expect((await call(credential.key)).status()).toBe(200);
  // Disable just the Admin listener; Kong's data plane and existing keys stay live.
  try {
    compose(
      'exec',
      '-T',
      'kong',
      'sh',
      '-c',
      'KONG_ADMIN_LISTEN=off kong reload',
    );
    await expect
      .poll(async () => {
        try {
          return (
            await request.get(`${kong}/status`, { timeout: 2000 })
          ).status();
        } catch {
          return 0;
        }
      })
      .not.toBe(200);
    expect(
      (await request.delete('/api/v1/me', { data: { password } })).status(),
    ).toBe(503);
    expect((await request.get('/api/v1/me')).status()).toBe(200);
    expect(
      (await (await request.get('/api/v1/apps')).json()).items,
    ).toHaveLength(2);
    for (const { credential } of created)
      expect((await call(credential.key)).status()).toBe(200);
  } finally {
    compose('exec', '-T', 'kong', 'kong', 'reload');
    await expect
      .poll(async () => {
        try {
          return (await request.get(`${kong}/status`)).status();
        } catch {
          return 0;
        }
      })
      .toBe(200);
  }
  expect(
    (await request.delete('/api/v1/me', { data: { password } })).status(),
  ).toBe(204);
  for (const { app, credential } of created) {
    expect((await call(credential.key)).status()).toBe(401);
    expect(
      (
        await (
          await request.get(`${kong}/consumers?tags=portal-app-${app.id}`)
        ).json()
      ).data,
    ).toHaveLength(0);
  }
  expect((await request.get('/api/v1/me')).status()).toBe(401);
  expect((await signin(request, email)).status()).toBe(401);
  await signup(request, email);
  const admin = await playwright.request.newContext({ baseURL });
  await signin(admin, 'admin@example.com', 'change-me-now');
  const denied = await admin.delete('/api/v1/me', {
    data: { password: 'change-me-now' },
  });
  expect(denied.status()).toBe(409);
  expect((await denied.json()).type).toBe('/problems/last-admin');
  await admin.dispose();
});

test('007 admin settings browser saves live limits and shows environment mail source', async ({
  page,
  context,
}) => {
  await signin(context.request, 'admin@example.com', 'change-me-now');
  await page.goto('/admin/settings/mail');
  await expect(
    page.getByText("ⓘ Portal email uses the server's environment settings"),
  ).toBeVisible();
  await expect(page.getByText('mailpit', { exact: true })).toBeVisible();
  await page.goto('/admin/settings/accounts');
  const maximum = page.getByLabel('Failed sign-ins: maximum attempts');
  await expect(maximum).toHaveValue('10');
  try {
    await maximum.fill('12');
    await page.getByRole('button', { name: 'Save account settings' }).click();
    await expect
      .poll(
        async () =>
          (
            await (
              await context.request.get('/api/v1/admin/settings/accounts')
            ).json()
          ).rateLimits.signInFailures.max,
      )
      .toBe(12);
    await page.reload();
    await expect(maximum).toHaveValue('12');
  } finally {
    await maximum.fill('10');
    await page.getByRole('button', { name: 'Save account settings' }).click();
    await expect
      .poll(
        async () =>
          (
            await (
              await context.request.get('/api/v1/admin/settings/accounts')
            ).json()
          ).rateLimits.signInFailures.max,
      )
      .toBe(10);
  }
});

test('007 security: opening a reset link never writes the bearer token to server logs', async ({
  page,
  context,
}) => {
  const email = `log-secret-${crypto.randomUUID()}@example.com`;
  await signup(context.request, email);
  await context.request.post('/api/auth/request-password-reset', {
    data: { email, redirectTo: '/reset-password' },
  });
  const resetLink = link(await message(context.request, email, 'reset'));
  const token = new URL(resetLink).pathname.split('/').pop()!;
  await page.goto(resetLink);
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
  const logs = compose('logs', '--no-color', 'server');
  expect(
    logs.includes(token),
    'Password-reset bearer token must be absent from server logs',
  ).toBe(false);
});

test('007 AC4/5: unknown reset sends no mail and over-one-hour reset shows expired without changing password', async ({
  page,
  context,
}) => {
  const email = `expired-${crypto.randomUUID()}@example.com`;
  const person = await signup(context.request, email);
  const known = await context.request.post('/api/auth/request-password-reset', {
    data: { email, redirectTo: '/reset-password' },
  });
  const unknownEmail = `absent-${crypto.randomUUID()}@example.com`;
  const unknown = await context.request.post(
    '/api/auth/request-password-reset',
    { data: { email: unknownEmail, redirectTo: '/reset-password' } },
  );
  expect(unknown.status()).toBe(known.status());
  expect(await unknown.json()).toEqual(await known.json());
  const resetLink = link(await message(context.request, email, 'reset'));
  const token = new URL(resetLink).pathname.split('/').pop()!;
  // Token is generated by Better Auth (alphanumeric); constrain it before SQL use.
  expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  compose(
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'portal',
    '-d',
    'portal',
    '-c',
    `update verification set expires_at = now() - interval '2 hours' where identifier = 'reset-password:${token}';`,
  );
  await page.goto(resetLink);
  await expect(
    page.getByRole('heading', { name: 'This link has expired' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Send a new link' }),
  ).toBeVisible();
  expect(
    (
      await context.request.post('/api/auth/reset-password', {
        data: { token, newPassword: 'Must-not-change-123' },
      })
    ).status(),
  ).toBe(400);
  expect((await signin(context.request, email)).status()).toBe(200);
  expect(
    (await signin(context.request, email, 'Must-not-change-123')).status(),
  ).toBe(401);
  await expect
    .poll(
      () =>
        Number(
          compose(
            'exec',
            '-T',
            'postgres',
            'psql',
            '-U',
            'portal',
            '-d',
            'portal',
            '-Atc',
            "select count(*) from pgboss.job where name = 'send-email' and state in ('created','retry','active');",
          ).trim(),
        ),
      { timeout: 30_000 },
    )
    .toBe(0);
  const messages = (
    await (await context.request.get(`${mailpit}/api/v1/messages`)).json()
  ).messages;
  expect(
    messages.filter((m: { To: { Address: string }[] }) =>
      m.To.some((t) => t.Address === unknownEmail),
    ),
  ).toHaveLength(0);
  expect((await (await context.request.get('/api/v1/me')).json()).id).toBe(
    person.id,
  );
});

for (const width of [1280, 390]) {
  test(`007 M2: one admin navigation across every section at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    expect(
      (
        await signin(context.request, 'admin@example.com', 'change-me-now')
      ).status(),
    ).toBe(200);
    const sections = [
      ['/admin/apis', 'APIs'],
      ['/admin/products', 'Products'],
      ['/admin/gateways', 'Gateways'],
      ['/admin/settings/mail', 'Mail'],
      ['/admin/settings/accounts', 'Accounts'],
    ] as const;
    for (const [path, label] of sections) {
      await page.goto(path);
      const nav = page.getByRole('navigation', {
        name: 'Admin section',
        includeHidden: true,
      });
      const select = page.getByRole('combobox', {
        name: 'Admin section',
        includeHidden: true,
      });
      await expect(nav).toHaveCount(1);
      await expect(select).toHaveCount(1);
      await expect(nav.locator('a')).toHaveCount(sections.length);
      await expect(nav.locator('[aria-current="page"]')).toHaveText(label);
      await expect(select).toHaveValue(path);
      if (width === 390) {
        await expect(nav).toBeHidden();
        await expect(select).toBeVisible();
        // Exercise the selector rather than just checking its rendered options.
        const next =
          sections[
            (sections.findIndex(([href]) => href === path) + 1) %
              sections.length
          ]!;
        await select.selectOption(next[0]);
        await expect(page).toHaveURL(new RegExp(`${next[0]}$`));
        await expect(select).toHaveValue(next[0]);
      } else {
        await expect(nav).toBeVisible();
        await expect(select).toBeHidden();
        for (const [href, name] of sections)
          await expect(
            nav.getByRole('link', { name, exact: true }),
          ).toHaveAttribute('href', href);
      }
    }
  });
}
