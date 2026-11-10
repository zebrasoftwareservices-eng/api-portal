// SPDX-License-Identifier: Apache-2.0
import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import { request as httpRequest } from 'node:http';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  connect,
  instanceSettings,
  gateways,
  migrate,
  user,
  apps,
  accountSettings,
  emailChangeRequests,
  rateLimitHits,
  mailSettings,
  account,
  session,
} from '@portal/db';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import {
  GatewayUnavailableError,
  type GatewayAdapter,
} from '@portal/adapter-sdk';
import { createApp } from './app.js';
import { createAuth } from './auth.js';
import { loadConfig } from './config.js';
import { deleteAccount } from './account.js';
import { storedTokenUnavailable } from './gateway-connection.js';
import { housekeeping } from './auth-limits.js';
import { mailQueue, processMail, type MailPayload } from './mail/queue.js';
import { decrypt, encrypt } from './crypto.js';
const config = loadConfig();
let container: StartedPostgreSqlContainer;
let connection: ReturnType<typeof connect>;
let server: Awaited<ReturnType<typeof createApp>>['app'];
let auth: ReturnType<typeof createAuth>;
let listeningUrl: URL;
const queued: MailPayload[] = [];
const enqueue = async (p: MailPayload) => {
  queued.push(p);
};
const adapter = {
  health: vi.fn(async () => ({ reachable: true })),
  deleteConsumer: vi.fn(async () => {}),
  kind: 'kong',
} as unknown as GatewayAdapter;
const replacementAdapter = {
  health: vi.fn(async () => ({ reachable: true })),
  deleteConsumer: vi.fn(async () => {}),
  kind: 'kong',
} as unknown as GatewayAdapter;
beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  connection = connect(container.getConnectionUri());
  await migrate(container.getConnectionUri());
  await connection.db
    .insert(instanceSettings)
    .values({ id: 1, instanceId: uuidv7() });
  await connection.db.insert(gateways).values({
    id: uuidv7(),
    name: 'default',
    kind: 'kong',
    adminUrl: 'http://kong:8001',
    proxyInternalUrl: 'http://kong:8000',
    proxyPublicUrl: 'http://localhost:8000',
  });
  auth = createAuth(connection.db, config, enqueue);
  ({ app: server } = await createApp({
    db: connection.db,
    config,
    auth,
    enqueueMail: enqueue,
    adapterFor: (row) =>
      row.adminUrl === 'http://replacement:8001' ? replacementAdapter : adapter,
    logger: false,
  }));
  listeningUrl = new URL(await server.listen({ host: '127.0.0.1', port: 0 }));
});
afterAll(async () => {
  await server?.close();
  await connection?.client.end();
  await container?.stop();
});
beforeEach(async () => {
  queued.length = 0;
  vi.mocked(replacementAdapter.deleteConsumer).mockReset().mockResolvedValue();
  await connection.db
    .update(gateways)
    .set({ adminUrl: 'http://kong:8001', enabled: true });
  vi.mocked(adapter.health).mockResolvedValue({
    reachable: true,
    latencyMs: 1,
  });
  vi.mocked(adapter.deleteConsumer).mockReset().mockResolvedValue();
  await connection.client`set client_min_messages to warning`;
  await connection.client`truncate "user",rate_limit_hits,mail_settings cascade`;
  await connection.db.update(accountSettings).set({
    requireVerifiedEmail: false,
    signInFailureMax: 10,
    resetEmailMax: 3,
    verificationEmailMax: 3,
  });
});
async function signup(email = 'person@example.com') {
  // Production requires first-admin setup before public signup; keep that fixture
  // temporary so deletion tests still assert exactly their own users.
  const bootstrapId = uuidv7();
  await connection.db.insert(user).values({
    id: bootstrapId,
    name: 'Bootstrap',
    email: `${bootstrapId}@example.com`,
    role: 'admin',
    emailVerified: true,
  });
  const response = await server.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email, name: 'Person', password: 'password123' },
  });
  await connection.db.delete(user).where(eq(user.id, bootstrapId));
  expect(response.statusCode, response.body).toBe(200);
  const cookie = response.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  return {
    cookie,
    id: response.json().user.id as string,
    email,
    role: 'developer',
  };
}
async function request(
  method: 'POST' | 'GET' | 'PATCH' | 'DELETE' | 'PUT',
  url: string,
  payload?: unknown,
  cookie?: string,
) {
  return server.inject({
    method,
    url,
    payload: payload as Record<string, unknown>,
    headers: cookie ? { cookie } : {},
  });
}
// Pass the raw path to node:http: inject and URL constructors normalize dot
// segments before Fastify can see the request and would hide this regression.
async function rawPost(
  path: string,
  payload: Record<string, unknown>,
  cookie?: string,
) {
  return new Promise<{
    status: number;
    headers: import('node:http').IncomingHttpHeaders;
    body: string;
  }>((resolve, reject) => {
    const outgoing = httpRequest(
      {
        hostname: listeningUrl.hostname,
        port: listeningUrl.port,
        method: 'POST',
        path,
        headers: {
          'content-type': 'application/json',
          ...(cookie ? { cookie } : {}),
        },
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.on('end', () =>
          resolve({
            status: response.statusCode!,
            headers: response.headers,
            body,
          }),
        );
        response.on('error', reject);
      },
    );
    outgoing.on('error', reject);
    outgoing.setTimeout(10000, () =>
      outgoing.destroy(new Error('HTTP request timed out')),
    );
    outgoing.end(JSON.stringify(payload));
  });
}
it('signs up unverified, queues verification and verifies a fresh link', async () => {
  const person = await signup();
  expect(queued).toHaveLength(1);
  expect(queued[0]!.template).toBe('verify');
  const profile = await request('GET', '/api/v1/me', undefined, person.cookie);
  expect(profile.json()).toMatchObject({
    emailVerified: false,
    pendingEmail: null,
    verificationRequired: false,
  });
  const link = new URL(queued[0]!.link);
  const verify = await request('GET', link.pathname + link.search);
  expect(verify.statusCode).toBe(302);
  expect((await connection.db.select().from(user))[0]!.emailVerified).toBe(
    true,
  );
});
it('guards apps and keys before gateway writes, and refuses enabling mail-less verification', async () => {
  const person = await signup();
  await connection.db
    .update(accountSettings)
    .set({ requireVerifiedEmail: true });
  for (const url of ['/api/v1/apps', `/api/v1/apps/${uuidv7()}/credentials`]) {
    const response = await request('POST', url, {}, person.cookie);
    expect(response.statusCode).toBe(403);
    expect(response.json().type).toBe('/problems/email-not-verified');
  }
  await connection.db
    .update(user)
    .set({ role: 'admin' })
    .where(eq(user.id, person.id));
  const response = await request(
    'PUT',
    '/api/v1/admin/settings/accounts',
    {
      requireVerifiedEmail: true,
      rateLimits: {
        signInFailures: { max: 10, windowMinutes: 15 },
        passwordResetEmails: { max: 3, windowMinutes: 60 },
        verificationEmails: { max: 3, windowMinutes: 60 },
      },
    },
    person.cookie,
  );
  expect(response.statusCode).toBe(409);
});
it('email change rejects replaced, expired, reused and concurrently taken tokens', async () => {
  const person = await signup();
  const change = async (email: string) => {
    const result = await request(
      'POST',
      '/api/v1/me/email',
      { newEmail: email },
      person.cookie,
    );
    expect(result.statusCode, result.body).toBe(202);
    return new URL(queued.at(-1)!.link).searchParams.get('token')!;
  };
  const first = await change('new@example.com');
  const second = await change('newer@example.com');
  expect(
    (await request('POST', '/api/v1/me/email/confirm', { token: first }))
      .statusCode,
  ).toBe(400);
  await connection.db
    .update(emailChangeRequests)
    .set({ expiresAt: new Date(0) });
  expect(
    (await request('POST', '/api/v1/me/email/confirm', { token: second }))
      .statusCode,
  ).toBe(400);
  const third = await change('final@example.com');
  await signup('final@example.com');
  expect(
    (await request('POST', '/api/v1/me/email/confirm', { token: third }))
      .statusCode,
  ).toBe(409);
  await connection.db.delete(user).where(eq(user.email, 'final@example.com'));
  const confirmed = await request('POST', '/api/v1/me/email/confirm', {
    token: third,
  });
  expect(confirmed.statusCode, confirmed.body).toBe(200);
  expect(confirmed.json().email).toBe('final@example.com');
  expect(
    (await request('POST', '/api/v1/me/email/confirm', { token: third }))
      .statusCode,
  ).toBe(400);
  expect(
    (
      await request('POST', '/api/auth/sign-in/email', {
        email: person.email,
        password: 'password123',
      })
    ).statusCode,
  ).toBe(401);
  expect(
    (
      await request('POST', '/api/auth/sign-in/email', {
        email: 'final@example.com',
        password: 'password123',
      })
    ).statusCode,
  ).toBe(200);
});
it('counts unknown reset addresses, commits failed sign-ins and applies changed limits immediately', async () => {
  const person = await signup();
  await connection.db.update(accountSettings).set({ signInFailureMax: 2 });
  for (let i = 0; i < 2; i++)
    expect(
      (
        await request('POST', '/api/auth/sign-in/email', {
          email: person.email,
          password: 'wrong',
        })
      ).statusCode,
    ).toBe(401);
  let response = await request('POST', '/api/auth/sign-in/email', {
    email: person.email,
    password: 'password123',
  });
  expect(response.statusCode).toBe(429);
  expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  await connection.db.update(accountSettings).set({ signInFailureMax: 3 });
  expect(
    (
      await request('POST', '/api/auth/sign-in/email', {
        email: person.email,
        password: 'password123',
      })
    ).statusCode,
  ).toBe(200);
  for (let i = 0; i < 3; i++)
    expect(
      (
        await request('POST', '/api/auth/request-password-reset', {
          email: 'missing@example.com',
          redirectTo: '/reset-password',
        })
      ).statusCode,
    ).toBe(200);
  response = await request('POST', '/api/auth/request-password-reset', {
    email: 'missing@example.com',
    redirectTo: '/reset-password',
  });
  expect(response.statusCode).toBe(429);
  expect(queued).toHaveLength(1);
  expect(
    (
      await request('POST', '/api/auth/forget-password', {
        email: person.email,
      })
    ).statusCode,
  ).toBe(404);
});
it.each([
  '/api/auth/sign-in/email',
  '/api/auth/sign-in//email',
  '/api/auth//sign-in/email',
  '/api/auth/sign-in/email/',
])('applies the shared sign-in limit to %s', async (url) => {
  await connection.db.update(accountSettings).set({ signInFailureMax: 1 });
  const payload = { email: 'missing@example.com', password: 'wrong' };
  const failed = await request('POST', url, payload);
  expect(failed.statusCode, failed.body).toBe(401);
  const blocked = await request('POST', '/api/auth/sign-in/email', payload);
  expect(blocked.statusCode, blocked.body).toBe(429);
  expect(blocked.headers['content-type']).toContain('application/problem+json');
  expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  expect(await connection.db.select().from(rateLimitHits)).toHaveLength(1);
});
it.each([
  '/api/auth/sign-in/./email',
  '/api/auth/x/../sign-in/email',
  '/api/auth/sign-in/%2e/email',
  '/api/auth/x/%2E%2E/sign-in/email',
  '/api/auth/./request-password-reset',
  '/api/auth/x/../request-password-reset',
  '/api/auth/%2e/request-password-reset',
  '/api/auth/x/%2E%2E/request-password-reset',
])(
  'shares the canonical auth limit over real HTTP for raw path %s',
  async (path) => {
    const reset = path.endsWith('request-password-reset');
    await connection.db
      .update(accountSettings)
      .set({ signInFailureMax: 1, resetEmailMax: 1 });
    const person = await signup();
    queued.length = 0;
    const payload = {
      email: person.email,
      password: 'wrong',
      redirectTo: '/reset-password',
    };
    const first = await rawPost(path, payload);
    expect(first.status, first.body).toBe(reset ? 200 : 401);
    const canonical = reset
      ? '/api/auth/request-password-reset'
      : '/api/auth/sign-in/email';
    for (const blockedPath of [canonical, path]) {
      const blocked = await rawPost(blockedPath, payload);
      expect(blocked.status, blocked.body).toBe(429);
      expect(blocked.headers['content-type']).toContain(
        'application/problem+json',
      );
      expect(JSON.parse(blocked.body).type).toBe('/problems/rate-limited');
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    }
    expect(await connection.db.select().from(rateLimitHits)).toHaveLength(1);
    expect(queued).toHaveLength(reset ? 1 : 0);
  },
);
it.each(['/api/auth/send-verification-email', '/api/auth/change-password'])(
  'counts raw dot paths for signed-in %s requests',
  async (canonical) => {
    const person = await signup();
    queued.length = 0;
    await connection.db.update(accountSettings).set({
      verificationEmailMax: 1,
      signInFailureMax: 1,
    });
    const verification = canonical.endsWith('send-verification-email');
    const payload = verification
      ? { email: person.email }
      : {
          currentPassword: 'incorrect-password',
          newPassword: 'Must-not-change-123',
        };
    const route = canonical.split('/').pop()!;
    const first = await rawPost(
      `/api/auth/x/%2E%2E/${route}`,
      payload,
      person.cookie,
    );
    expect(first.status, first.body).toBe(verification ? 200 : 400);
    for (const path of [
      canonical,
      `/api/auth/./${route}`,
      `/api/auth/%2e/${route}`,
    ]) {
      const blocked = await rawPost(path, payload, person.cookie);
      expect(blocked.status, blocked.body).toBe(429);
      expect(blocked.headers['content-type']).toContain(
        'application/problem+json',
      );
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    }
    expect(await connection.db.select().from(rateLimitHits)).toHaveLength(1);
    expect(queued).toHaveLength(verification ? 1 : 0);
    expect(
      (await request('GET', '/api/v1/me', undefined, person.cookie)).statusCode,
    ).toBe(200);
  },
);
it.each([
  '/api/auth/./forget-password',
  '/api/auth/x/../forget-password',
  '/api/auth/%2e/forget-password',
])(
  'keeps the reset alias disabled over real HTTP for raw path %s',
  async (path) => {
    const response = await rawPost(path, { email: 'missing@example.com' });
    expect(response.status, response.body).toBe(404);
    expect(queued).toHaveLength(0);
  },
);
it.each(['same', 'different'])(
  'finishes more parallel sign-ins than pool connections for %s addresses',
  async (mode) => {
    // connect() has max: 10. Each admitted request must free its reservation
    // transaction before Better Auth queries that very same pool.
    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        request('POST', '/api/auth/sign-in/email', {
          email: `missing${mode === 'same' ? '' : index}@example.com`,
          password: 'wrong',
        }),
      ),
    );
    expect(responses.filter((r) => r.statusCode === 401)).toHaveLength(
      mode === 'same' ? 10 : 12,
    );
    expect(responses.filter((r) => r.statusCode === 429)).toHaveLength(
      mode === 'same' ? 2 : 0,
    );
    expect(await connection.db.select().from(rateLimitHits)).toHaveLength(
      mode === 'same' ? 10 : 12,
    );
    // The pool remains usable after every response has finished.
    expect(await connection.client`select 1 as alive`).toMatchObject([
      { alive: 1 },
    ]);
  },
  20000,
);
it('releases non-password refusals and clears failures after successful sign-in', async () => {
  const person = await signup();
  const invalid = await request('POST', '/api/auth/sign-in/email', {
    email: person.email,
  });
  expect(invalid.statusCode).toBe(400);
  expect(await connection.db.select().from(rateLimitHits)).toHaveLength(0);
  await request('POST', '/api/auth/sign-in/email', {
    email: person.email,
    password: 'wrong',
  });
  expect(await connection.db.select().from(rateLimitHits)).toHaveLength(1);
  const success = await request('POST', '/api/auth/sign-in/email', {
    email: person.email,
    password: 'password123',
  });
  expect(success.statusCode, success.body).toBe(200);
  expect(await connection.db.select().from(rateLimitHits)).toHaveLength(0);
});
it('serializes concurrent reset requests and expires old hits and email changes', async () => {
  const responses = await Promise.all(
    Array.from({ length: 8 }, () =>
      request('POST', '/api/auth/request-password-reset', {
        email: 'unknown@example.com',
        redirectTo: '/reset-password',
      }),
    ),
  );
  expect(responses.filter((r) => r.statusCode === 200)).toHaveLength(3);
  expect(responses.filter((r) => r.statusCode === 429)).toHaveLength(5);
  await connection.db.update(rateLimitHits).set({ createdAt: new Date(0) });
  await housekeeping(connection.db);
  expect(await connection.db.select().from(rateLimitHits)).toHaveLength(0);
});
it.each(['request-password-reset', 'send-verification-email'])(
  'finishes 12 simultaneous %s requests without exhausting the pool or over-sending',
  async (route) => {
    const person = await signup();
    queued.length = 0;
    const responses = await Promise.all(
      Array.from({ length: 12 }, () =>
        request('POST', `/api/auth/${route}`, {
          email: person.email,
          redirectTo: '/reset-password',
          callbackURL: '/profile',
        }),
      ),
    );
    expect(responses.filter((r) => r.statusCode === 200)).toHaveLength(3);
    const refused = responses.filter((r) => r.statusCode === 429);
    expect(refused).toHaveLength(9);
    for (const response of refused) {
      expect(response.headers['content-type']).toContain(
        'application/problem+json',
      );
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    }
    expect(queued).toHaveLength(3);
    expect(await connection.db.select().from(rateLimitHits)).toHaveLength(3);
    expect(await connection.client`select 1 as alive`).toMatchObject([
      { alive: 1 },
    ]);
  },
  20000,
);
it('finishes 12 simultaneous incorrect password changes and preserves the password and session', async () => {
  const person = await signup();
  const responses = await Promise.all(
    Array.from({ length: 12 }, () =>
      request(
        'POST',
        '/api/auth/change-password',
        {
          currentPassword: 'wrong-password',
          newPassword: 'Must-not-change-123',
        },
        person.cookie,
      ),
    ),
  );
  expect(
    responses.filter((r) => r.json().code === 'INVALID_PASSWORD'),
  ).toHaveLength(10);
  expect(responses.filter((r) => r.statusCode === 429)).toHaveLength(2);
  expect(await connection.db.select().from(rateLimitHits)).toHaveLength(10);
  expect(
    (await request('GET', '/api/v1/me', undefined, person.cookie)).statusCode,
  ).toBe(200);
  // Clear the exhausted limiter, then prove no concurrent attempt changed the password.
  await connection.client`truncate rate_limit_hits`;
  expect(
    (
      await request('POST', '/api/auth/sign-in/email', {
        email: person.email,
        password: 'password123',
      })
    ).statusCode,
  ).toBe(200);
}, 20000);
it('forces password changes to revoke other sessions and counts incorrect passwords', async () => {
  const person = await signup();
  await request('POST', '/api/auth/sign-in/email', {
    email: person.email,
    password: 'password123',
  });
  const bad = await request(
    'POST',
    '/api/auth/change-password',
    { currentPassword: 'incorrect', newPassword: 'replacement123' },
    person.cookie,
  );
  expect(bad.statusCode).toBe(400);
  expect(await connection.db.select().from(rateLimitHits)).toHaveLength(1);
  const changed = await request(
    'POST',
    '/api/auth/change-password',
    {
      currentPassword: 'password123',
      newPassword: 'replacement123',
      revokeOtherSessions: false,
    },
    person.cookie,
  );
  expect(changed.statusCode, changed.body).toBe(200);
  expect(await connection.db.select().from(session)).toHaveLength(1);
});
it('reset revokes all sessions, changes password and rejects reuse', async () => {
  const person = await signup();
  const response = await request('POST', '/api/auth/request-password-reset', {
    email: person.email,
    redirectTo: '/reset-password',
  });
  expect(response.statusCode, response.body).toBe(200);
  const token = new URL(queued.at(-1)!.link).pathname.split('/').pop();
  const result = await request('POST', '/api/auth/reset-password', {
    token,
    newPassword: 'replacement123',
  });
  expect(result.statusCode, result.body).toBe(200);
  expect(await connection.db.select().from(session)).toHaveLength(0);
  expect(
    (
      await request('POST', '/api/auth/reset-password', {
        token,
        newPassword: 'other12345',
      })
    ).statusCode,
  ).toBe(400);
});
it('email confirmation invalidates every old-address reset link without affecting other accounts', async () => {
  const person = await signup();
  const other = await signup('other@example.com');
  const resetToken = async (email: string) => {
    const response = await request('POST', '/api/auth/request-password-reset', {
      email,
      redirectTo: '/reset-password',
    });
    expect(response.statusCode, response.body).toBe(200);
    return new URL(queued.at(-1)!.link).pathname.split('/').pop()!;
  };
  const tokens = [
    await resetToken(person.email),
    await resetToken(person.email),
  ];
  const otherToken = await resetToken(other.email);
  const change = await request(
    'POST',
    '/api/v1/me/email',
    { newEmail: 'changed@example.com' },
    person.cookie,
  );
  expect(change.statusCode, change.body).toBe(202);
  const token = new URL(queued.at(-1)!.link).searchParams.get('token')!;
  const confirmed = await request('POST', '/api/v1/me/email/confirm', {
    token,
  });
  expect(confirmed.statusCode, confirmed.body).toBe(200);
  for (const reset of tokens) {
    const refused = await request('POST', '/api/auth/reset-password', {
      token: reset,
      newPassword: 'stolen-password123',
    });
    expect(refused.statusCode, refused.body).toBe(400);
    expect(refused.json().code).toBe('INVALID_TOKEN');
  }
  const signedIn = await request('POST', '/api/auth/sign-in/email', {
    email: 'changed@example.com',
    password: 'password123',
  });
  expect(signedIn.statusCode, signedIn.body).toBe(200);
  // Another user's reset and a newly issued link to the new address remain valid.
  for (const reset of [otherToken, await resetToken('changed@example.com')]) {
    const accepted = await request('POST', '/api/auth/reset-password', {
      token: reset,
      newPassword: 'replacement123',
    });
    expect(accepted.statusCode, accepted.body).toBe(200);
  }
});
it('saves encrypted SMTP credentials, keeps and removes passwords and protects the last source', async () => {
  const person = await signup();
  await connection.db
    .update(user)
    .set({ role: 'admin' })
    .where(eq(user.id, person.id));
  const body = {
    host: 'mailpit',
    port: 1025,
    security: 'none',
    senderName: 'Portal',
    senderAddress: 'portal@example.com',
    password: 'super-secret',
  };
  let response = await request(
    'PUT',
    '/api/v1/admin/settings/mail',
    body,
    person.cookie,
  );
  expect(response.statusCode, response.body).toBe(200);
  expect(response.body).not.toContain('super-secret');
  const [saved] = await connection.db.select().from(mailSettings);
  expect(saved!.passwordCiphertext).not.toBe('super-secret');
  expect(
    decrypt(saved!.passwordCiphertext!, config.PORTAL_ENCRYPTION_KEY),
  ).toBe('super-secret');
  const withoutPassword = {
    host: body.host,
    port: body.port,
    security: body.security,
    senderName: body.senderName,
    senderAddress: body.senderAddress,
  };
  await request(
    'PUT',
    '/api/v1/admin/settings/mail',
    withoutPassword,
    person.cookie,
  );
  expect(
    (await connection.db.select().from(mailSettings))[0]!.passwordCiphertext,
  ).toBe(saved!.passwordCiphertext);
  response = await request(
    'PUT',
    '/api/v1/admin/settings/mail',
    { ...body, password: null },
    person.cookie,
  );
  expect(response.json().saved.hasPassword).toBe(false);
  await connection.db
    .update(accountSettings)
    .set({ requireVerifiedEmail: true });
  expect(
    (
      await request(
        'DELETE',
        '/api/v1/admin/settings/mail',
        undefined,
        person.cookie,
      )
    ).statusCode,
  ).toBe(409);
});
it('deletion refuses bad passwords and gateway outages, then revokes all apps and allows signup again', async () => {
  const person = await signup();
  await connection.db.insert(apps).values([
    { id: uuidv7(), ownerId: person.id, name: 'first' },
    { id: uuidv7(), ownerId: person.id, name: 'second' },
  ]);
  expect(
    (
      await request(
        'DELETE',
        '/api/v1/me',
        { password: 'incorrect' },
        person.cookie,
      )
    ).statusCode,
  ).toBe(403);
  vi.mocked(adapter.health).mockResolvedValueOnce({
    reachable: false,
    latencyMs: 1,
  });
  expect(
    (
      await request(
        'DELETE',
        '/api/v1/me',
        { password: 'password123' },
        person.cookie,
      )
    ).statusCode,
  ).toBe(503);
  expect(await connection.db.select().from(apps)).toHaveLength(2);
  expect(adapter.deleteConsumer).not.toHaveBeenCalled();
  const result = await request(
    'DELETE',
    '/api/v1/me',
    { password: 'password123' },
    person.cookie,
  );
  expect(result.statusCode, result.body).toBe(204);
  expect(adapter.deleteConsumer).toHaveBeenCalledTimes(2);
  expect(await connection.db.select().from(user)).toHaveLength(0);
  expect(await connection.db.select().from(account)).toHaveLength(0);
  await signup();
});
it('part-way deletion commits removed apps and retries the remainder', async () => {
  const person = await signup();
  await connection.db.insert(apps).values([
    { id: uuidv7(), ownerId: person.id, name: 'first' },
    { id: uuidv7(), ownerId: person.id, name: 'second' },
  ]);
  vi.mocked(adapter.deleteConsumer)
    .mockResolvedValueOnce()
    .mockRejectedValueOnce(new GatewayUnavailableError());
  await expect(
    deleteAccount(connection.db, adapter, person),
  ).rejects.toMatchObject({ status: 503 });
  expect(await connection.db.select().from(apps)).toHaveLength(1);
  expect(await connection.db.select().from(user)).toHaveLength(1);
  await deleteAccount(connection.db, adapter, person);
  expect(await connection.db.select().from(user)).toHaveLength(0);
});
it('sweeps apps created during deletion and serializes the last two admins', async () => {
  const person = await signup();
  await connection.db
    .insert(apps)
    .values({ id: uuidv7(), ownerId: person.id, name: 'original' });
  vi.mocked(adapter.deleteConsumer).mockImplementationOnce(async () => {
    await connection.db
      .insert(apps)
      .values({ id: uuidv7(), ownerId: person.id, name: 'late' });
  });
  await deleteAccount(connection.db, adapter, person);
  expect(adapter.deleteConsumer).toHaveBeenCalledTimes(2);
  expect(await connection.db.select().from(apps)).toHaveLength(0);
  const first = await signup('first@example.com');
  const second = await signup('second@example.com');
  await connection.db.update(user).set({ role: 'admin' });
  const results = await Promise.allSettled(
    [first, second].map((p) =>
      deleteAccount(connection.db, adapter, { ...p, role: 'admin' }),
    ),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(await connection.db.select().from(user)).toHaveLength(1);
});
it('encrypts queue links and drops stale verification and replaced email jobs', async () => {
  const send = vi.fn(async () => null);
  await mailQueue(config, { send } as never)({
    template: 'verify',
    userId: 'test',
    to: 'person@example.com',
    link: 'https://portal.example/?token=secret',
  });
  expect(JSON.stringify(send.mock.calls)).not.toContain('token=secret');
  const person = await signup();
  await connection.db.update(user).set({ emailVerified: true });
  const log = { warn: vi.fn() } as never;
  await processMail(connection.db, config, log, {
    id: uuidv7(),
    data: {
      template: 'verify',
      userId: person.id,
      to: person.email,
      link: 'unreadable',
    },
  });
  await processMail(connection.db, config, log, {
    id: uuidv7(),
    data: {
      template: 'confirm-email',
      userId: person.id,
      to: 'new@example.com',
      link: encrypt(
        'https://portal.example/confirm-email?token=replaced',
        config.PORTAL_ENCRYPTION_KEY,
      ),
    },
  });
});

it('rejects expired reset links without changing the password and gives unknown addresses the same confirmation', async () => {
  const person = await signup();
  const known = await request('POST', '/api/auth/request-password-reset', {
    email: person.email,
    redirectTo: '/reset-password',
  });
  const token = new URL(queued.at(-1)!.link).pathname.split('/').pop();
  const count = queued.length;
  const unknown = await request('POST', '/api/auth/request-password-reset', {
    email: 'unknown@example.com',
    redirectTo: '/reset-password',
  });
  expect(unknown.statusCode).toBe(known.statusCode);
  expect(unknown.json()).toEqual(known.json());
  expect(queued).toHaveLength(count);
  await connection.client`update verification set expires_at = now() - interval '2 hours'`;
  const expired = await request('POST', '/api/auth/reset-password', {
    token,
    newPassword: 'replacement123',
  });
  expect(expired.statusCode).toBe(400);
  expect(expired.json().code).toBe('INVALID_TOKEN');
  expect(
    (
      await request('POST', '/api/auth/sign-in/email', {
        email: person.email,
        password: 'password123',
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await request('POST', '/api/auth/sign-in/email', {
        email: person.email,
        password: 'replacement123',
      })
    ).statusCode,
  ).toBe(401);
});

it('refuses unauthenticated, expired-session and non-admin settings changes and malformed profile input', async () => {
  for (const url of [
    '/api/v1/me',
    '/api/v1/admin/settings/mail',
    '/api/v1/admin/settings/accounts',
  ]) {
    expect((await request('GET', url)).statusCode).toBe(401);
  }
  const person = await signup();
  for (const url of [
    '/api/v1/admin/settings/mail',
    '/api/v1/admin/settings/accounts',
  ]) {
    expect(
      (await request('GET', url, undefined, person.cookie)).statusCode,
    ).toBe(403);
    expect((await request('PUT', url, {}, person.cookie)).statusCode).toBe(403);
  }
  expect(
    (await request('PATCH', '/api/v1/me', { name: '' }, person.cookie))
      .statusCode,
  ).toBe(400);
  expect(
    (
      await request(
        'POST',
        '/api/v1/me/email',
        { newEmail: 'not-email' },
        person.cookie,
      )
    ).statusCode,
  ).toBe(400);
  await connection.db.update(session).set({ expiresAt: new Date(0) });
  expect(
    (await request('PATCH', '/api/v1/me', { name: 'Changed' }, person.cookie))
      .statusCode,
  ).toBe(401);
  expect((await connection.db.select().from(user))[0]!.name).toBe('Person');
});

it('expired sessions cannot queue email, change settings or delete an account', async () => {
  const person = await signup();
  await connection.db.update(user).set({ role: 'admin' });
  await connection.db.update(session).set({ expiresAt: new Date(0) });
  const queuedBefore = queued.length;
  for (const [method, url, payload] of [
    ['POST', '/api/v1/me/email', { newEmail: 'replacement@example.com' }],
    ['DELETE', '/api/v1/me', { password: 'password123' }],
    ['PUT', '/api/v1/admin/settings/accounts', { requireVerifiedEmail: true }],
    ['POST', '/api/v1/admin/settings/mail/test', { to: person.email }],
  ] as const) {
    const denied = await request(method, url, payload, person.cookie);
    expect(denied.statusCode).toBe(401);
    expect(denied.headers['content-type']).toContain(
      'application/problem+json',
    );
  }
  expect(queued).toHaveLength(queuedBefore);
  expect(await connection.db.select().from(emailChangeRequests)).toHaveLength(
    0,
  );
  expect((await connection.db.select().from(user))[0]!.email).toBe(
    person.email,
  );
  expect(
    (await connection.db.select().from(accountSettings))[0]!
      .requireVerifiedEmail,
  ).toBe(false);
  expect(adapter.deleteConsumer).not.toHaveBeenCalled();
});

it('rejects an already-owned email neutrally and keeps the old address until confirmation', async () => {
  const person = await signup();
  await signup('taken@example.com');
  const taken = await request(
    'POST',
    '/api/v1/me/email',
    { newEmail: 'taken@example.com' },
    person.cookie,
  );
  const same = await request(
    'POST',
    '/api/v1/me/email',
    { newEmail: person.email },
    person.cookie,
  );
  expect(taken.statusCode).toBe(409);
  expect(taken.json()).toEqual(same.json());
  expect(
    (
      await request(
        'POST',
        '/api/v1/me/email',
        { newEmail: 'pending@example.com' },
        person.cookie,
      )
    ).statusCode,
  ).toBe(202);
  expect(
    (await request('GET', '/api/v1/me', undefined, person.cookie)).json(),
  ).toMatchObject({ email: person.email, pendingEmail: 'pending@example.com' });
  expect(
    (
      await request('POST', '/api/auth/sign-in/email', {
        email: person.email,
        password: 'password123',
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await request('POST', '/api/auth/sign-in/email', {
        email: 'pending@example.com',
        password: 'password123',
      })
    ).statusCode,
  ).toBe(401);
});

it('deletes through the current gateway configuration even while new keys are disabled', async () => {
  const person = await signup();
  const appId = uuidv7();
  await connection.db
    .insert(apps)
    .values({ id: appId, ownerId: person.id, name: 'current gateway' });
  await connection.db
    .update(gateways)
    .set({ adminUrl: 'http://replacement:8001', enabled: false });
  const response = await request(
    'DELETE',
    '/api/v1/me',
    { password: 'password123' },
    person.cookie,
  );
  expect(response.statusCode, response.body).toBe(204);
  expect(replacementAdapter.health).toHaveBeenCalled();
  expect(replacementAdapter.deleteConsumer).toHaveBeenCalledWith({ id: appId });
  expect(adapter.deleteConsumer).not.toHaveBeenCalled();
  expect(await connection.db.select().from(user)).toHaveLength(0);
});

it('refuses malformed deletion confirmation without changing an account when no gateway exists', async () => {
  const person = await signup();
  const removed = await connection.db.delete(gateways).returning();
  vi.mocked(adapter.health).mockClear();
  try {
    for (const payload of [{}, { password: 123 }, { password: '' }]) {
      const response = await request(
        'DELETE',
        '/api/v1/me',
        payload,
        person.cookie,
      );
      expect(response.statusCode, response.body).toBe(400);
      expect(response.headers['content-type']).toContain(
        'application/problem+json',
      );
      expect(await connection.db.select().from(user)).toHaveLength(1);
      expect(await connection.db.select().from(session)).toHaveLength(1);
    }
    expect(adapter.health).not.toHaveBeenCalled();
    expect(adapter.deleteConsumer).not.toHaveBeenCalled();
  } finally {
    await connection.db.insert(gateways).values(removed);
  }
});

it('deletes an account and its local apps when no gateway is connected', async () => {
  const person = await signup();
  await connection.db.insert(apps).values({
    id: uuidv7(),
    ownerId: person.id,
    name: 'local app',
  });
  const removed = await connection.db.delete(gateways).returning();
  vi.mocked(adapter.health).mockClear();
  try {
    const response = await request(
      'DELETE',
      '/api/v1/me',
      { password: 'password123' },
      person.cookie,
    );
    expect(response.statusCode, response.body).toBe(204);
    expect(response.headers['set-cookie']).toContain('Max-Age=0');
    expect(adapter.health).not.toHaveBeenCalled();
    expect(adapter.deleteConsumer).not.toHaveBeenCalled();
    expect(await connection.db.select().from(user)).toHaveLength(0);
    expect(await connection.db.select().from(apps)).toHaveLength(0);
    expect(await connection.db.select().from(account)).toHaveLength(0);
    expect(await connection.db.select().from(session)).toHaveLength(0);
    // A repeated request using the deleted session cannot delete anything else.
    const repeated = await request(
      'DELETE',
      '/api/v1/me',
      { password: 'password123' },
      person.cookie,
    );
    expect(repeated.statusCode).toBe(401);
    expect(repeated.headers['content-type']).toContain(
      'application/problem+json',
    );
  } finally {
    await connection.db.insert(gateways).values(removed);
  }
});
it('keeps the account and apps and returns the stored-token problem when the gateway token cannot be decrypted', async () => {
  const person = await signup();
  await connection.db.insert(apps).values({
    id: uuidv7(),
    ownerId: person.id,
    name: 'retained app',
  });
  await connection.db
    .update(gateways)
    .set({ adminTokenCiphertext: 'invalid-ciphertext' });
  vi.mocked(adapter.health).mockClear();
  try {
    const response = await request(
      'DELETE',
      '/api/v1/me',
      { password: 'password123' },
      person.cookie,
    );
    expect(response.statusCode, response.body).toBe(503);
    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(response.json()).toMatchObject({
      type: '/problems/gateway-unavailable',
      detail: storedTokenUnavailable().message,
    });
    expect(adapter.health).not.toHaveBeenCalled();
    expect(adapter.deleteConsumer).not.toHaveBeenCalled();
    expect(await connection.db.select().from(user)).toHaveLength(1);
    expect(await connection.db.select().from(apps)).toHaveLength(1);
    expect(await connection.db.select().from(account)).toHaveLength(1);
    expect(await connection.db.select().from(session)).toHaveLength(1);
  } finally {
    await connection.db.update(gateways).set({ adminTokenCiphertext: null });
  }
});
