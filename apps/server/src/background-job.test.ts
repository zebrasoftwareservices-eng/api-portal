// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import PgBoss from 'pg-boss';
import type { Database } from '@portal/db';
import {
  GatewayUnavailableError,
  type GatewayAdapter,
} from '@portal/adapter-sdk';
import { backgroundJob } from './background-job.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import type { Auth } from './auth.js';

let container: StartedPostgreSqlContainer;
let boss: PgBoss;
let app: Awaited<ReturnType<typeof createApp>>['app'];
const logs: string[] = [];
const infrastructureErrors: Error[] = [];

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  boss = new PgBoss({
    connectionString: container.getConnectionUri(),
    // Poll promptly without changing the queue's retry policy.
    pollingIntervalSeconds: 0.5,
  });
  boss.on('error', (err) => infrastructureErrors.push(err));
  await boss.start();
  ({ app } = await createApp({
    db: {} as Database,
    config: loadConfig(),
    adapter: {} as GatewayAdapter,
    gatewayId: 'test',
    auth: {} as Auth,
    logger: { stream: { write: (line: string) => logs.push(line) } },
  }));
});

afterAll(async () => {
  await boss?.stop();
  await app?.close();
  await container?.stop();
});

describe('background job failure diagnostics with real pg-boss', () => {
  it.each(['gateway-reconcile', 'seed-sample'])(
    'logs %s failures and preserves the failed state and retries',
    async (queue) => {
      const err = Object.assign(new Error('Background database query failed'), {
        key: 'pk_job_secret',
      });
      const run = vi.fn<() => Promise<void>>().mockRejectedValue(err);
      await boss.createQueue(queue, { name: queue, policy: 'singleton' });
      await boss.work(queue, backgroundJob(queue, app.log, run));
      const id = await boss.send(
        queue,
        {},
        queue === 'seed-sample'
          ? {
              singletonKey: queue,
              // Keep the test short; startup tests assert the production policy.
              retryLimit: 1,
              retryDelay: 1,
              retryBackoff: true,
            }
          : { singletonKey: queue },
      );
      expect(id).toBeTruthy();
      if (queue === 'seed-sample') {
        await vi.waitFor(
          async () => {
            const job = await boss.getJobById(queue, id!);
            expect(job?.state).toBe('retry');
            expect(job?.retryLimit).toBe(1);
            expect(job?.retryDelay).toBe(1);
            expect(job?.retryBackoff).toBe(true);
          },
          { timeout: 10000 },
        );
        await vi.waitFor(
          () => expect(run.mock.calls.length).toBeGreaterThanOrEqual(2),
          {
            timeout: 20000,
          },
        );
      }
      await vi.waitFor(
        async () => {
          const job = await boss.getJobById(queue, id!);
          expect(job?.state).toBe('failed');
          expect(job?.retryCount).toBe(job?.retryLimit);
          expect(run).toHaveBeenCalledTimes(job!.retryLimit + 1);
          expect(job?.output).toMatchObject({ message: err.message });
        },
        { timeout: 10000 },
      );
      const entries = logs
        .map((line) => JSON.parse(line))
        .filter((entry) => entry.queue === queue);
      expect(entries.length).toBe(run.mock.calls.length);
      for (const entry of entries) {
        expect(entry.msg).toBe('Background job failed: unexpected failure');
        expect(entry.err.message).toBe(err.message);
        expect(entry.err.stack).toContain(err.message);
        expect(entry.err.key).toBe('[REDACTED]');
      }
      expect(logs.join('')).not.toContain('pk_');
      expect(infrastructureErrors).toEqual([]);
    },
  );

  it('labels only gateway availability errors as gateway unavailable', async () => {
    const err = new GatewayUnavailableError();
    await expect(
      backgroundJob('seed-sample', app.log, async () => {
        throw err;
      })(),
    ).rejects.toBe(err);
    const entry = JSON.parse(logs.at(-1)!);
    expect(entry.queue).toBe('seed-sample');
    expect(entry.msg).toBe('Background job failed: gateway unavailable');
    expect(entry.err.message).toBe(err.message);
  });
});
