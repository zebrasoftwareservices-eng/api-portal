// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutFromEnv } from '../scripts/worktree-ports.mjs';

// Run against the seeded worktree quickstart; keep its stack available for UAT.
test(
  '011 quickstart collects a keyed call automatically within 60 seconds',
  { timeout: 90000 },
  async (t) => {
    const { portalUrl, kongUrl } = layoutFromEnv(process.cwd());
    const signup = await fetch(`${portalUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: portalUrl },
      body: JSON.stringify({
        name: 'Usage smoke',
        email: `smoke-${crypto.randomUUID()}@example.com`,
        password: 'QA-smoke-password-123',
      }),
    });
    assert.equal(signup.status, 200);
    const cookie = signup.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const headers = {
      cookie,
      origin: portalUrl,
      'content-type': 'application/json',
    };
    const catalog = await (await fetch(`${portalUrl}/api/v1/apis`)).json();
    const sample = catalog.items.find(
      (api: { slug: string }) => api.slug === 'sample',
    );
    assert.ok(sample);
    const created = await fetch(`${portalUrl}/api/v1/apps`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Usage smoke', apiIds: [sample.id] }),
    });
    assert.equal(created.status, 201);
    const { app, credential } = await created.json();
    const call = await fetch(`${kongUrl}/sample/get`, {
      headers: { apikey: credential.key },
    });
    assert.equal(call.status, 200);
    await call.body?.cancel();
    await t.waitFor(
      async () => {
        const response = await fetch(
          `${portalUrl}/api/v1/apps/${app.id}/usage`,
          { headers },
        );
        assert.equal(response.status, 200);
        const usage = await response.json();
        return usage.total >= 1 && usage.byStatus['2xx'] >= 1;
      },
      { timeout: 60000, interval: 100 },
    );
  },
);
