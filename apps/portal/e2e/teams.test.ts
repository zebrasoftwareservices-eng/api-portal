// SPDX-License-Identifier: Apache-2.0
import { expect, test, type APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const origin = process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:3000';
const proxy = process.env.KONG_PROXY_PUBLIC_URL ?? 'http://localhost:8000';
const kong = process.env.KONG_ADMIN_URL ?? 'http://localhost:8001';
const mailpit = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const password = 'QA-teams-password-123';
test.use({ extraHTTPHeaders: { origin } });
async function signup(request: APIRequestContext) {
  const email = `teams-${crypto.randomUUID()}@example.com`;
  const response = await request.post('/api/auth/sign-up/email', {
    data: { email, name: 'Team QA', password },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).user as { id: string; email: string };
}
async function invitation(
  request: APIRequestContext,
  teamId: string,
  email: string,
  role = 'member',
) {
  const response = await request.post(`/api/v1/teams/${teamId}/invitations`, {
    data: { email, role },
  });
  expect(response.status()).toBe(201);
  return { ...(await response.json()), ...(await mail(request, email)) } as {
    id: string;
    token: string;
    link: string;
  };
}
async function mail(request: APIRequestContext, email: string) {
  let link = '';
  await expect
    .poll(
      async () => {
        const messages = (
          await (await request.get(`${mailpit}/api/v1/messages`)).json()
        ).messages;
        const item = messages.find((m: { To: { Address: string }[] }) =>
          m.To.some((to) => to.Address === email),
        );
        if (!item) return false;
        const body = await (
          await request.get(`${mailpit}/api/v1/message/${item.ID}`)
        ).json();
        link =
          (body.Text as string).match(
            /https?:\/\/[^\s]+\/invitations\/accept\?token=[A-Za-z0-9_-]+/,
          )?.[0] ?? '';
        return !!link;
      },
      { timeout: 30000 },
    )
    .toBe(true);
  return { link, token: new URL(link).searchParams.get('token')! };
}
async function createApp(request: APIRequestContext, name: string) {
  const sample = (await (await request.get('/api/v1/apis')).json()).items.find(
    (a: { slug: string }) => a.slug === 'sample',
  );
  const response = await request.post('/api/v1/apps', {
    data: { name, apiIds: [sample.id] },
  });
  expect(response.status()).toBe(201);
  return response.json();
}
async function live(request: APIRequestContext, key: string, status = 200) {
  await expect
    .poll(
      async () =>
        (
          await request.get(`${proxy}/sample/get`, { headers: { apikey: key } })
        ).status(),
      { timeout: 15000 },
    )
    .toBe(status);
}

test('008 AC1-5/7/9: personal signup, switcher isolation, Mailpit invitation, live member keys and role/removal access', async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(120000);
  const owner = await signup(context.request);
  const personal = await (await context.request.get('/api/v1/teams')).json();
  expect(personal.items).toEqual([
    expect.objectContaining({
      personal: true,
      role: 'admin',
      id: personal.currentTeamId,
    }),
  ]);
  const privateApp = await createApp(context.request, 'Personal only');
  await page.goto('/dashboard/teams/new');
  await page.getByLabel('Team name').fill('Payments');
  await page.getByRole('button', { name: 'Create team', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Payments', exact: true }),
  ).toBeVisible();
  const teamId = (await (await context.request.get('/api/v1/teams')).json())
    .currentTeamId;
  await page.goto('/dashboard');
  await expect(
    page.getByRole('link', { name: 'Personal only', exact: true }),
  ).toHaveCount(0);
  const shared = await createApp(context.request, 'Shared payments');
  expect(shared.app.teamId).toBe(teamId);
  await page.reload();
  await expect(
    page.getByRole('link', { name: 'Shared payments', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Team: Payments/ }).click();
  await page.getByRole('menuitemradio', { name: /Personal/ }).click();
  await expect(
    page.getByRole('link', { name: 'Personal only', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Shared payments', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: /Team: Personal/ }).click();
  await page.getByRole('menuitemradio', { name: /Payments/ }).click();
  await page.goto(`/dashboard/teams/${teamId}`);
  await page.getByRole('button', { name: 'Leave team…', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText(
    'needs another Admin',
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const colleague = await browser.newContext({
    baseURL: origin,
    extraHTTPHeaders: { origin },
  });
  try {
    const email = `invited-${crypto.randomUUID()}@example.com`;
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Role', { exact: true }).selectOption('member');
    await page.getByRole('button', { name: 'Send invitation' }).click();
    const row = page
      .getByRole('table', { name: 'Pending invitations to Payments' })
      .getByRole('row')
      .filter({ hasText: email });
    await expect(row).toContainText('Member');
    const invite = await mail(context.request, email);
    const memberPage = await colleague.newPage();
    await memberPage.goto(invite.link);
    await memberPage
      .getByRole('link', { name: 'Create an account', exact: true })
      .click();
    await expect(memberPage.getByLabel('Email', { exact: true })).toHaveValue(
      email,
    );
    await memberPage.getByLabel('Name', { exact: true }).fill('Colleague');
    await memberPage.getByLabel('Password', { exact: true }).fill(password);
    await memberPage
      .getByRole('button', { name: 'Create account', exact: true })
      .click();
    await memberPage
      .getByRole('button', { name: 'Accept invitation', exact: true })
      .click();
    await expect(memberPage).toHaveURL(/\/dashboard/);
    const person = await (await colleague.request.get('/api/v1/me')).json();
    expect(
      (await (await colleague.request.get('/api/v1/teams')).json())
        .currentTeamId,
    ).toBe(teamId);
    await memberPage.goto(`/dashboard/teams/${teamId}`);
    await expect(
      memberPage.getByRole('button', { name: 'Send invitation' }),
    ).toHaveCount(0);
    await expect(
      memberPage.getByRole('button', { name: /Actions for/ }),
    ).toHaveCount(0);
    await memberPage.goto(`/dashboard/apps/${shared.app.id}`);
    await memberPage
      .getByRole('button', { name: 'Create key', exact: true })
      .click();
    const dialog = memberPage.getByRole('alertdialog');
    const memberKey = await dialog
      .getByLabel('API key', { exact: true })
      .inputValue();
    await dialog.getByRole('button', { name: "I've saved it" }).click();
    await live(context.request, memberKey);
    expect(
      (
        await context.request.patch(
          `/api/v1/teams/${teamId}/members/${person.id}`,
          { data: { role: 'read-only' } },
        )
      ).status(),
    ).toBe(200);
    await memberPage.reload();
    await expect(
      memberPage.getByRole('heading', { name: 'Shared payments', exact: true }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole('button', { name: /Create key|Revoke/ }),
    ).toHaveCount(0);
    await expect(
      memberPage.getByRole('table', { name: 'API keys for Shared payments' }),
    ).toContainText(shared.credential.keyHint);
    await expect(memberPage.locator('#subscriptions')).toContainText(
      'Sample HTTP API',
    );
    await memberPage.goto(`/dashboard/teams/${teamId}`);
    await expect(
      memberPage.getByRole('heading', { name: 'Payments', exact: true }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole('button', { name: 'Send invitation' }),
    ).toHaveCount(0);
    await expect(
      memberPage.getByRole('button', { name: /Actions for/ }),
    ).toHaveCount(0);
    await memberPage.goto(`/dashboard/apps/${shared.app.id}`);
    const before = await (
      await context.request.get(
        `${kong}/consumers/portal-app-${shared.app.id}/key-auth`,
      )
    ).json();
    for (const response of [
      await colleague.request.post(
        `/api/v1/apps/${shared.app.id}/credentials`,
        { data: {} },
      ),
      await colleague.request.delete(
        `/api/v1/apps/${shared.app.id}/credentials/${shared.credential.id}`,
      ),
      await colleague.request.post(`/api/v1/teams/${teamId}/invitations`, {
        data: { email: 'denied@example.com', role: 'member' },
      }),
      await colleague.request.patch(
        `/api/v1/teams/${teamId}/members/${owner.id}`,
        { data: { role: 'member' } },
      ),
      await colleague.request.delete(
        `/api/v1/teams/${teamId}/members/${owner.id}`,
      ),
    ]) {
      expect(response.status()).toBe(403);
      expect(response.headers()['content-type']).toContain(
        'application/problem+json',
      );
    }
    expect(
      await (
        await context.request.get(
          `${kong}/consumers/portal-app-${shared.app.id}/key-auth`,
        )
      ).json(),
    ).toEqual(before);
    await live(context.request, memberKey);
    expect(
      (
        await context.request.delete(
          `/api/v1/teams/${teamId}/members/${person.id}`,
        )
      ).status(),
    ).toBe(204);
    for (const path of [
      `/api/v1/apps/${shared.app.id}`,
      `/api/v1/apps?teamId=${teamId}`,
      `/api/v1/teams/${teamId}`,
    ])
      expect((await colleague.request.get(path)).status()).toBe(404);
    expect(
      (await (await colleague.request.get('/api/v1/teams')).json()).items.some(
        (t: { id: string }) => t.id === teamId,
      ),
    ).toBe(false);
    await memberPage.reload();
    await expect(
      memberPage.getByRole('heading', { name: /can't find|not found/i }),
    ).toBeVisible();
    await live(context.request, memberKey);
    await live(context.request, privateApp.credential.key);
  } finally {
    await colleague.close();
  }
});

test('008 AC8: deleting a member account removes only personal apps and keeps shared keys live', async ({
  request,
  playwright,
  baseURL,
}) => {
  test.setTimeout(60000);
  await signup(request);
  const teamResponse = await request.post('/api/v1/teams', {
    data: { name: 'Survives deletion' },
  });
  const team = await teamResponse.json();
  const shared = await createApp(request, 'Surviving shared app');
  const member = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin },
  });
  try {
    const person = await signup(member);
    const personal = await createApp(member, 'Deleted private app');
    const invite = await invitation(request, team.id, person.email);
    expect(
      (
        await member.post('/api/v1/invitations/accept', {
          data: { token: invite.token },
        })
      ).status(),
    ).toBe(200);
    const keyResponse = await member.post(
      `/api/v1/apps/${shared.app.id}/credentials`,
      { data: {} },
    );
    expect(keyResponse.status()).toBe(201);
    const key = await keyResponse.json();
    await live(request, key.key);
    await live(request, personal.credential.key);
    expect(
      (await member.delete('/api/v1/me', { data: { password } })).status(),
    ).toBe(204);
    await live(request, key.key);
    await live(request, shared.credential.key);
    await live(request, personal.credential.key, 401);
    expect((await member.get('/api/v1/me')).status()).toBe(401);
    expect((await request.get(`/api/v1/apps/${shared.app.id}`)).status()).toBe(
      200,
    );
  } finally {
    await member.dispose();
  }
});

test('008 AC6: wrong account, cancelled, expired and used invitation pages explain refusals without new access', async ({
  page,
  context,
  playwright,
  baseURL,
}) => {
  test.setTimeout(90000);
  await signup(context.request);
  const team = await (
    await context.request.post('/api/v1/teams', {
      data: { name: 'Token refusals' },
    })
  ).json();
  const other = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin },
  });
  try {
    await signup(other);
    for (const state of [
      'wrong-account',
      'cancelled',
      'expired',
      'used',
    ] as const) {
      const email = `refused-${crypto.randomUUID()}@example.com`;
      const invite = await invitation(context.request, team.id, email);
      if (state === 'cancelled')
        expect(
          (
            await context.request.delete(
              `/api/v1/teams/${team.id}/invitations/${invite.id}`,
            )
          ).status(),
        ).toBe(204);
      if (state === 'expired') {
        expect(invite.id).toMatch(/^[a-f0-9-]{36}$/);
        execFileSync('node', [
          'scripts/worktree-compose.mjs',
          'exec',
          '-T',
          'postgres',
          'psql',
          '-U',
          'portal',
          '-d',
          'portal',
          '-c',
          `update team_invitations set expires_at=now()-interval '8 days' where id='${invite.id}'`,
        ]);
      }
      if (state === 'used') {
        const invited = await playwright.request.newContext({
          baseURL,
          extraHTTPHeaders: { origin },
        });
        try {
          expect(
            (
              await invited.post('/api/auth/sign-up/email', {
                data: { email, name: 'Invited', password },
              })
            ).status(),
          ).toBe(200);
          expect(
            (
              await invited.post('/api/v1/invitations/accept', {
                data: { token: invite.token },
              })
            ).status(),
          ).toBe(200);
        } finally {
          await invited.dispose();
        }
      }
      const before = await (
        await context.request.get(`/api/v1/teams/${team.id}`)
      ).json();
      const denied = await other.post('/api/v1/invitations/accept', {
        data: { token: invite.token },
      });
      expect(denied.status()).toBe(409);
      expect((await denied.json()).type).toBe(`/problems/invitation-${state}`);
      expect(
        await (await context.request.get(`/api/v1/teams/${team.id}`)).json(),
      ).toEqual(before);
      expect((await other.get(`/api/v1/apps?teamId=${team.id}`)).status()).toBe(
        404,
      );
      await page.goto(invite.link);
      if (state === 'wrong-account')
        await expect(
          page.getByRole('alert').filter({ hasText: 'This invitation is for' }),
        ).toContainText('This invitation is for');
      else
        await expect(
          page.getByRole('heading', {
            name:
              state === 'cancelled'
                ? 'This invitation was cancelled'
                : state === 'expired'
                  ? 'This invitation has expired'
                  : 'This invitation has already been used',
          }),
        ).toBeVisible();
    }
  } finally {
    await other.dispose();
  }
});
