// SPDX-License-Identifier: Apache-2.0
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import http from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate as drizzleMigrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { connect, migrate } from '@portal/db';
import { createAuth } from './auth.js';
import { loadConfig } from './config.js';
import { Problem } from './problem.js';
import { adminExists, createFirstAdmin } from './setup.js';
import { start } from './startup.js';

const migrationsFolder = fileURLToPath(
  new URL('../../../packages/db/migrations/', import.meta.url),
);
const legacyDocument = {
  openapi: '3.0.3',
  info: { title: 'Legacy API', version: '1.0.0' },
  paths: {
    '/zebra': { get: { responses: { '200': { description: 'zebra' } } } },
    '/alpha': { get: { responses: { '200': { description: 'alpha' } } } },
  },
};
const gatewayId = '019a3cc0-0000-7000-8000-000000000021';
const apiId = '019a3cc0-0000-7000-8000-000000000022';
const versionId = '019a3cc0-0000-7000-8000-000000000023';

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function applyPre022(url: string) {
  const journal = JSON.parse(
    await readFile(join(migrationsFolder, 'meta/_journal.json'), 'utf8'),
  ) as { entries: { tag: string }[] };
  // 0009 changes api_versions.document. Later migrations, including theme,
  // must stay pending so a lock on that table still stops the upgrade.
  const pendingAt = journal.entries.findIndex(
    (entry) => entry.tag === '0009_gateway_operations',
  );
  if (pendingAt < 0) throw new Error('0009_gateway_operations is missing from the journal');
  const client = postgres(url, { max: 1 });
  try {
    for (const entry of journal.entries.slice(0, pendingAt)) {
      const text = await readFile(join(migrationsFolder, `${entry.tag}.sql`), 'utf8');
      const sqlText = text.replaceAll('--> statement-breakpoint', '');
      try {
        await client.unsafe(sqlText);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${entry.tag}: ${message}`);
      }
    }
    const migrations = readMigrationFiles({ migrationsFolder }) as {
      hash: string;
      folderMillis: number;
    }[];
    await client.unsafe('create schema if not exists drizzle');
    await client.unsafe(
      `create table if not exists drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )`,
    );
    for (const migration of migrations.slice(0, pendingAt))
      await client`insert into drizzle.__drizzle_migrations (hash, created_at) values (${migration.hash}, ${migration.folderMillis})`;
    await client`insert into gateways (id, name, kind, admin_url, proxy_public_url, proxy_internal_url)
      values (${gatewayId}, 'kong', 'kong', 'http://127.0.0.1:9', 'http://127.0.0.1:9', 'http://127.0.0.1:9')`;
    await client`insert into apis (id, slug, gateway_id, gateway_service_id, gateway_service_name, route_path)
      values (${apiId}, 'legacy', ${gatewayId}, 'svc', 'svc', '/legacy')`;
    await client`insert into api_versions (id, api_id, version, title, document)
      values (${versionId}, ${apiId}, '1.0.0', 'Legacy API', ${JSON.stringify(legacyDocument)}::jsonb)`;
    await client`update apis set latest_version_id = ${versionId} where id = ${apiId}`;
  } finally {
    await client.end();
  }
}

async function columnType(url: string) {
  const client = postgres(url, { max: 1 });
  try {
    const [column] = await client<{ data_type: string }[]>`
      select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'api_versions' and column_name = 'document'
    `;
    const [table] = await client<{ name: string | null }[]>`
      select to_regclass('public.gateway_operations')::text as name
    `;
    const [row] = await client<{ title: string; document: unknown }[]>`
      select title, document from api_versions where id = ${versionId}
    `;
    return { type: column?.data_type, operations: table?.name, row };
  } finally {
    await client.end();
  }
}

function listenUpstream() {
  const hits: string[] = [];
  const server = http.createServer((request, response) => {
    hits.push(request.url ?? '');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, path: request.url }));
  });
  return new Promise<{ origin: string; hits: string[]; close: () => Promise<void> }>(
    (resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        resolve({
          origin: `http://127.0.0.1:${port}`,
          hits,
          close: () =>
            new Promise((done, reject) =>
              server.close((error) => (error ? reject(error) : done())),
            ),
        });
      });
    },
  );
}

async function usableAdmins(url: string) {
  const client = postgres(url, { max: 1 });
  try {
    const [row] = await client<{ count: string }[]>`
      select count(*)::text as count from "user" u
      join account a on a.user_id = u.id
      where u.role = 'admin' and a.provider_id = 'credential' and a.password is not null
    `;
    return Number(row?.count ?? 0);
  } finally {
    await client.end();
  }
}

