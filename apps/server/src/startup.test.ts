// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayUnavailableError } from '@portal/adapter-sdk';
import { loadConfig } from './config.js';

const mocks = vi.hoisted(() => {
  const result = [{ id: 'gateway', instanceId: 'instance' }];
  const query: Record<string, unknown> = {};
  for (const name of [
    'values',
    'onConflictDoNothing',
    'onConflictDoUpdate',
    'from',
    'where',
    'limit',
    'returning',
  ])
    query[name] = () => query;
  query.then = (resolve: (value: typeof result) => unknown) =>
    Promise.resolve(result).then(resolve);
  const db = {
    insert: () => query,
    select: () => query,
    execute: vi.fn(),
    transaction: async (run: (tx: unknown) => unknown) => run(db),
  };
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const app = { log, addHook: vi.fn(), listen: vi.fn() };
  const handlers = new Map<string, (err: Error) => void>();
  const boss = {
    on: (event: string, handler: (err: Error) => void) =>
      handlers.set(event, handler),
    start: vi.fn(),
    stop: vi.fn(),
    createQueue: vi.fn(),
    work: vi.fn(),
    schedule: vi.fn(),
    send: vi.fn(),
  };
  return { db, log, app, boss, handlers, seed: vi.fn(), reconcile: vi.fn() };
});
vi.mock('@portal/db', async (original) => ({
  ...(await original<typeof import('@portal/db')>()),
  migrate: vi.fn(),
  connect: () => ({ db: mocks.db, client: { end: vi.fn() } }),
}));
vi.mock('pg-boss', () => ({
  default: class {
    constructor() {
      return mocks.boss;
    }
  },
}));
vi.mock('./auth.js', () => ({ createAuth: () => ({}) }));
vi.mock('./app.js', () => ({ createApp: async () => ({ app: mocks.app }) }));
vi.mock('./seed.js', () => ({ seedSample: mocks.seed }));
vi.mock('./reconcile.js', () => ({ reconcile: mocks.reconcile }));
import { start } from './startup.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers.clear();
});
describe('startup error diagnostics', () => {
  it.each(['gateway-reconcile', 'seed-sample'])(
    'logs and rethrows failures in the registered %s handler',
    async (queue) => {
      await start(loadConfig());
      const err = new Error('Job query failed');
      const run = queue === 'seed-sample' ? mocks.seed : mocks.reconcile;
      run.mockRejectedValueOnce(err);
      const handler = mocks.boss.work.mock.calls.find(
        ([name]) => name === queue,
      )![1];
      await expect(handler()).rejects.toBe(err);
      expect(mocks.log.error).toHaveBeenCalledWith(
        { err, queue },
        'Background job failed: unexpected failure',
      );
    },
  );
  it('logs seed gateway errors and pg-boss errors with their error objects', async () => {
    const err = new GatewayUnavailableError();
    mocks.seed.mockRejectedValueOnce(err);
    await start(loadConfig());
    expect(mocks.log.warn).toHaveBeenCalledWith(
      { err },
      'Sample seed deferred: gateway unavailable',
    );
    expect(mocks.boss.send).toHaveBeenCalledWith(
      'seed-sample',
      {},
      {
        singletonKey: 'seed-sample',
        retryLimit: 20,
        retryDelay: 5,
        retryBackoff: true,
      },
    );
    const jobError = new Error('Reconciliation query failed');
    mocks.handlers.get('error')!(jobError);
    expect(mocks.log.error).toHaveBeenCalledWith(
      { err: jobError },
      'Background job failed',
    );
  });
  it('AC 6: boots during a Kong outage and its scheduled reconcile warns without secrets then recovers', async () => {
    const unavailable = new GatewayUnavailableError();
    mocks.seed.mockRejectedValueOnce(unavailable);
    await start(
      loadConfig({
        KONG_ADMIN_URL: 'http://127.0.0.1:1',
        KONG_ADMIN_TOKEN: 'qa-admin-secret',
      }),
    );
    expect(mocks.app.listen).toHaveBeenCalled();
    const handler = mocks.boss.work.mock.calls.find(
      ([name]) => name === 'gateway-reconcile',
    )![1];
    mocks.reconcile.mockRejectedValueOnce(unavailable);
    await expect(handler()).rejects.toBe(unavailable);
    expect(mocks.log.warn).toHaveBeenCalled();
    expect(JSON.stringify(mocks.log.warn.mock.calls)).not.toContain(
      'qa-admin-secret',
    );
    await expect(handler()).resolves.toBeUndefined();
  });
  it('identifies unexpected seed failures without blaming gateway availability', async () => {
    const err = new Error('Seed file is malformed');
    mocks.seed.mockRejectedValueOnce(err);
    await start(loadConfig());
    expect(mocks.log.warn).toHaveBeenCalledWith(
      { err },
      'Sample seed deferred: unexpected failure',
    );
  });
});
