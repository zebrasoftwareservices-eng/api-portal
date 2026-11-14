// SPDX-License-Identifier: Apache-2.0
import { it, expect } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { connect, migrate, SchemaAheadError } from './index.js';
it('serializes migrations and enforces singleton, roles and credential status', async () => {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const url = container.getConnectionUri();
  try {
    await Promise.all([migrate(url), migrate(url)]);
    const { client } = connect(url);
    try {
      await expect(
        client`insert into instance_settings (id,instance_id) values (2,'019a3cc0-0000-7000-8000-000000000001')`,
      ).rejects.toThrow();
      await expect(
        client`insert into "user" (id,name,email,role) values ('019a3cc0-0000-7000-8000-000000000002','test','test@example.com','root')`,
      ).rejects.toThrow();
      const columns =
        await client`select column_name from information_schema.columns where table_name='credentials'`;
      expect(columns.map((x) => x.column_name)).not.toContain('key');
    } finally {
      await client.end();
    }
  } finally {
    await container.stop();
  }
});

it('refuses a database with a synthetic future migration without changing it', async () => {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const url = container.getConnectionUri();
  const { client } = connect(url);
  try {
    await migrate(url);
    await client`insert into drizzle.__drizzle_migrations (hash, created_at) values ('future-image-hash', 9999999999999)`;
    const before = await client`select schemaname,tablename from pg_tables where schemaname in ('public','drizzle') order by 1,2`;
    await expect(migrate(url)).rejects.toBeInstanceOf(SchemaAheadError);
    const after = await client`select schemaname,tablename from pg_tables where schemaname in ('public','drizzle') order by 1,2`;
    expect(after).toEqual(before);
  } finally {
    await client.end();
    await container.stop();
  }
});

it('upgrades a v0.2 gateway and preserves revoked history when removed', async () => {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const { client } = connect(container.getConnectionUri());
  try {
    const { readFile } = await import('node:fs/promises');
    const original = await readFile(
      new URL('../migrations/0000_0000_init.sql', import.meta.url),
      'utf8',
    );
    await client.unsafe(original);
    await client`insert into gateways (id,name,kind,admin_url,proxy_public_url,proxy_internal_url) values ('019a3cc0-0000-7000-8000-000000000001','default','kong','http://kong:8001','http://localhost:8000','http://kong:8000')`;
    await client`insert into "user" (id,name,email,role) values ('019a3cc0-0000-7000-8000-000000000002','Test','upgrade@example.com','admin')`;
    await client`insert into apps (id,owner_id,name) values ('019a3cc0-0000-7000-8000-000000000003','019a3cc0-0000-7000-8000-000000000002','Upgrade')`;
    await client`insert into credentials (id,app_id,gateway_id,key_hint,status) values ('019a3cc0-0000-7000-8000-000000000004','019a3cc0-0000-7000-8000-000000000003','019a3cc0-0000-7000-8000-000000000001','1234','revoked')`;
    await client`insert into credentials (id,app_id,gateway_id,key_hint,status) values ('019a3cc0-0000-7000-8000-000000000007','019a3cc0-0000-7000-8000-000000000003','019a3cc0-0000-7000-8000-000000000001','5678','active')`;
    await client`insert into gateway_consumers (id,app_id,gateway_id,external_id,username) values ('019a3cc0-0000-7000-8000-000000000005','019a3cc0-0000-7000-8000-000000000003','019a3cc0-0000-7000-8000-000000000001','external','consumer')`;
    await client.unsafe(
      await readFile(
        new URL('../migrations/0001_gateway_connections.sql', import.meta.url),
        'utf8',
      ),
    );
    const [gateway] = await client`select managed_by,enabled from gateways`;
    expect(gateway).toEqual({ managed_by: 'admin', enabled: true });
    expect(await client`select role from "user"`).toEqual([{ role: 'admin' }]);
    expect(
      await client`select gateway_id,key_hint,status from credentials where status='active'`,
    ).toEqual([
      {
        gateway_id: '019a3cc0-0000-7000-8000-000000000001',
        key_hint: '5678',
        status: 'active',
      },
    ]);
    expect(await client`select external_id from gateway_consumers`).toEqual([
      { external_id: 'external' },
    ]);
    await expect(
      client`insert into gateways (id,name,kind,admin_url,proxy_public_url,proxy_internal_url) values ('019a3cc0-0000-7000-8000-000000000006','second','kong','http://kong:8001','http://localhost:8000','http://kong:8000')`,
    ).rejects.toThrow();
    await client`update credentials set status='active'`;
    await expect(client`delete from gateways`).rejects.toThrow();
    await client`update credentials set status='revoked'`;
    await client`delete from gateways`;
    expect(await client`select gateway_id,status from credentials`).toEqual([
      { gateway_id: null, status: 'revoked' },
      { gateway_id: null, status: 'revoked' },
    ]);
    expect(await client`select * from gateway_consumers`).toHaveLength(0);
  } finally {
    await client.end();
    await container.stop();
  }
});