it('criteria 9 and 10: a killed upgrade leaves jsonb untouched, then boot serves the old API and a re-import keeps path order', async () => {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const url = container.getConnectionUri();
  const upstream = await listenUpstream();
  let app: Awaited<ReturnType<typeof start>> | undefined;
  const locker = postgres(url, { max: 1 });
  let migrator: ReturnType<typeof postgres> | undefined;
  try {
    await applyPre022(url);
    await locker`begin`;
    await locker`lock table api_versions in access exclusive mode`;
    let settled = false;
    // Own the driver connection. migrate() would wait forever in its unlock
    // after the backend is killed, so this attempt uses the same Drizzle
    // transaction and then closes the socket.
    migrator = postgres(url, { max: 1, onnotice() {} });
    const migrating = drizzleMigrate(drizzle(migrator), { migrationsFolder }).then(
      () => 'completed' as const,
      () => {
        settled = true;
        return 'failed' as const;
      },
    );
    const deadline = Date.now() + 20_000;
    let pid: number | undefined;
    let seen: { pid: number; state: string | null; wait_event_type: string | null; query: string | null }[] = [];
    const watcher = postgres(url, { max: 1 });
    try {
      while (Date.now() < deadline && !settled) {
        seen = await watcher<{ pid: number; state: string | null; wait_event_type: string | null; query: string | null }[]>`
          select pid, state, wait_event_type, left(query, 240) as query
          from pg_stat_activity
          where datname = current_database()
            and pid <> pg_backend_pid()
        `;
        pid = seen.find(
          (row) =>
            row.wait_event_type === 'Lock' &&
            (row.query ?? '').toLowerCase().includes('api_versions'),
        )?.pid;
        if (pid) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } finally {
      await watcher.end();
    }
    expect(
      pid,
      `migration did not block on the pre-022 table: ${seen.map((row) => `${row.wait_event_type ?? row.state}: ${row.query ?? ''}`).join(' | ')}`,
    ).toBeTruthy();
    const onDriverError = (error: unknown) => {
      // postgres.js queues a socket write. Terminate nulls that socket first.
      if (
        error instanceof TypeError &&
        error.message.includes("reading 'write'")
      )
        return;
      process.removeListener('uncaughtException', onDriverError);
      throw error;
    };
    process.on('uncaughtException', onDriverError);
    try {
      await locker`select pg_terminate_backend(${pid!}::integer)`;
      await migrator.end({ timeout: 1 }).catch(() => {});
      await new Promise((resolve) => setImmediate(resolve));
      expect(await migrating).toBe('failed');
    } finally {
      process.removeListener('uncaughtException', onDriverError);
    }
    await locker`rollback`;
    const rolledBack = await columnType(url);
    expect(rolledBack.type).toBe('jsonb');
    expect(rolledBack.operations).toBeNull();
    expect(rolledBack.row?.title).toBe('Legacy API');

    await migrate(url);
    const upgraded = await columnType(url);
    expect(upgraded.type).toBe('json');
    expect(upgraded.operations).toBe('gateway_operations');
    expect(upgraded.row?.title).toBe('Legacy API');
    expect(JSON.stringify(upgraded.row?.document)).toContain('/zebra');
    expect(JSON.stringify(upgraded.row?.document)).toContain('/alpha');

    const gatewayClient = postgres(url, { max: 1 });
    try {
      await gatewayClient`update gateways set proxy_public_url = ${upstream.origin}, proxy_internal_url = ${upstream.origin} where id = ${gatewayId}`;
    } finally {
      await gatewayClient.end();
    }
    app = await start(
      loadConfig({
        DATABASE_URL: url,
        PORT: String(await freePort()),
        ADMIN_EMAIL: 'legacy@example.com',
        ADMIN_PASSWORD: 'legacy-password-1',
        SEED_SAMPLE: 'false',
        NODE_ENV: 'test',
      }),
    );
    const catalog = await app.inject({ url: '/api/v1/apis' });
    expect(catalog.statusCode, catalog.body).toBe(200);
    expect(catalog.json().items).toEqual([
      expect.objectContaining({ slug: 'legacy', title: 'Legacy API' }),
    ]);
    const reference = await app.inject({ url: '/api/v1/apis/legacy/openapi.json' });
    expect(reference.statusCode, reference.body.slice(0, 300)).toBe(200);
    expect(Object.keys(reference.json().paths).sort()).toEqual(['/alpha', '/zebra']);
    const spec = await app.inject({ url: '/api/v1/apis/legacy/spec' });
    expect(spec.statusCode).toBe(200);
    expect(JSON.parse(spec.body).openapi).toBe('3.0.3');
    const tried = await app.inject({
      url: `/api/v1/try-it?scalar_url=${encodeURIComponent(`${upstream.origin}/legacy/zebra`)}`,
    });
    expect(tried.statusCode, tried.body).toBe(200);
    expect(tried.json()).toMatchObject({ ok: true, path: '/legacy/zebra' });
    expect(upstream.hits).toContain('/legacy/zebra');

    const signedIn = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: 'legacy@example.com', password: 'legacy-password-1' },
    });
    expect(signedIn.statusCode, signedIn.body).toBe(200);
    const setCookie = signedIn.headers['set-cookie'];
    const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie])
      .filter((value): value is string => Boolean(value))
      .map((value) => value.split(';')[0])
      .join('; ');
    const ordered = {
      openapi: '3.0.3',
      info: { title: 'Legacy API', version: '2.0.0' },
      paths: {
        '/m': { get: { responses: { '200': { description: 'm' } } } },
        '/a': { get: { responses: { '200': { description: 'a' } } } },
        '/z': { get: { responses: { '200': { description: 'z' } } } },
      },
    };
    const imported = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/apis/legacy/versions',
      headers: { cookie },
      payload: { spec: { content: JSON.stringify(ordered) }, makeLatest: true },
    });
    expect(imported.statusCode, imported.body.slice(0, 500)).toBe(201);
    const client = postgres(url, { max: 1 });
    try {
      const [stored] = await client<{ paths: string }[]>`
        select (document->'paths')::text as paths
        from api_versions where version = '2.0.0'
      `;
      const text = stored?.paths ?? '';
      expect(text.indexOf('"/m"')).toBeGreaterThanOrEqual(0);
      expect(text.indexOf('"/m"')).toBeLessThan(text.indexOf('"/a"'));
      expect(text.indexOf('"/a"')).toBeLessThan(text.indexOf('"/z"'));
    } finally {
      await client.end();
    }
    const latest = await app.inject({ url: '/api/v1/apis/legacy/openapi.json' });
    expect(Object.keys(latest.json().paths)).toEqual(['/m', '/a', '/z']);
  } finally {
    await migrator?.end({ timeout: 1 }).catch(() => {});
    await locker.end().catch(() => {});
    await app?.close();
    await upstream.close();
    await container.stop();
  }
}, 240_000);

