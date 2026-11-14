// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const baseline = mkdtempSync(join(tmpdir(), 'api-portal-baseline-'));
const compose = [
  'compose',
  '-f',
  'deploy/production/compose.yaml',
  '-f',
  'deploy/ci/compose.upgrade.yaml',
];
const run = (command, args, options = {}) =>
  execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options });
const output = (command, args, options = {}) =>
  execFileSync(command, args, { cwd: root, encoding: 'utf8', ...options });
const composeEnv = (serverImage, extra = {}) => ({
  ...process.env,
  SERVER_IMAGE: serverImage,
  PORTAL_IMAGE: 'portal-portal:candidate',
  PORTAL_HTTP_PORT: '3006',
  UPGRADE_SERVER_PORT: '4006',
  ...extra,
});
const composeRun = (
  args,
  serverImage = 'portal-server:candidate',
  extra = {},
) =>
  run('docker', [...compose, ...args], { env: composeEnv(serverImage, extra) });
const composeOutput = (
  args,
  serverImage = 'portal-server:candidate',
  extra = {},
) =>
  output('docker', [...compose, ...args], {
    env: composeEnv(serverImage, extra),
  });
const server = 'http://127.0.0.1:4006';
const request = (path, options = {}) => fetch(server + path, options);
const jsonRequest = (path, options = {}) =>
  request(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
  });
