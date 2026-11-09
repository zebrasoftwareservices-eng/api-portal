#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Run the quickstart with a project name, image tags, and host ports that belong
// to this checkout. `docker compose -f deploy/docker-compose.yml up` is unchanged
// and still uses the documented defaults.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutFromEnv } from './worktree-ports.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const layout = layoutFromEnv(ROOT);
const env = {
  ...process.env,
  COMPOSE_PROJECT_NAME: layout.project,
  PORTAL_WEB_PORT: String(layout.web),
  PORTAL_API_PORT: String(layout.api),
  KONG_PROXY_PORT: String(layout.kongProxy),
  KONG_ADMIN_PORT: String(layout.kongAdmin),
  PORTAL_SERVER_IMAGE: layout.serverImage,
  PORTAL_WEB_IMAGE: layout.webImage,
  PORTAL_PUBLIC_URL: layout.portalUrl,
  KONG_PROXY_PUBLIC_URL: layout.kongUrl,
  PORTAL_RATE_LIMIT_RESET: process.env.PORTAL_RATE_LIMIT_RESET || 'local-rate-limit-reset',
};

const [command, ...rest] = process.argv.slice(2);
if (!command || command === 'env') {
  console.log(`project: ${layout.project}`);
  console.log(`portal:  ${layout.portalUrl}`);
  console.log(`api:     http://127.0.0.1:${layout.api}`);
  console.log(`kong:    ${layout.kongUrl}`);
  console.log(`images:  ${layout.serverImage}, ${layout.webImage}`);
  process.exit(0);
}

const result = spawnSync(
  'docker',
  ['compose', '-f', 'deploy/docker-compose.yml', '-p', layout.project, command, ...rest],
  { cwd: ROOT, env, stdio: 'inherit' },
);
if (result.error) {
  console.error(`worktree-compose: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