it('criterion 6: boot completes a partial admin, keeps a role without a credential on the setup path, and does not create two', async () => {
  const first = await new PostgreSqlContainer('postgres:17-alpine').start();
  const firstUrl = first.getConnectionUri();
  let booted: Awaited<ReturnType<typeof start>> | undefined;
  try {
    await migrate(firstUrl);
    const setup = connect(firstUrl);
    await setup.client`insert into "user" (id, name, email, role, email_verified)
      values ('019a3cc0-0000-7000-8000-000000000031', 'Partial', 'boot@example.com', 'developer', false)`;
    await setup.client.end();
    booted = await start(
      loadConfig({
        DATABASE_URL: firstUrl,
        PORT: String(await freePort()),
        ADMIN_EMAIL: 'boot@example.com',
        ADMIN_PASSWORD: 'boot-password-1',
        SEED_SAMPLE: 'false',
        NODE_ENV: 'test',
      }),
    );
    expect(await usableAdmins(firstUrl)).toBe(1);
    const signedIn = await booted.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: 'boot@example.com', password: 'boot-password-1' },
    });
    expect(signedIn.statusCode, signedIn.body).toBe(200);
    const setCookie = signedIn.headers['set-cookie'];
    const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie])
      .filter((value): value is string => Boolean(value))
      .map((value) => value.split(';')[0])
      .join('; ');
    const me = await booted.inject({ url: '/api/v1/me', headers: { cookie } });
    expect(me.statusCode, me.body).toBe(200);
    expect(me.json().role).toBe('admin');
    const authDb = connect(firstUrl);
    try {
      const auth = createAuth(
        authDb.db,
        loadConfig({ DATABASE_URL: firstUrl, NODE_ENV: 'test' }),
        async () => {},
      );
      await expect(
        createFirstAdmin(authDb.db, auth, {
          email: 'boot@example.com',
          password: 'boot-password-1',
        }),
      ).rejects.toMatchObject({ status: 409, code: 'setup-complete' });
    } finally {
      await authDb.client.end();
    }
    expect(await usableAdmins(firstUrl)).toBe(1);
    const health = await booted.inject({ url: '/api/v1/setup' });
    expect(health.json()).toMatchObject({ adminRequired: false });
  } finally {
    await booted?.close();
    await first.stop();
  }

  const second = await new PostgreSqlContainer('postgres:17-alpine').start();
  const secondUrl = second.getConnectionUri();
  let wizard: Awaited<ReturnType<typeof start>> | undefined;
  try {
    await migrate(secondUrl);
    const setup = connect(secondUrl);
    await setup.client`insert into "user" (id, name, email, role, email_verified)
      values ('019a3cc0-0000-7000-8000-000000000032', 'Stranded', 'stranded@example.com', 'admin', false)`;
    await setup.client`insert into "user" (id, name, email, role, email_verified)
      values ('019a3cc0-0000-7000-8000-000000000033', 'Taken', 'taken@example.com', 'developer', true)`;
    await setup.client`insert into account (id, account_id, provider_id, user_id, password)
      values ('019a3cc0-0000-7000-8000-000000000034', '019a3cc0-0000-7000-8000-000000000033', 'credential', '019a3cc0-0000-7000-8000-000000000033', 'hash')`;
    await setup.client.end();
    const captured: string[] = [];
    const stdout = process.stdout.write.bind(process.stdout);
    const stderr = process.stderr.write.bind(process.stderr);
    const record =
      (original: typeof process.stdout.write) =>
      (chunk: string | Uint8Array, encoding?: BufferEncoding, callback?: (error?: Error | null) => void) => {
        captured.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
        return original(chunk, encoding as BufferEncoding, callback);
      };
    process.stdout.write = record(stdout) as typeof process.stdout.write;
    process.stderr.write = record(stderr) as typeof process.stderr.write;
    try {
      wizard = await start(
        loadConfig({
          DATABASE_URL: secondUrl,
          PORT: String(await freePort()),
          ADMIN_EMAIL: 'taken@example.com',
          ADMIN_PASSWORD: 'taken-password-1',
          SEED_SAMPLE: 'false',
          NODE_ENV: 'test',
        }),
      );
    } finally {
      process.stdout.write = stdout;
      process.stderr.write = stderr;
    }
    expect(captured.join('\n')).toContain(
      'First admin from ADMIN_EMAIL not created: validation',
    );
    expect(await usableAdmins(secondUrl)).toBe(0);
    const check = connect(secondUrl);
    try {
      expect(await adminExists(check.db)).toBe(false);
    } finally {
      await check.client.end();
    }
    const setupResponse = await wizard.inject({ url: '/api/v1/setup' });
    expect(setupResponse.statusCode, setupResponse.body).toBe(200);
    expect(setupResponse.json()).toMatchObject({ adminRequired: true });
    const catalog = await wizard.inject({ url: '/api/v1/apis' });
    expect(catalog.statusCode).toBe(200);
    await wizard.close();
    wizard = undefined;
    let crashed = false;
    try {
      const again = await start(
        loadConfig({
          DATABASE_URL: secondUrl,
          PORT: String(await freePort()),
          ADMIN_EMAIL: 'taken@example.com',
          ADMIN_PASSWORD: 'short',
          SEED_SAMPLE: 'false',
          NODE_ENV: 'test',
        }),
      );
      await again.close();
    } catch (error) {
      crashed = true;
      expect(error).not.toBeInstanceOf(Problem);
    }
    expect(crashed).toBe(true);
  } finally {
    await wizard?.close();
    await second.stop();
  }

  const third = await new PostgreSqlContainer('postgres:17-alpine').start();
  const thirdUrl = third.getConnectionUri();
  const thirdDb = connect(thirdUrl);
  try {
    await migrate(thirdUrl);
    await thirdDb.client`insert into "user" (id, name, email, role, email_verified)
      values ('019a3cc0-0000-7000-8000-000000000035', 'Race', 'race@example.com', 'developer', false)`;
    const config = loadConfig({ DATABASE_URL: thirdUrl, NODE_ENV: 'test' });
    const auth = createAuth(thirdDb.db, config, async () => {});
    const results = await Promise.allSettled([
      createFirstAdmin(thirdDb.db, auth, {
        email: 'race@example.com',
        password: 'race-password-1',
      }),
      createFirstAdmin(thirdDb.db, auth, {
        email: 'race@example.com',
        password: 'race-password-1',
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected && rejected.status === 'rejected' && rejected.reason).toBeInstanceOf(
      Problem,
    );
    expect(await usableAdmins(thirdUrl)).toBe(1);
  } finally {
    await thirdDb.client.end();
    await third.stop();
  }
}, 240_000);
