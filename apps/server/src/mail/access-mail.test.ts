// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import PgBoss from 'pg-boss';
import {
  connect,
  migrate,
  user,
  teams,
  teamMembers,
  products,
  plans,
  apps,
  accessRequests,
} from '@portal/db';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { loadConfig } from '../config.js';
import { mailQueue, processMail, type MailPayload } from './queue.js';
import { sendMail } from './transport.js';
vi.mock('./transport.js', () => ({ sendMail: vi.fn(async () => {}) }));
let container: StartedPostgreSqlContainer;
let connection: ReturnType<typeof connect>;
let boss: PgBoss;
const teamId = uuidv7(),
  productId = uuidv7(),
  planId = uuidv7(),
  appId = uuidv7(),
  requestId = uuidv7();
const memberId = uuidv7();
let config: ReturnType<typeof loadConfig>;
const log = { warn: vi.fn() } as unknown as Parameters<typeof processMail>[2];
beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const url = container.getConnectionUri();
  await migrate(url);
  connection = connect(url);
  config = loadConfig({
    DATABASE_URL: url,
    SMTP_HOST: 'smtp.test',
    SMTP_SENDER_ADDRESS: 'portal@example.com',
    PORTAL_PUBLIC_URL: 'http://localhost:3000',
  });
  boss = new PgBoss({ connectionString: url });
  boss.on('error', () => {});
  await boss.start();
  await boss.createQueue('send-email');
  await connection.db.insert(user).values([
    { id: memberId, name: 'Member', email: 'member@example.com' },
    { id: uuidv7(), name: 'Reader', email: 'reader@example.com' },
  ]);
  const people = await connection.db.select().from(user);
  await connection.db.insert(teams).values({ id: teamId, name: 'Team' });
  await connection.db.insert(teamMembers).values(
    people.map((p) => ({
      teamId,
      userId: p.id,
      role: p.id === memberId ? ('member' as const) : ('read-only' as const),
    })),
  );
  await connection.db.insert(products).values({
    id: productId,
    name: 'Partner',
    slug: 'partner',
    description: 'Partner',
  });
  await connection.db.insert(plans).values({
    id: planId,
    productId,
    name: 'Free',
    rateLimit: 5,
    rateLimitUnit: 'second',
    monthlyQuota: 100,
  });
  await connection.db.insert(apps).values({
    id: appId,
    teamId,
    planId,
    name: 'Prod',
    origin: 'admin',
    keyIssued: false,
  });
  await connection.db.insert(accessRequests).values({
    id: requestId,
    teamId,
    planId,
    name: 'Requested',
    reason: 'Please',
    kind: 'subscribe',
    appId,
    status: 'approved',
    requestedBy: memberId,
    decidedAt: new Date(),
    decisionNote: '<script>note</script>',
  });
});
afterAll(async () => {
  await boss?.stop();
  await connection?.client.end();
  await container?.stop();
});
it('commits id-only jobs with the state transaction and rolls jobs back on failure', async () => {
  const enqueue = mailQueue(config, boss);
  await expect(
    connection.db.transaction(async (tx) => {
      await enqueue({ template: 'subscription-assigned', appId }, tx);
      throw new Error('rollback');
    }),
  ).rejects.toThrow('rollback');
  expect(await boss.fetch('send-email')).toEqual([]);
  await connection.db.transaction(async (tx) => {
    await enqueue({ template: 'access-approved', requestId }, tx);
  });
  const jobs = await boss.fetch<MailPayload>('send-email');
  expect(jobs).toHaveLength(1);
  expect(jobs[0]!.data).toEqual({ template: 'access-approved', requestId });
  await connection.db
    .update(user)
    .set({ email: 'current@example.com' })
    .where(eq(user.id, memberId));
  await processMail(connection.db, config, log, jobs[0]!);
  expect(sendMail).toHaveBeenLastCalledWith(
    expect.anything(),
    'current@example.com',
    expect.objectContaining({
      html: expect.stringContaining('&lt;script&gt;note&lt;/script&gt;'),
    }),
  );
  expect(vi.mocked(sendMail).mock.calls.at(-1)![2].html).toContain(
    `/dashboard/apps/${appId}`,
  );
});
it('loads current subscription recipients and excludes read-only team members', async () => {
  vi.clearAllMocks();
  await connection.db
    .update(user)
    .set({ email: 'current@example.com' })
    .where(eq(user.id, memberId));
  await processMail(connection.db, config, log, {
    id: 'assigned',
    data: { template: 'subscription-assigned', appId },
  });
  expect(sendMail).toHaveBeenCalledOnce();
  expect(sendMail).toHaveBeenCalledWith(
    expect.anything(),
    'current@example.com',
    expect.objectContaining({ text: expect.stringContaining('Prod') }),
  );
  await connection.db
    .update(apps)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(eq(apps.id, appId));
  await processMail(connection.db, config, log, {
    id: 'revoked',
    data: { template: 'subscription-revoked', appId },
  });
  expect(sendMail).toHaveBeenCalledTimes(2);
});
