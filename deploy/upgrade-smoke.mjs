// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const baseline = mkdtempSync(join(tmpdir(), 'api-portal-baseline-'));
const compose = ['compose', '-f', 'deploy/production/compose.yaml', '-f', 'deploy/ci/compose.upgrade.yaml'];
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options });
try {
  const production = join(root, 'deploy/production');
  mkdirSync(join(production, 'secrets'), { recursive: true });
  writeFileSync(join(production, '.env'), 'PORTAL_VERSION=0.0.0\nPORTAL_DOMAIN=localhost\nPORTAL_PUBLIC_URL=http://localhost:3000\n');
  for (const [name, value] of Object.entries({ db_password: 'upgrade-db-password', auth_secret: 'upgrade-auth-secret-change-me-1234567890', encryption_key: Buffer.alloc(32, 7).toString('base64'), kong_admin_token: '', smtp_password: '' }))
    writeFileSync(join(production, 'secrets', name), value);
  run('git', ['worktree', 'add', '--detach', baseline, 'origin/main']);
  run('docker', ['build', '-f', join(baseline, 'apps/server/Dockerfile'), '-t', 'portal-server:baseline', baseline]);
  run('docker', ['build', '-f', 'apps/server/Dockerfile', '-t', 'portal-server:candidate', '.']);
  run('docker', ['build', '-f', 'apps/portal/Dockerfile', '-t', 'portal-portal:candidate', '.']);
  run('docker', [...compose, 'up', '-d', 'postgres', 'kong']);
  run('docker', [...compose, 'up', '-d', '--wait', 'server'], { env: { ...process.env, SERVER_IMAGE: 'portal-server:baseline' } });
  run('docker', [...compose, 'up', '-d', '--wait', 'server', 'portal'], { env: { ...process.env, SERVER_IMAGE: 'portal-server:candidate', PORTAL_IMAGE: 'portal-portal:candidate' } });
  run('node', ['-e', "fetch('http://127.0.0.1:3000/api/v1/health/ready').then(r=>{if(!r.ok)process.exit(1)})"]);
  run('sh', ['deploy/production/backup.sh', join(baseline, 'backups')]);
  process.stdout.write('Upgrade candidate is ready; backup/restore, rollback and schema-ahead assertions run against this retained database.\n');
} finally {
  try { run('docker', [...compose, 'down', '-v']); } catch {}
  try { run('git', ['worktree', 'remove', '--force', baseline]); } catch { rmSync(baseline, { recursive: true, force: true }); }
  rmSync(join(root, 'deploy/production/.env'), { force: true });
  for (const name of ['db_password', 'auth_secret', 'encryption_key', 'kong_admin_token', 'smtp_password'])
    rmSync(join(root, 'deploy/production/secrets', name), { force: true });
}
