// SPDX-License-Identifier: Apache-2.0
import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  connect,
  migrate,
  user,
  teams,
  teamMembers,
  teamInvitations,
  apps,
  gateways,
  apis,
  apiVersions,
  credentials,
  accountSettings,
  rateLimitHits,
} from '@portal/db';
import { eq, and } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { Auth } from './auth.js';
import { registerTeams, ensurePersonalTeam } from './teams.js';
import { registerApps } from './apps.js';
import { deleteAccount } from './account.js';
import { problemHandler } from './problem.js';
import { loadConfig } from './config.js';
import { gatewayConnection } from './gateway-connection.js';
import type { GatewayAdapter } from '@portal/adapter-sdk';
import { processMail, type MailPayload } from './mail/queue.js';
import { renderMail } from './mail/templates.js';
let container: StartedPostgreSqlContainer;
let connection: ReturnType<typeof connect>;
const server = Fastify({ logger: false });
const config = loadConfig({
  SMTP_HOST: 'localhost',
  SMTP_SENDER_ADDRESS: 'portal@example.com',
});
const queued: MailPayload[] = [];
const adapter = {
  health: vi.fn(async () => ({ reachable: true })),
  ensureConsumer: vi.fn(async () => ({ id: uuidv7(), username: 'consumer' })),
  grantAccess: vi.fn(async () => {}),
  issueCredential: vi.fn(async () => ({ id: uuidv7() })),
  revokeCredential: vi.fn(async () => {}),
  deleteConsumer: vi.fn(async () => {}),
} as unknown as GatewayAdapter;
const admin = uuidv7(),
  member = uuidv7(),
  reader = uuidv7(),
  outsider = uuidv7();
const gatewayId = uuidv7(),
  apiId = uuidv7();
let teamId: string, appId: string, credentialId: string;
const auth = {
  api: {
    getSession: async ({ headers }: { headers: Headers }) => {
      const id = headers.get('x-user');
      if (!id) return null;
      const [person] = await connection.db
        .select()
        .from(user)
        .where(eq(user.id, id));
      return person ? { user: person } : null;
    },
  },
} as unknown as Auth;
const request = (
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  id = admin,
  payload?: object,
) =>
  server.inject({
    method,
    url: `/api/v1${url}`,
    headers: id ? { 'x-user': id } : {},
    payload,
  });
beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  await migrate(container.getConnectionUri());
  connection = connect(container.getConnectionUri());
  await connection.client`set client_min_messages to warning`;
  await connection.db.insert(gateways).values({
    id: gatewayId,
    name: 'test',
    kind: 'kong',
    adminUrl: 'http://kong:8001',
    proxyInternalUrl: 'http://kong:8000',
    proxyPublicUrl: 'http://localhost:8000',
  });
  await connection.db.insert(apis).values({
    id: apiId,
    slug: 'sample',
    gatewayId,
    gatewayServiceId: 'service',
    gatewayServiceName: 'service',
    routePath: '/sample',
  });
  await connection.db
    .insert(apiVersions)
    .values({ id: apiId, apiId, title: 'Sample', version: '1', document: {} });
  await connection.db
    .update(apis)
    .set({ latestVersionId: apiId })
    .where(eq(apis.id, apiId));
  problemHandler(server);
  registerTeams(server, connection.db, auth, config, async (p) => {
    queued.push(p);
  });
  registerApps(
    server,
    connection.db,
    auth,
    gatewayConnection(
      connection.db,
      config,
      uuidv7(),
      server.log,
      () => adapter,
    ),
  );
});
afterAll(async () => {
  await server.close();
  await connection?.client.end();
  await container?.stop();
});
beforeEach(async () => {
  await connection.client`truncate apps,teams,rate_limit_hits,mail_settings cascade`;
  await connection.db.delete(user);
  await connection.db
    .update(accountSettings)
    .set({ requireVerifiedEmail: false });
  for (const [id, name] of [
    [admin, 'Admin'],
    [member, 'Member'],
    [reader, 'Reader'],
    [outsider, 'Outsider'],
  ]) {
    await connection.db.insert(user).values({
      id: id!,
      name: name!,
      email: `${name!.toLowerCase()}@example.com`,
      role: 'developer',
    });
    await ensurePersonalTeam(connection.db, id!);
  }
  teamId = uuidv7();
  appId = uuidv7();
  credentialId = uuidv7();
  await connection.db
    .insert(teams)
    .values({ id: teamId, name: 'Shared', createdBy: admin });
  await connection.db.insert(teamMembers).values([
    { teamId, userId: admin, role: 'admin' },
    { teamId, userId: member, role: 'member' },
    { teamId, userId: reader, role: 'read-only' },
  ]);
  await connection.db
    .insert(apps)
    .values({ id: appId, teamId, createdBy: admin, name: 'Existing' });
  await connection.db.insert(credentials).values({
    id: credentialId,
    appId,
    gatewayId,
    keyHint: '1234',
    status: 'active',
  });
  queued.length = 0;
  vi.clearAllMocks();
});
it('creates personal teams idempotently and switches current teams with contract shapes', async () => {
  const personalId = await ensurePersonalTeam(connection.db, admin);
  await Promise.all(
    [1, 2, 3].map(() =>
      connection.db.transaction((tx) => ensurePersonalTeam(tx, admin)),
    ),
  );
  expect(
    await connection.db
      .select()
      .from(teams)
      .where(eq(teams.personalOwnerId, admin)),
  ).toHaveLength(1);
  const created = await request('POST', '/teams', admin, {
    name: '  New team  ',
  });
  expect(created.statusCode, created.body).toBe(201);
  expect(created.json()).toMatchObject({
    name: 'New team',
    personal: false,
    role: 'admin',
    memberCount: 1,
  });
  const list = (await request('GET', '/teams')).json();
  expect(list.currentTeamId).toBe(created.json().id);
  expect(list.items[0].id).toBe(personalId);
  expect(
    (await request('PUT', '/me/current-team', admin, { teamId: personalId }))
      .statusCode,
  ).toBe(204);
  expect((await request('GET', '/teams')).json().currentTeamId).toBe(
    personalId,
  );
  expect(
    (await request('PUT', '/me/current-team', outsider, { teamId })).statusCode,
  ).toBe(404);
  expect(
    (await request('POST', '/teams', admin, { name: '  ' })).statusCode,
  ).toBe(400);
});
it('enforces app role access before verification or gateway calls and hides nonmembers', async () => {
  await connection.db
    .update(accountSettings)
    .set({ requireVerifiedEmail: true });
  for (const id of [admin, member, reader, outsider]) {
    const read = await request('GET', `/apps/${appId}`, id);
    expect(read.statusCode).toBe(id === outsider ? 404 : 200);
    if (id !== outsider)
      expect(read.json()).toMatchObject({
        teamId,
        role: id === admin ? 'admin' : id === member ? 'member' : 'read-only',
      });
  }
  for (const [id, status, code] of [
    [reader, 403, 'team-role-forbidden'],
    [outsider, 404, 'not-found'],
  ] as const) {
    for (const [method, path, payload] of [
      ['POST', '/apps', { teamId, name: 'Forbidden', apiIds: [apiId] }],
      ['POST', `/apps/${appId}/credentials`, {}],
      ['DELETE', `/apps/${appId}/credentials/${credentialId}`, undefined],
    ] as const) {
      const response = await request(method, path, id, payload);
      expect(response.statusCode, response.body).toBe(status);
      expect(response.json().type).toBe(`/problems/${code}`);
    }
  }
  expect(adapter.ensureConsumer).not.toHaveBeenCalled();
  expect(adapter.revokeCredential).not.toHaveBeenCalled();
  expect((await connection.db.select().from(credentials))[0]!.status).toBe(
    'active',
  );
  const denied = await request(
    'POST',
    `/apps/${appId}/credentials`,
    member,
    {},
  );
  expect(denied.json().type).toBe('/problems/email-not-verified');
  expect(
    (await request('GET', `/apps?teamId=${teamId}`, reader)).json().items,
  ).toHaveLength(1);
  expect(
    (await request('GET', `/apps?teamId=${teamId}`, outsider)).statusCode,
  ).toBe(404);
});
it('allows Admins and Members to create and revoke keys with team-wide app names', async () => {
  for (const id of [admin, member]) {
    const created = await request('POST', '/apps', id, {
      teamId,
      name: `App ${id}`,
      apiIds: [apiId],
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json().app.teamId).toBe(teamId);
    const key = await request(
      'POST',
      `/apps/${created.json().app.id}/credentials`,
      id,
      {},
    );
    expect(key.statusCode, key.body).toBe(201);
    expect(
      (
        await request(
          'DELETE',
          `/apps/${created.json().app.id}/credentials/${key.json().id}`,
          id,
        )
      ).statusCode,
    ).toBe(204);
  }
  const duplicate = await request('POST', '/apps', member, {
    teamId,
    name: 'Existing',
    apiIds: [apiId],
  });
  expect(duplicate.statusCode).toBe(409);
  expect(duplicate.json().type).toBe('/problems/app-name-taken');
});
it('guards member mutations, serializes concurrent demotions and preserves shared credentials on removal', async () => {
  for (const id of [member, reader, outsider]) {
    for (const method of ['PATCH', 'DELETE'] as const) {
      const response = await request(
        method,
        `/teams/${teamId}/members/${admin}`,
        id,
        method === 'PATCH' ? { role: 'member' } : undefined,
      );
      expect(response.statusCode).toBe(id === outsider ? 404 : 403);
    }
  }
  expect(
    (await request('DELETE', `/teams/${teamId}/members/${admin}`)).json().type,
  ).toBe('/problems/team-needs-admin');
  await request('PATCH', `/teams/${teamId}/members/${member}`, admin, {
    role: 'admin',
  });
  const results = await Promise.all([
    request('PATCH', `/teams/${teamId}/members/${member}`, admin, {
      role: 'member',
    }),
    request('PATCH', `/teams/${teamId}/members/${admin}`, member, {
      role: 'member',
    }),
  ]);
  expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
  expect(
    await connection.db
      .select()
      .from(teamMembers)
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, 'admin')),
      ),
  ).toHaveLength(1);
  expect(
    (await request('DELETE', `/teams/${teamId}/members/${reader}`, reader))
      .statusCode,
  ).toBe(204);
  expect((await request('GET', `/apps/${appId}`, reader)).statusCode).toBe(404);
  expect(await connection.db.select().from(credentials)).toHaveLength(1);
  expect(adapter.deleteConsumer).not.toHaveBeenCalled();
});
async function invite(email = 'outsider@example.com') {
  const response = await request(
    'POST',
    `/teams/${teamId}/invitations`,
    admin,
    { email, role: 'member' },
  );
  expect(response.statusCode, response.body).toBe(201);
  return {
    id: response.json().id as string,
    token: new URL(queued.at(-1)!.link).searchParams.get('token')!,
  };
}
it('normalizes invitations, previews safely, verifies the accepting address and refuses token reuse', async () => {
  const invitation = await invite('  OUTSIDER@EXAMPLE.COM  ');
  expect(
    (
      await request('POST', '/invitations/preview', '', {
        token: invitation.token,
      })
    ).json(),
  ).toMatchObject({
    teamName: 'Shared',
    email: 'outsider@example.com',
    role: 'member',
    invitedByName: 'Admin',
    state: 'pending',
  });
  expect(
    (await request('GET', `/teams/${teamId}`, member)).json().invitations,
  ).toBeNull();
  expect(
    (await request('GET', `/teams/${teamId}`)).json().invitations,
  ).toHaveLength(1);
  const wrong = await request('POST', '/invitations/accept', reader, {
    token: invitation.token,
  });
  expect(wrong.json().type).toBe('/problems/invitation-wrong-account');
  expect(
    (await connection.db.select().from(teamInvitations))[0]!.acceptedAt,
  ).toBeNull();
  expect(
    (
      await request('POST', '/invitations/accept', outsider, {
        token: invitation.token,
      })
    ).statusCode,
  ).toBe(200);
  expect((await request('GET', '/teams', outsider)).json().currentTeamId).toBe(
    teamId,
  );
  expect(
    (await connection.db.select().from(user).where(eq(user.id, outsider)))[0]!
      .emailVerified,
  ).toBe(true);
  expect(
    (
      await request('POST', '/invitations/accept', outsider, {
        token: invitation.token,
      })
    ).json().type,
  ).toBe('/problems/invitation-used');
  expect(
    (
      await request('DELETE', `/teams/${teamId}/invitations/${invitation.id}`)
    ).json().type,
  ).toBe('/problems/invitation-used');
  expect(adapter.ensureConsumer).not.toHaveBeenCalled();
});
it('rejects invitation duplicates, bad roles, personal-team invites and missing mail before storing anything', async () => {
  expect(
    (
      await request('POST', `/teams/${teamId}/invitations`, admin, {
        email: 'member@example.com',
        role: 'member',
      })
    ).json().type,
  ).toBe('/problems/already-member');
  const personal = await ensurePersonalTeam(connection.db, admin);
  expect(
    (
      await request('POST', `/teams/${personal}/invitations`, admin, {
        email: 'outsider@example.com',
        role: 'member',
      })
    ).json().type,
  ).toBe('/problems/personal-team');
  expect(
    (
      await request('POST', `/teams/${teamId}/invitations`, admin, {
        email: 'outsider@example.com',
        role: 'owner',
      })
    ).statusCode,
  ).toBe(400);
  for (const id of [member, reader, outsider]) {
    expect(
      (
        await request('POST', `/teams/${teamId}/invitations`, id, {
          email: 'other@example.com',
          role: 'member',
        })
      ).statusCode,
    ).toBe(id === outsider ? 404 : 403);
  }
  const oldHost = config.SMTP_HOST;
  config.SMTP_HOST = undefined;
  expect(
    (
      await request('POST', `/teams/${teamId}/invitations`, admin, {
        email: 'outsider@example.com',
        role: 'member',
      })
    ).json().type,
  ).toBe('/problems/mail-not-configured');
  config.SMTP_HOST = oldHost;
  expect(await connection.db.select().from(teamInvitations)).toHaveLength(0);
  await invite();
  expect(
    (
      await request('POST', `/teams/${teamId}/invitations`, admin, {
        email: 'Outsider@example.com',
        role: 'member',
      })
    ).json().type,
  ).toBe('/problems/invitation-pending');
});
it('makes cancellation idempotent and refuses cancelled, expired and unknown tokens without writes', async () => {
  const cancelled = await invite();
  for (let i = 0; i < 2; i++)
    expect(
      (await request('DELETE', `/teams/${teamId}/invitations/${cancelled.id}`))
        .statusCode,
    ).toBe(204);
  expect(
    (
      await request('POST', '/invitations/accept', outsider, {
        token: cancelled.token,
      })
    ).json().type,
  ).toBe('/problems/invitation-cancelled');
  const expired = await invite();
  await connection.db
    .update(teamInvitations)
    .set({ expiresAt: new Date(0) })
    .where(eq(teamInvitations.id, expired.id));
  expect(
    (
      await request('POST', '/invitations/accept', outsider, {
        token: expired.token,
      })
    ).json().type,
  ).toBe('/problems/invitation-expired');
  expect(
    (
      await request('POST', '/invitations/preview', '', {
        token: expired.token,
      })
    ).json().state,
  ).toBe('expired');
  expect(
    (await request('POST', '/invitations/preview', '', { token: 'unknown' }))
      .statusCode,
  ).toBe(404);
  expect(
    await connection.db
      .select()
      .from(teamMembers)
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, outsider)),
      ),
  ).toHaveLength(0);
  await invite(); // Replaces the expired pending row before inserting.
  const log = { warn: vi.fn() };
  await processMail(connection.db, config, log as never, {
    id: uuidv7(),
    data: {
      template: 'team-invitation',
      invitationId: cancelled.id,
      to: 'outsider@example.com',
      link: 'not-encrypted',
    },
  });
  expect(log.warn).not.toHaveBeenCalled();
});
it('limits invitations to 20 per user per hour and renders escaped invitation mail', async () => {
  for (let i = 0; i < 20; i++) await invite(`invite${i}@example.com`);
  const response = await request(
    'POST',
    `/teams/${teamId}/invitations`,
    admin,
    { email: 'extra@example.com', role: 'member' },
  );
  expect(response.statusCode).toBe(429);
  expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  expect(await connection.db.select().from(teamInvitations)).toHaveLength(20);
  expect(await connection.db.select().from(rateLimitHits)).toHaveLength(20);
  const mail = renderMail('team-invitation', {
    name: '',
    email: 'person@example.com',
    link: 'https://portal.example/accept?token=abc',
    portalUrl: 'https://portal.example',
    teamName: '<script>Team</script>',
    inviterName: 'A & B',
    role: 'member',
    expiresAt: '2030-01-01',
  });
  expect(mail.text).toContain('2030-01-01');
  expect(mail.html).toContain('&lt;script&gt;');
  expect(mail.html).not.toContain('<script>');
});
it('refuses account deletion before gateway calls for the last Admin and preserves shared apps otherwise', async () => {
  await expect(
    deleteAccount(connection.db, adapter, { id: admin, role: 'developer' }),
  ).rejects.toMatchObject({
    code: 'team-needs-admin',
    fields: { teams: [{ id: teamId, name: 'Shared' }] },
  });
  expect(adapter.health).not.toHaveBeenCalled();
  await connection.db
    .update(teamMembers)
    .set({ role: 'admin' })
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, member)));
  const personalTeam = await ensurePersonalTeam(connection.db, admin);
  const personalApp = uuidv7();
  await connection.db.insert(apps).values({
    id: personalApp,
    teamId: personalTeam,
    createdBy: admin,
    name: 'Private',
  });
  const soleTeam = uuidv7(),
    soleApp = uuidv7();
  await connection.db
    .insert(teams)
    .values({ id: soleTeam, name: 'Alone', createdBy: admin });
  await connection.db
    .insert(teamMembers)
    .values({ teamId: soleTeam, userId: admin, role: 'admin' });
  await connection.db
    .insert(apps)
    .values({ id: soleApp, teamId: soleTeam, createdBy: admin, name: 'Sole' });
  await deleteAccount(connection.db, adapter, { id: admin, role: 'developer' });
  expect(adapter.deleteConsumer).toHaveBeenCalledTimes(2);
  expect(adapter.deleteConsumer).toHaveBeenCalledWith({ id: personalApp });
  expect(adapter.deleteConsumer).toHaveBeenCalledWith({ id: soleApp });
  expect(await connection.db.select().from(apps)).toMatchObject([
    { id: appId, teamId, createdBy: null },
  ]);
  expect(await connection.db.select().from(credentials)).toHaveLength(1);
});