const cookie = (response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
const signIn = async (email, password) => {
  const response = await jsonRequest('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (response.status !== 200)
    throw new Error(
      `sign in ${email}: ${response.status} ${await response.text()}`,
    );
  return cookie(response);
};
const sql = (statement, options = {}) =>
  output(
    'docker',
    [
      ...compose,
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'portal',
      '-d',
      'portal',
      '-Atqc',
      statement,
    ],
    {
      env: composeEnv(
        options.serverImage ?? 'portal-server:candidate',
        options.env,
      ),
    },
  ).trim();
const domainFingerprint = () =>
  sql(`
  select md5(jsonb_build_object(
    'users',(select jsonb_agg(to_jsonb(t) order by id) from (select id,name,email,role from "user") t),
    'apis',(select jsonb_agg(to_jsonb(t) order by id) from (select id,slug,gateway_service_id from apis) t),
    'apps',(select jsonb_agg(to_jsonb(t) order by id) from (select id,team_id,name from apps) t),
    'credentials',(select jsonb_agg(to_jsonb(t) order by id) from (select id,app_id,key_hint,status from credentials) t)
  )::text)
`);
const backup = (directory) => {
  run('sh', ['deploy/production/backup.sh', directory], {
    env: composeEnv('portal-server:candidate'),
  });
  return join(
    directory,
    readdirSync(directory)
      .filter((name) => name.endsWith('.dump'))
      .sort()
      .at(-1),
  );
};
const restore = (file) =>
  run('sh', ['deploy/production/restore.sh', '--yes', file], {
    env: composeEnv('portal-server:candidate'),
  });
const startServer = (image, extra = {}) =>
  composeRun(
    ['up', '-d', '--wait', '--force-recreate', 'server'],
    image,
    extra,
  );
const assertData = async (developerCookie, appId, keyHint) => {
  const catalog = await request('/api/v1/apis');
  assert.equal(catalog.status, 200, 'published API catalog remains available');
  assert.ok(
    (await catalog.json()).items.some((api) => api.slug === 'sample'),
    'published API remains listed',
  );
  const apps = await request('/api/v1/apps', {
    headers: { cookie: developerCookie },
  });
  if (apps.status !== 200)
    throw new Error(`app list: ${apps.status} ${await apps.text()}`);
  const app = (await apps.json()).items.find((item) => item.id === appId);
  assert.ok(app, 'developer app remains listed');
  assert.ok(
    app.credentials.some((credential) => credential.keyHint === keyHint),
    'API key hint remains listed',
  );
};
try {
  const production = join(root, 'deploy/production');
  mkdirSync(join(production, 'secrets'), { recursive: true });
  writeFileSync(
    join(production, '.env'),
    'PORTAL_VERSION=0.0.0\nPORTAL_DOMAIN=localhost\nPORTAL_PUBLIC_URL=http://localhost:3000\n',
  );
  for (const [name, value] of Object.entries({
    db_password: 'upgrade-db-password',
    auth_secret: 'upgrade-auth-secret-change-me-1234567890',
    encryption_key: Buffer.alloc(32, 7).toString('base64'),
    kong_admin_token: '',
    smtp_password: '',
  }))
    writeFileSync(join(production, 'secrets', name), value);
  run('git', ['worktree', 'add', '--detach', baseline, 'origin/main']);
  run('docker', [
    'build',
    '-f',
    join(baseline, 'apps/server/Dockerfile'),
    '-t',
    'portal-server:baseline',
    baseline,
  ]);
  run('docker', [
    'build',
    '-f',
    'apps/server/Dockerfile',
    '-t',
    'portal-server:candidate',
    '.',
  ]);
  run('docker', [
    'build',
    '-f',
    'apps/portal/Dockerfile',
    '-t',
    'portal-portal:candidate',
    '.',
  ]);
  composeRun(
    ['up', '-d', '--wait', 'postgres', 'kong', 'httpbin'],
    'portal-server:baseline',
  );
  startServer('portal-server:baseline');

  let catalog;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    catalog = await (await request('/api/v1/apis')).json();
    if (catalog.items.some((api) => api.slug === 'sample')) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const sample = catalog.items.find((api) => api.slug === 'sample');
  assert.ok(sample, 'baseline publishes the sample API against real Kong');
  const signup = await jsonRequest('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({
      email: 'developer@example.com',
      password: 'developer-password',
      name: 'Upgrade Developer',
    }),
  });
  if (signup.status !== 200)
    throw new Error(
      `developer signup: ${signup.status} ${await signup.text()}`,
    );
  const developerCookie = cookie(signup);
  const created = await jsonRequest('/api/v1/apps', {
    method: 'POST',
    headers: { cookie: developerCookie },
    body: JSON.stringify({ name: 'Upgrade App', apiIds: [sample.id] }),
  });
  if (created.status !== 201)
    throw new Error(
      `baseline app creation: ${created.status} ${await created.text()}`,
    );
  const { app, credential } = await created.json();
  const baselineFingerprint = domainFingerprint();
  const preUpgrade = backup(join(baseline, 'pre-upgrade'));

  startServer('portal-server:candidate');
  composeRun(['up', '-d', '--wait', 'portal']);
  assert.equal(
    (await request('/api/v1/health/ready')).status,
    200,
    'candidate is ready',
  );
  await signIn('admin@example.com', 'upgrade-password');
  let candidateDeveloper = await signIn(
    'developer@example.com',
    'developer-password',
  );
  await assertData(candidateDeveloper, app.id, credential.keyHint);
  assert.equal(
    domainFingerprint(),
    baselineFingerprint,
    'upgrade preserves portal data',
  );

  const candidateBackup = backup(join(baseline, 'candidate'));
  const beforeBackupRead = domainFingerprint();
  assert.equal(domainFingerprint(), beforeBackupRead, 'backup is read-only');
  sql(`delete from apps where id='${app.id}'`);
  assert.equal(
    sql(`select count(*) from apps where id='${app.id}'`),
    '0',
    'test mutation removes the app',
  );
  restore(candidateBackup);
  startServer('portal-server:candidate');
  candidateDeveloper = await signIn(
    'developer@example.com',
    'developer-password',
  );
  await assertData(candidateDeveloper, app.id, credential.keyHint);
  assert.equal(
    domainFingerprint(),
    baselineFingerprint,
    'restore recovers the deleted app and all domain rows',
  );

  restore(preUpgrade);
  startServer('portal-server:baseline');
  const rolledBackDeveloper = await signIn(
    'developer@example.com',
    'developer-password',
  );
  await assertData(rolledBackDeveloper, app.id, credential.keyHint);
  assert.equal(
    domainFingerprint(),
    baselineFingerprint,
    'pre-upgrade backup runs on the baseline image',
  );

  restore(candidateBackup);
  startServer('portal-server:candidate');
  let missingSecretFailed = false;
  try {
    output(
      'docker',
      [
        'run',
        '--rm',
        '--network',
        'api-portal_database',
        '-e',
        'NODE_ENV=production',
        '-e',
        'DATABASE_URL=postgres://portal:upgrade-db-password@postgres:5432/portal',
        '-e',
        'BETTER_AUTH_SECRET=upgrade-auth-secret-change-me-1234567890',
        '-e',
        'PORTAL_PUBLIC_URL=http://localhost:3000',
        'portal-server:candidate',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (error) {
    missingSecretFailed = true;
    const logs = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    assert.match(
      logs,
      /PORTAL_ENCRYPTION_KEY/,
      'missing-secret log names the setting',
    );
    assert.doesNotMatch(
      logs,
      /upgrade-auth-secret-change-me/,
      'missing-secret log does not expose another secret',
    );
  }
  assert.ok(
    missingSecretFailed,
    'candidate refuses to start without the encryption key',
  );

  composeRun(['stop', 'server']);
  sql('truncate "user" cascade; delete from setup_tokens');
  startServer('portal-server:candidate', {
    ADMIN_EMAIL: '',
    ADMIN_PASSWORD: '',
  });
  const firstContainer = composeOutput(['ps', '-q', 'server']).trim();
  const firstToken = [
    ...output('docker', ['logs', firstContainer]).matchAll(
      /Setup token for the first admin: ([0-9a-f]{64})/g,
    ),
  ].at(-1)?.[1];
  assert.ok(firstToken, 'candidate prints a setup token with no admin');
  composeRun(['restart', 'server'], 'portal-server:candidate', {
    ADMIN_EMAIL: '',
    ADMIN_PASSWORD: '',
  });
  run('node', [
    '-e',
    `let n=0;const go=()=>fetch('${server}/api/v1/health/ready').then(r=>{if(!r.ok)throw 0}).catch(()=>{if(++n===60)process.exit(1);setTimeout(go,500)});go()`,
  ]);
  const secondToken = [
    ...output('docker', ['logs', firstContainer]).matchAll(
      /Setup token for the first admin: ([0-9a-f]{64})/g,
    ),
  ].at(-1)?.[1];
  assert.equal(
    secondToken,
    firstToken,
    'setup token survives a server restart',
  );

  restore(candidateBackup);
  sql(
    "insert into drizzle.__drizzle_migrations(hash,created_at) values ('future-smoke-migration', 4102444800000)",
  );
  const publicBefore = output(
    'docker',
    [
      ...compose,
      'exec',
      '-T',
      'postgres',
      'pg_dump',
      '-U',
      'portal',
      '-d',
      'portal',
      '--schema=public',
      '--no-owner',
      '--no-privileges',
    ],
    { env: composeEnv('portal-server:candidate') },
  );
  let aheadLogs = '';
  let schemaAheadFailed = false;
  try {
    output('docker', [...compose, 'run', '--rm', '--no-deps', 'server'], {
      env: composeEnv('portal-server:candidate', {
        ADMIN_EMAIL: '',
        ADMIN_PASSWORD: '',
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    schemaAheadFailed = true;
    aheadLogs = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  assert.ok(schemaAheadFailed, 'schema-ahead candidate exits non-zero');
  assert.match(
    aheadLogs,
    /restore the backup taken before the upgrade/i,
    'schema-ahead log explains restore',
  );
  assert.match(
    aheadLogs,
    /start the previous version/i,
    'schema-ahead log explains rollback image',
  );
  const publicAfter = output(
    'docker',
    [
      ...compose,
      'exec',
      '-T',
      'postgres',
      'pg_dump',
      '-U',
      'portal',
      '-d',
      'portal',
      '--schema=public',
      '--no-owner',
      '--no-privileges',
    ],
    { env: composeEnv('portal-server:candidate') },
  );
  assert.equal(
    publicAfter,
    publicBefore,
    'schema-ahead refusal leaves the public schema byte-identical',
  );
  process.stdout.write(
    'PASS: upgrade, sign-in/data preservation, backup/restore, rollback, missing secret, persistent token and schema-ahead refusal\n',
  );
} finally {
  try {
    composeRun(['down', '-v']);
  } catch {}
  try {
    run('git', ['worktree', 'remove', '--force', baseline]);
  } catch {
    rmSync(baseline, { recursive: true, force: true });
  }
  rmSync(join(root, 'deploy/production/.env'), { force: true });
  for (const name of [
    'db_password',
    'auth_secret',
    'encryption_key',
    'kong_admin_token',
    'smtp_password',
  ])
    rmSync(join(root, 'deploy/production/secrets', name), { force: true });
}
