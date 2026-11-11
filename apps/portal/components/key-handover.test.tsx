// SPDX-License-Identifier: Apache-2.0
import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Providers, usePortal } from './providers';
import { AppDetail } from './app-detail';
import type { App, IssuedCredential } from '../lib/types';
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../lib/client', () => ({
  api: { GET: get },
  networkProblem: vi.fn(),
  retrySeconds: () => 0,
}));
it('JSO-182 hands focus to Try your key, then its reference link', async () => {
  const user = userEvent.setup();
  const credential: IssuedCredential = {
    id: 'key',
    kind: 'api-key',
    status: 'active',
    keyHint: 'test',
    key: 'secret',
    headerName: 'apikey',
    createdAt: '2026-11-02T00:00:00Z',
  };
  const app = {
    id: 'app',
    teamId: 'team',
    role: 'admin',
    name: 'App',
    createdAt: credential.createdAt,
    subscriptions: [{ apiId: 'api', slug: 'sample', title: 'Sample' }],
    credentials: [credential],
  } as App;
  get.mockResolvedValue({ data: app });
  function Flow() {
    const { setReveal } = usePortal();
    useEffect(() => {
      setReveal({ app, credential, variant: 'additional' });
    }, []);
    return <AppDetail appId="app" />;
  }
  render(
    <Providers user={null}>
      <Flow />
    </Providers>,
  );
  await user.click(
    await screen.findByRole('button', { name: "I've saved it" }),
  );
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Try your key' })).toHaveFocus(),
  );
  await user.tab();
  expect(
    screen.getByRole('link', { name: 'Open Sample reference' }),
  ).toHaveFocus();
});
