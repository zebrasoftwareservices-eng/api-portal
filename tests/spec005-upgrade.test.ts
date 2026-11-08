// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

test('AC 8: upgrade pre-005 main preserves the admin, published API and active Kong key', async ({
  page,
  request,
}) => {
  test.setTimeout(1200000);
  const baseline = process.env.SPEC005_BASELINE_DIR;
  expect(
    baseline,
    'Export the coordinator-approved origin/main baseline first',
  ).toBeTruthy();
  const scratch = mkdtempSync(join(tmpdir(), 'spec005-upgrade-'));
  const project = 'spec005qaupgrade';
  const baseOverride = join(scratch, 'base.yml');
  const branchOverride = join(scratch, 'branch.yml');
  writeFileSync(
    baseOverride,
    'services:\n  server:\n    image: spec005qa-base-server\n  portal:\n    image: spec005qa-base-web\n',
  );
  writeFileSync(
    branchOverride,
    'services:\n  server:\n    image: spec005qa-branch-server\n  portal:\n    image: spec005qa-branch-web\n',
  );
  const baseCompose = resolve(baseline!, 'deploy/docker-compose.yml');
  const branchCompose = resolve('deploy/docker-compose.yml');
  const env = {
    ...process.env,
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_PASSWORD: 'change-me-now',
    KONG_ADMIN_URL: '',
    KONG_ADMIN_TOKEN: '',
    SEED_SAMPLE: 'true',
  };
  const compose = (file: string, override: string, args: string[]) =>
    execFileSync(
      'docker',
      ['compose', '-p', project, '-f', file, '-f', override, ...args],
      { env, stdio: 'pipe', timeout: 600000 },
    );
  try {
    compose(baseCompose, baseOverride, ['up', '--build', '-d', '--wait']);
    const catalog = await (await request.get('/api/v1/apis')).json();
    const sample = catalog.items.find(
      (api: { slug: string }) => api.slug === 'sample',
    );
    expect(sample).toBeTruthy();
    const signup = await request.post('/api/auth/sign-up/email', {
      data: {
        email: 'upgrade-developer@example.com',
        password: 'upgrade-password-123',
        name: 'Upgrade developer',
      },
    });
    expect(signup.status()).toBe(200);
    const created = await request.post('/api/v1/apps', {
      data: { name: 'Survives upgrade', apiIds: [sample.id] },
    });
    expect(created.status()).toBe(201);
    const { credential, app } = await created.json();
    const traffic = async () =>
      (
        await request.get('http://localhost:8000/sample/get', {
          headers: { apikey: credential.key },
        })
      ).status();
    await expect.poll(traffic, { timeout: 15000 }).toBe(200);
    console.log(
      'Baseline: seeded admin/gateway/API and active key verified with Kong 200',
    );
    compose(branchCompose, branchOverride, ['up', '--build', '-d', '--wait']);
    await expect.poll(traffic, { timeout: 15000 }).toBe(200);
    expect((await request.get(`/api/v1/apps/${app.id}`)).status()).toBe(200);
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill('admin@example.com');
    await page.getByLabel('Password', { exact: true }).fill('change-me-now');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).not.toHaveURL(/\/setup/);
    await page.goto('/admin/gateways');
    await expect(
      page.getByRole('button', { name: 'Edit', exact: true }),
    ).toBeVisible();
    const gateway = (
      await (await page.request.get('/api/v1/admin/gateways')).json()
    ).items[0];
    expect(gateway.managedBy).toBe('admin');
    expect(
      (
        await page.request.patch(`/api/v1/admin/gateways/${gateway.id}`, {
          data: { name: 'Upgraded editable gateway' },
        })
      ).status(),
    ).toBe(200);
    await expect.poll(traffic, { timeout: 15000 }).toBe(200);
    console.log(
      'Upgrade: same active key returns 200, existing sessions survive, no wizard, gateway editable',
    );
  } finally {
    compose(branchCompose, branchOverride, ['down', '-v']);
    rmSync(scratch, { recursive: true, force: true });
  }
});
