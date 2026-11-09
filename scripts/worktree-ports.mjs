// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { basename } from 'node:path';

// The main checkout keeps the documented quickstart ports and image names.
// Every other checkout gets its own Compose project, image tags, and host ports
// so two worktrees can run the stack at the same time.
export function worktreeLayout(root) {
  const base = basename(root);
  const primary = base === 'api-portal';
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'worktree';
  const hash = createHash('sha256').update(root).digest('hex').slice(0, 4);
  const slot = primary ? 0 : (Number.parseInt(hash, 16) % 20) + 1;
  const web = 3000 + slot;
  const api = 4000 + slot;
  const kongProxy = slot === 0 ? 8000 : 18000 + slot;
  const kongAdmin = slot === 0 ? 8001 : 19000 + slot;
  const tag = primary ? '' : `-${slug}-${hash}`;
  return {
    primary,
    project: primary ? 'portal' : `portal-${slug}-${hash}`,
    slot,
    web,
    api,
    kongProxy,
    kongAdmin,
    serverImage: `portal-server${tag}`,
    webImage: `portal-web${tag}`,
    portalUrl: `http://localhost:${web}`,
    kongUrl: `http://localhost:${kongProxy}`,
  };
}

export function layoutFromEnv(root, env = process.env) {
  const layout = worktreeLayout(root);
  const num = (value, fallback) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  };
  const web = num(env.PORTAL_WEB_PORT, layout.web);
  const api = num(env.PORTAL_API_PORT, layout.api);
  const kongProxy = num(env.KONG_PROXY_PORT, layout.kongProxy);
  return {
    ...layout,
    project: env.COMPOSE_PROJECT_NAME || layout.project,
    web,
    api,
    kongProxy,
    kongAdmin: num(env.KONG_ADMIN_PORT, layout.kongAdmin),
    serverImage: env.PORTAL_SERVER_IMAGE || layout.serverImage,
    webImage: env.PORTAL_WEB_IMAGE || layout.webImage,
    portalUrl: env.PORTAL_PUBLIC_URL || `http://localhost:${web}`,
    kongUrl: env.KONG_PROXY_PUBLIC_URL || `http://localhost:${kongProxy}`,
  };
}
