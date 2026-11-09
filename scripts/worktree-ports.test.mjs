import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutFromEnv, worktreeLayout } from './worktree-ports.mjs';

test('the main checkout keeps the documented ports and image names', () => {
  const layout = worktreeLayout('/Users/example/api-portal');
  assert.equal(layout.project, 'portal');
  assert.equal(layout.web, 3000);
  assert.equal(layout.api, 4000);
  assert.equal(layout.kongProxy, 8000);
  assert.equal(layout.kongAdmin, 8001);
  assert.equal(layout.serverImage, 'portal-server');
  assert.equal(layout.webImage, 'portal-web');
});

test('another checkout gets its own project, images, and ports', () => {
  const main = worktreeLayout('/Users/example/api-portal');
  const other = worktreeLayout('/Users/example/orca/007-email-and-account-security');
  assert.notEqual(other.project, main.project);
  assert.notEqual(other.serverImage, main.serverImage);
  assert.notEqual(other.webImage, main.webImage);
  assert.ok(other.web !== 3000 && other.api !== 4000);
  assert.ok(other.kongProxy !== 8000 && other.kongAdmin !== 8001);
  assert.equal(worktreeLayout('/Users/example/orca/007-email-and-account-security').project, other.project);
});

test('environment variables override the derived ports', () => {
  const layout = layoutFromEnv('/Users/example/orca/spec-a', { PORTAL_WEB_PORT: '3105' });
  assert.equal(layout.web, 3105);
  assert.equal(layout.portalUrl, 'http://localhost:3105');
});
