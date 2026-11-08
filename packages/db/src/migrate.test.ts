// SPDX-License-Identifier: Apache-2.0
import { it, expect } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { connect, migrate } from './index.js';
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
    const gatewayId = '019a3cc0-0000-7000-8000-000000000003';
    const apiId = '019a3cc0-0000-7000-8000-000000000004';
    await client`insert into gateways (id,name,kind,admin_url,proxy_public_url,proxy_internal_url) values (${gatewayId},'test','kong','http://kong:8001','http://localhost:8000','http://kong:8000')`;
    await client`insert into apis (id,slug,title,version,gateway_id,gateway_service_id,gateway_service_name,route_path,document,created_by) values (${apiId},'test','Test','1',${gatewayId},'service','test','/test','{}',${id})`;
    await client`delete from "user" where id=${id}`;
    expect(
      (await client`select created_by from apis where id=${apiId}`)[0]!
        .created_by,
    ).toBeNull();
  } finally {
    await client.end();
    await container.stop();
    await rm(folder, { recursive: true, force: true });
  }
});