it('rejects expired sessions and every non-admin management operation without database or gateway changes', async () => {
  const invitation = await invite();
  const snapshot = async () => ({
    teams: await connection.client`select * from teams order by id`,
    members:
      await connection.client`select * from team_members order by team_id,user_id`,
    invitations:
      await connection.client`select * from team_invitations order by id`,
    apps: await connection.client`select * from apps order by id`,
    keys: await connection.client`select * from credentials order by id`,
  });
  for (const id of [member, reader, outsider, '']) {
    for (const [method, path, payload] of [
      [
        'POST',
        `/teams/${teamId}/invitations`,
        { email: 'new@example.com', role: 'member' },
      ],
      ['DELETE', `/teams/${teamId}/invitations/${invitation.id}`, undefined],
      ['PATCH', `/teams/${teamId}/members/${admin}`, { role: 'read-only' }],
      ['DELETE', `/teams/${teamId}/members/${admin}`, undefined],
    ] as const) {
      const before = await snapshot();
      const denied = await request(method, path, id, payload);
      expect(denied.statusCode, denied.body).toBe(
        !id ? 401 : id === outsider ? 404 : 403,
      );
      expect(denied.headers['content-type']).toContain(
        'application/problem+json',
      );
      expect(await snapshot()).toEqual(before);
      expect(adapter.ensureConsumer).not.toHaveBeenCalled();
      expect(adapter.issueCredential).not.toHaveBeenCalled();
      expect(adapter.revokeCredential).not.toHaveBeenCalled();
      expect(adapter.deleteConsumer).not.toHaveBeenCalled();
    }
  }
});

it('refuses last-admin demotion, self-removal and leave without changing membership', async () => {
  for (const method of ['PATCH', 'DELETE'] as const) {
    const denied = await request(
      method,
      `/teams/${teamId}/members/${admin}`,
      admin,
      method === 'PATCH' ? { role: 'read-only' } : undefined,
    );
    expect(denied.statusCode).toBe(409);
    expect(denied.json().type).toBe('/problems/team-needs-admin');
  }
  expect(
    (await request('GET', `/teams/${teamId}`))
      .json()
      .members.find((m: { userId: string }) => m.userId === admin).role,
  ).toBe('admin');
});
