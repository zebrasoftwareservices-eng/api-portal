// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { TeamBar, type Team } from './team-context';
import { CreateTeam, TeamPage } from './teams';
import { Invitation } from './invitation';
import { Dashboard } from './dashboard';
import { CreateApp } from './create-app';
import { AppDetail } from './app-detail';
vi.mock('./app-usage', () => ({ AppUsageCard: () => null }));
const m = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  signOut: vi.fn(),
  path: '/dashboard',
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: m.push, replace: m.replace, refresh: m.refresh }),
  usePathname: () => m.path,
}));
vi.mock('../lib/client', () => ({
  api: { GET: m.get, POST: m.post, PUT: m.put, PATCH: m.patch, DELETE: m.del },
  quietApi: { GET: m.get, POST: m.post },
  auth: { signOut: m.signOut },
  retrySeconds: () => 60,
  networkProblem: () => ({
    type: '/problems/network',
    status: 0,
    title: 'Network error',
  }),
}));
vi.mock('./providers', () => ({
  usePortal: () => ({
    user: { id: 'ana', email: 'ana@example.com' },
    reveal: null,
    setReveal: vi.fn(),
  }),
}));
const personal: Team = {
  id: 'personal',
  name: 'Personal',
  personal: true,
  role: 'admin',
  memberCount: 1,
  createdAt: '2026-11-10T00:00:00Z',
};
const payments: Team = {
  ...personal,
  id: 'payments',
  name: 'Payments',
  personal: false,
  memberCount: 2,
};
const members = [
  {
    userId: 'ana',
    name: 'Ana',
    email: 'ana@example.com',
    role: 'admin',
    joinedAt: personal.createdAt,
  },
  {
    userId: 'ben',
    name: 'Ben',
    email: 'ben@example.com',
    role: 'member',
    joinedAt: personal.createdAt,
  },
];
const detail = { ...payments, members, invitations: [] };
const preview = {
  teamName: 'Payments',
  role: 'member',
  email: 'ana@example.com',
  invitedByName: 'Ben',
  expiresAt: personal.createdAt,
  state: 'pending',
};
beforeEach(() => {
  vi.resetAllMocks();
  m.path = '/dashboard';
  m.get.mockImplementation(async (path) => ({
    data:
      path === '/v1/me'
        ? { id: 'ana', email: 'ana@example.com' }
        : path === '/v1/teams/{teamId}'
          ? detail
          : { items: [] },
  }));
  m.post.mockResolvedValue({ data: preview });
  m.put.mockResolvedValue({ response: new Response(null, { status: 204 }) });
});
it('switches teams through the SDK and scopes the app list to the selected team', async () => {
  const actor = userEvent.setup();
  render(
    <TeamBar
      initial={{ items: [personal, payments], currentTeamId: 'personal' }}
    >
      <Dashboard />
    </TeamBar>,
  );
  await actor.click(
    screen.getByRole('button', { name: 'Team: Personal. Switch team' }),
  );
  expect(
    screen.getAllByRole('menuitemradio').map((e) => e.textContent),
  ).toEqual(['✓PersonalAdmin', 'PaymentsAdmin']);
  await actor.click(screen.getByRole('menuitemradio', { name: /Payments/ }));
  await waitFor(() =>
    expect(m.put).toHaveBeenCalledWith('/v1/me/current-team', {
      body: { teamId: 'payments' },
    }),
  );
  await waitFor(() =>
    expect(m.get).toHaveBeenCalledWith('/v1/apps', {
      params: { query: { teamId: 'payments' } },
    }),
  );
  expect(screen.getByText('Switched to Payments.')).toBeInTheDocument();
});
it('shows a reload action when the team list is unavailable', async () => {
  const actor = userEvent.setup();
  render(
    <TeamBar>
      <p>Content</p>
    </TeamBar>,
  );
  await actor.click(screen.getByRole('button', { name: /Team: unavailable/ }));
  await actor.click(screen.getByRole('menuitem', { name: 'Try again' }));
  expect(m.refresh).toHaveBeenCalled();
});
it('hides app creation for Read-only and names the empty team', async () => {
  render(
    <TeamBar
      initial={{
        items: [{ ...payments, role: 'read-only' }],
        currentTeamId: 'payments',
      }}
    >
      <Dashboard />
    </TeamBar>,
  );
  expect(
    await screen.findByText('No apps in Payments yet'),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Create app' }),
  ).not.toBeInTheDocument();
});
it('prevents a Read-only user from accessing the create form', async () => {
  render(
    <TeamBar
      initial={{
        items: [{ ...payments, role: 'read-only' }],
        currentTeamId: 'payments',
      }}
    >
      <CreateApp />
    </TeamBar>,
  );
  expect(
    screen.queryByRole('button', { name: 'Create app and get key' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/Switch to another team or ask a team Admin/),
  ).toBeInTheDocument();
});
it('shows key metadata without any key mutation controls for Read-only', async () => {
  m.get.mockResolvedValue({
    data: {
      id: 'app',
      name: 'Client',
      teamId: 'payments',
      role: 'read-only',
      subscriptions: [],
      createdAt: personal.createdAt,
      credentials: [
        {
          id: 'key',
          keyHint: 'abcd',
          status: 'active',
          createdAt: personal.createdAt,
        },
      ],
    },
  });
  render(<AppDetail appId="app" />);
  expect(await screen.findByText('…abcd')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /Create key|Revoke/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('columnheader', { name: 'Actions' }),
  ).not.toBeInTheDocument();
});
it('validates and creates a trimmed team, then opens its settings', async () => {
  const actor = userEvent.setup();
  m.post.mockResolvedValue({ data: payments });
  render(<CreateTeam />);
  await actor.click(screen.getByRole('button', { name: 'Create team' }));
  expect(await screen.findByText('⚠ Enter a team name.')).toBeInTheDocument();
  expect(m.post).not.toHaveBeenCalled();
  await actor.type(screen.getByLabelText('Team name'), ' Payments ');
  await actor.click(screen.getByRole('button', { name: 'Create team' }));
  expect(m.post).toHaveBeenCalledWith('/v1/teams', {
    body: { name: 'Payments' },
  });
  expect(m.push).toHaveBeenCalledWith('/dashboard/teams/payments');
});
it.each(['member', 'read-only'])(
  'hides management for %s while allowing leave',
  async (role) => {
    m.get.mockResolvedValue({ data: { ...detail, role, invitations: null } });
    render(<TeamPage teamId="payments" />);
    expect(
      await screen.findByRole('table', { name: 'Members of Payments' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Actions for/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Invite people')).not.toBeInTheDocument();
    expect(screen.queryByText('Pending invitations')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Leave team…' }),
    ).toBeInTheDocument();
  },
);
it('keeps personal teams single-member in the UI', async () => {
  m.get.mockResolvedValue({ data: { ...detail, ...personal } });
  render(<TeamPage teamId="personal" />);
  expect(
    await screen.findByText('This is your personal team'),
  ).toBeInTheDocument();
  expect(screen.queryByText('Leave team…')).not.toBeInTheDocument();
  expect(screen.queryByText('Invite people')).not.toBeInTheDocument();
});
it('prevents the only Admin leaving before sending a mutation', async () => {
  const actor = userEvent.setup();
  render(<TeamPage teamId="payments" />);
  await actor.click(await screen.findByRole('button', { name: 'Leave team…' }));
  const dialog = screen.getByRole('alertdialog');
  expect(
    within(dialog).getByText('Payments needs another Admin'),
  ).toBeInTheDocument();
  expect(
    within(dialog).queryByRole('button', { name: 'Leave team' }),
  ).not.toBeInTheDocument();
  expect(m.del).not.toHaveBeenCalled();
});
it('sends normalized invitations and preserves a duplicate address with its field error', async () => {
  const actor = userEvent.setup();
  m.post.mockResolvedValue({
    error: {
      type: '/problems/already-member',
      status: 409,
      title: 'Already a member',
    },
  });
  render(<TeamPage teamId="payments" />);
  await actor.type(await screen.findByLabelText('Email'), ' BEN@example.com ');
  await actor.click(screen.getByRole('button', { name: 'Send invitation' }));
  expect(
    await screen.findByText('⚠ ben@example.com is already in this team.'),
  ).toBeInTheDocument();
  expect(m.post).toHaveBeenCalledWith('/v1/teams/{teamId}/invitations', {
    params: { path: { teamId: 'payments' } },
    body: { email: 'ben@example.com', role: 'member' },
  });
});
it.each([
  ['cancelled', 'This invitation was cancelled'],
  ['expired', 'This invitation has expired'],
  ['accepted', 'This invitation has already been used'],
])(
  'shows the %s invitation refusal without apps or an accept control',
  async (state, title) => {
    m.post.mockResolvedValue({ data: { ...preview, state } });
    render(<Invitation token="secret" />);
    expect(
      await screen.findByRole('heading', { name: title }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Accept invitation' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  },
);
it('preserves the invitation and invited email through sign-up and sign-in', async () => {
  m.get.mockResolvedValue({ error: { status: 401 } });
  render(<Invitation token="secret" />);
  const link = await screen.findByRole('link', { name: 'Create an account' });
  const url = new URL(link.getAttribute('href')!, 'https://portal.test');
  expect(url.searchParams.get('email')).toBe('ana@example.com');
  expect(url.searchParams.get('next')).toBe('/invitations/accept?token=secret');
});
it('never offers acceptance to the wrong account', async () => {
  m.get.mockResolvedValue({ data: { email: 'wrong@example.com' } });
  render(<Invitation token="secret" />);
  expect(
    await screen.findByRole('button', {
      name: 'Sign out and use another account',
    }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Accept invitation' }),
  ).not.toBeInTheDocument();
});
it('handles an invitation expiring between preview and acceptance', async () => {
  const actor = userEvent.setup();
  m.post.mockImplementation(async (path) =>
    path.endsWith('/preview')
      ? { data: preview }
      : {
          error: {
            type: '/problems/invitation-expired',
            title: 'Expired',
            status: 409,
          },
        },
  );
  render(<Invitation token="secret" />);
  await actor.click(
    await screen.findByRole('button', { name: 'Accept invitation' }),
  );
  expect(
    await screen.findByRole('heading', { name: 'This invitation has expired' }),
  ).toBeInTheDocument();
  expect(m.replace).not.toHaveBeenCalled();
});
it('accepts only by POST body and navigates to the current team apps', async () => {
  const actor = userEvent.setup();
  m.post.mockImplementation(async (path) => ({
    data: path.endsWith('/preview') ? preview : payments,
  }));
  render(<Invitation token="secret" />);
  await actor.click(
    await screen.findByRole('button', { name: 'Accept invitation' }),
  );
  expect(m.post).toHaveBeenCalledWith('/v1/invitations/accept', {
    body: { token: 'secret' },
  });
  expect(m.replace).toHaveBeenCalledWith('/dashboard');
});
it('rejects missing or unknown invitation tokens', async () => {
  render(<Invitation token="" />);
  expect(
    await screen.findByRole('heading', {
      name: "This invitation link doesn't work",
    }),
  ).toBeInTheDocument();
  expect(m.post).not.toHaveBeenCalled();
});

it('changes a member role only after the confirmation and refreshes the team', async () => {
  const actor = userEvent.setup();
  m.patch.mockResolvedValue({ data: { ...members[1], role: 'read-only' } });
  render(<TeamPage teamId="payments" />);
  await actor.click(
    await screen.findByRole('button', { name: 'Actions for Ben' }),
  );
  await actor.click(screen.getByRole('menuitem', { name: 'Change role…' }));
  const dialog = screen.getByRole('alertdialog');
  await actor.click(within(dialog).getByRole('radio', { name: /Read-only/ }));
  expect(m.patch).not.toHaveBeenCalled();
  await actor.click(within(dialog).getByRole('button', { name: 'Save role' }));
  await waitFor(() =>
    expect(m.patch).toHaveBeenCalledWith(
      '/v1/teams/{teamId}/members/{userId}',
      {
        params: { path: { teamId: 'payments', userId: 'ben' } },
        body: { role: 'read-only' },
      },
    ),
  );
});
it('removes only the selected membership after confirming keys keep working', async () => {
  const actor = userEvent.setup();
  m.del.mockResolvedValue({ response: new Response(null, { status: 204 }) });
  render(<TeamPage teamId="payments" />);
  await actor.click(
    await screen.findByRole('button', { name: 'Actions for Ben' }),
  );
  await actor.click(
    screen.getByRole('menuitem', { name: 'Remove from team…' }),
  );
  const dialog = screen.getByRole('alertdialog');
  expect(
    within(dialog).getByText(/Keys they created keep working/),
  ).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  await actor.click(
    within(dialog).getByRole('button', { name: 'Remove member' }),
  );
  expect(m.del).toHaveBeenCalledWith('/v1/teams/{teamId}/members/{userId}', {
    params: { path: { teamId: 'payments', userId: 'ben' } },
  });
});
it('hides key mutation controls after a role refusal and reloading the app', async () => {
  const actor = userEvent.setup();
  const app = {
    id: 'app',
    name: 'Client',
    teamId: 'payments',
    role: 'member',
    subscriptions: [],
    createdAt: personal.createdAt,
    credentials: [],
  };
  m.get
    .mockResolvedValueOnce({ data: app })
    .mockResolvedValue({ data: { ...app, role: 'read-only' } });
  m.post.mockResolvedValue({
    error: {
      type: '/problems/team-role-forbidden',
      title: 'Role changed',
      status: 403,
    },
    response: new Response(null, { status: 403 }),
  });
  render(<AppDetail appId="app" />);
  await actor.click(await screen.findByRole('button', { name: 'Create key' }));
  expect(
    await screen.findByText(
      'Your role in this team may have changed. No key was created or revoked.',
    ),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Create key' }),
    ).not.toBeInTheDocument(),
  );
});

it('remounts team settings when switching between dynamic team routes', async () => {
  const { default: Page } =
    await import('../app/dashboard/teams/[teamId]/page');
  const first = await Page({ params: Promise.resolve({ teamId: 'personal' }) });
  const second = await Page({
    params: Promise.resolve({ teamId: 'payments' }),
  });
  expect(first.key).toBe('personal');
  expect(second.key).toBe('payments');
  expect(second.props.teamId).toBe('payments');
});
