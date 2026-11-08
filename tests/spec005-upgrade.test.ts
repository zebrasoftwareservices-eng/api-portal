// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
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
  const project = process.env.SPEC005_UPGRADE_PROJECT ?? 'spec005qaupgrade';
  const imagePrefix = process.env.SPEC005_UPGRADE_IMAGE_PREFIX ?? 'spec005qa';
  const baseOverride = join(scratch, 'base.yml');
  const branchOverride = join(scratch, 'branch.yml');
  writeFileSync(
    baseOverride,
    `services:\n  server:\n    image: ${imagePrefix}-base-server\n  portal:\n    image: ${imagePrefix}-base-web\n`,
  );
  writeFileSync(
    branchOverride,
    `services:\n  server:\n    image: ${imagePrefix}-branch-server\n  portal:\n    image: ${imagePrefix}-branch-web\n`,
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
  const buildFlag =
    process.env.SPEC005_PREBUILT === '1' ? '--no-build' : '--build';
  try {
    compose(baseCompose, baseOverride, ['up', buildFlag, '-d', '--wait']);
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
    // JSO-404: execute the guide from the pinned curl image in Kong's namespace.
    const kongContainer = compose(baseCompose, baseOverride, [
      'ps',
      '-q',
      'kong',
    ])
      .toString()
      .trim();
    expect(
      execFileSync('docker', [
        'exec',
        kongContainer,
        'sh',
        '-c',
        'command -v curl || true',
      ])
        .toString()
        .trim(),
    ).toBe('');
    const guide = readFileSync(resolve('docs/connect-kong.md'), 'utf8');
    const recipe = guide
      .split(
        '```sh\n# Run in the curl container above, or on the Kong host with curl installed.\n',
      )[1]
      .split('```')[0]
      .replace(
        'PORTAL_SERVER_IP=192.0.2.10/32',
        'PORTAL_SERVER_IP=127.0.0.1/32',
      )
      .replace(
        "read -r -s -p 'Choose an admin token: ' ADMIN_TOKEN",
        'ADMIN_TOKEN=qa-docs-recipe-token',
      );
    const shell = (input: string) =>
      execFileSync(
        'docker',
        [
          'run',
          '--rm',
          '-i',
          '--network',
          `container:${kongContainer}`,
          '--entrypoint',
          'sh',
          'curlimages/curl:8.11.1',
        ],
        { input, timeout: 60000 },
      ).toString();
    shell('set -eu\n' + recipe);
    const protectedStatus = (token: string) =>
      shell(
        `curl -sS -o /dev/null -w '%{http_code}' -H 'Kong-Admin-Token: ${token}' http://127.0.0.1:8000/admin-api/`,
      );
    await expect
      .poll(() => protectedStatus('qa-docs-recipe-token'), { timeout: 15000 })
      .toBe('200');
    expect(protectedStatus('wrong-token')).toBe('401');
    console.log(
      'JSO-404: documented curl-container recipe returns 200 with right token and 401 with wrong token',
    );

    compose(branchCompose, branchOverride, ['up', buildFlag, '-d', '--wait']);
    await expect.poll(traffic, { timeout: 15000 }).toBe(200);
    expect((await request.get(`/api/v1/apps/${app.id}`)).status()).toBe(200);
    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill('admin@example.com');
    await page.getByLabel('Password', { exact: true }).fill('change-me-now');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/(dashboard|admin\/apis)$/);
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
          data: { proxyPublicUrl: 'http://127.0.0.1:8000' },
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