it('upgrades a v0.2 database, verifies existing accounts and preserves APIs after account deletion', async () => {
  const { readFile, mkdtemp, mkdir, writeFile, rm } =
    await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { migrate: runMigration } =
    await import('drizzle-orm/postgres-js/migrator');
  const folder = await mkdtemp(join(tmpdir(), 'portal-v02-'));
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const { client } = connect(container.getConnectionUri());
  try {
    await mkdir(join(folder, 'meta'));
    const journal = JSON.parse(
      await readFile(
        new URL('../migrations/meta/_journal.json', import.meta.url),
        'utf8',
      ),
    );
    journal.entries = journal.entries.slice(0, 1);
    await writeFile(
      join(folder, 'meta/_journal.json'),
      JSON.stringify(journal),
    );
    await writeFile(
      join(folder, '0000_0000_init.sql'),
      await readFile(
        new URL('../migrations/0000_0000_init.sql', import.meta.url),
      ),
    );
    await runMigration(drizzle(client), { migrationsFolder: folder });
    const id = '019a3cc0-0000-7000-8000-000000000002';
    await client`insert into "user" (id,name,email,role,email_verified) values (${id},'Old admin','old@example.com','admin',false)`;
    const gatewayId = '019a3cc0-0000-7000-8000-000000000003';
    const apiId = '019a3cc0-0000-7000-8000-000000000004';
    await client`insert into gateways (id,name,kind,admin_url,proxy_public_url,proxy_internal_url) values (${gatewayId},'test','kong','http://kong:8001','http://localhost:8000','http://kong:8000')`;
    await client`insert into apis (id,slug,title,version,gateway_id,gateway_service_id,gateway_service_name,route_path,document,created_by) values (${apiId},'test','Test','1',${gatewayId},'service','test','/test','{}',${id})`;
    await migrate(container.getConnectionUri());
    expect(
      (await client`select email_verified from "user" where id=${id}`)[0]!
        .email_verified,
    ).toBe(true);
    expect(
      (await client`select require_verified_email from account_settings`)[0]!
        .require_verified_email,
    ).toBe(false);
    await expect(
      client`update account_settings set reset_email_max=0`,
    ).rejects.toThrow();
    await expect(
      client`update account_settings set verification_email_window_minutes=1441`,
    ).rejects.toThrow();
    await expect(
      client`insert into mail_settings (id,host,port,security,sender_name,sender_address) values (2,'mail',1025,'none','Portal','a@example.com')`,
    ).rejects.toThrow();
    await expect(
      client`insert into rate_limit_hits (id,bucket,subject_hash) values (${id},'invalid','hash')`,
    ).rejects.toThrow();
    const [fk] =
      await client`select confdeltype from pg_constraint where conname='apis_created_by_user_id_fk'`;
    expect(fk!.confdeltype).toBe('n');
    await client`delete from "user" where id=${id}`;
    expect(
      (await client`select created_by from apis where id=${apiId}`)[0]!
        .created_by,
    ).toBeNull();
    expect(
      (
        await client`select created_by from api_versions where api_id=${apiId}`
      )[0]!.created_by,
    ).toBeNull();
  } finally {
    await client.end();
    await container.stop();
    await rm(folder, { recursive: true, force: true });
  }
});
