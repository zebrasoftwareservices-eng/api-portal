// SPDX-License-Identifier: Apache-2.0
import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { connect } from './index.js';
it('backfills populated spec 004 APIs, preserves subscriptions, and constrains latest to its API', async () => {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const { client } = connect(container.getConnectionUri());
  try {
    await client.unsafe(
      await readFile(
        new URL('../migrations/0000_0000_init.sql', import.meta.url),
        'utf8',
      ),
    );
    const api = '019a3cc0-0000-7000-8000-000000000001',
      gateway = '019a3cc0-0000-7000-8000-000000000002',
      owner = '019a3cc0-0000-7000-8000-000000000003',
      app = '019a3cc0-0000-7000-8000-000000000004',
      sub = '019a3cc0-0000-7000-8000-000000000005';
    await client`insert into gateways (id,name,kind,admin_url,proxy_public_url,proxy_internal_url) values (${gateway},'default','kong','http://kong','http://kong','http://kong')`;
    await client`insert into "user" (id,name,email,role) values (${owner},'Test','test@example.com','developer')`;
    await client`insert into apis (id,slug,title,version,description,gateway_id,gateway_service_id,gateway_service_name,route_path,document,source_url,created_by) values (${api},'pets','Pets','1.0.0','Preserved',${gateway},'svc','pets','/pets','{"openapi":"3.0.3","info":{"title":"Pets","version":"1.0.0"},"paths":{}}','http://example.test/spec',${owner})`;
    await client`insert into apps (id,owner_id,name) values (${app},${owner},'App')`;
    await client`insert into subscriptions (id,app_id,api_id) values (${sub},${app},${api})`;
    // Upgrade from main's spec 005 schema, preserving its gateway settings too.
    await client.unsafe(
      await readFile(
        new URL('../migrations/0001_gateway_connections.sql', import.meta.url),
        'utf8',
      ),
    );
    await client`update gateways set enabled=false, managed_by='env'`;
    await client.begin(async (tx) => {
      await tx.unsafe(
        await readFile(
          new URL('../migrations/0002_api_versions.sql', import.meta.url),
          'utf8',
        ),
      );
    });
    expect(await client`select enabled,managed_by from gateways`).toEqual([
      { enabled: false, managed_by: 'env' },
    ]);
    const [row] =
      await client`select a.id,a.latest_version_id,v.*,s.id as subscription_id from apis a join api_versions v on a.latest_version_id=v.id join subscriptions s on s.api_id=a.id`;
    expect(row).toMatchObject({
      id: api,
      api_id: api,
      latest_version_id: api,
      title: 'Pets',
      version: '1.0.0',
      description: 'Preserved',
      source_url: 'http://example.test/spec',
      created_by: owner,
      subscription_id: sub,
      lint_warnings: null,
      source_content: null,
      change_summary: null,
    });
    expect(row?.document).toMatchObject({ info: { version: '1.0.0' } });
    await expect(
      client`insert into api_versions (id,api_id,version,title,document) values ('019a3cc0-0000-7000-8000-000000000006',${api},'1.0.0','Duplicate','{}')`,
    ).rejects.toThrow();
    await client`insert into apis (id,slug,gateway_id,gateway_service_id,gateway_service_name,route_path) values ('019a3cc0-0000-7000-8000-000000000007','other',${gateway},'other','other','/other')`;
    await expect(
      client`update apis set latest_version_id=${api} where slug='other'`,
    ).rejects.toThrow();
  } finally {
    await client.end();
    await container.stop();
  }
});

it('upgrades the recorded main migration journal without replaying 0001', async () => {
  const { mkdtemp, mkdir, writeFile, copyFile, rm } =
    await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { migrate: baselineMigrate } =
    await import('drizzle-orm/postgres-js/migrator');
  const { migrate } = await import('./index.js');
  const folder = await mkdtemp(join(tmpdir(), 'portal-main-migrations-'));
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const url = container.getConnectionUri();
  const { client } = connect(url);
  try {
    await mkdir(join(folder, 'meta'));
    const journal = JSON.parse(
      await readFile(
        new URL('../migrations/meta/_journal.json', import.meta.url),
        'utf8',
      ),
    );
    journal.entries = journal.entries.slice(0, 2);
    await writeFile(
      join(folder, 'meta/_journal.json'),
      JSON.stringify(journal),
    );
    for (const { tag } of journal.entries) {
      await copyFile(
        new URL(`../migrations/${tag}.sql`, import.meta.url),
        join(folder, `${tag}.sql`),
      );
    }
    await baselineMigrate(drizzle(client), { migrationsFolder: folder });
    const originalJournal =
      await client`select hash,created_at from drizzle.__drizzle_migrations order by id`;
    await client`insert into gateways (id,name,kind,admin_url,proxy_public_url,proxy_internal_url,managed_by,enabled) values ('019a3cc0-0000-7000-8000-000000000010','default','kong','http://kong','http://kong','http://kong','env',false)`;
    await client`insert into apis (id,slug,title,version,gateway_id,gateway_service_id,gateway_service_name,route_path,document) values ('019a3cc0-0000-7000-8000-000000000011','main-api','Published on main','1.0.0','019a3cc0-0000-7000-8000-000000000010','svc','main','/main','{"info":{"version":"1.0.0"}}')`;
    await migrate(url);
    await migrate(url);
    const migrated =
      await client`select hash,created_at from drizzle.__drizzle_migrations order by id`;
    expect(migrated).toHaveLength(3);
    expect(migrated.slice(0, 2)).toEqual(originalJournal);
    expect(
      await client`select v.title,v.version from apis a join api_versions v on v.id=a.latest_version_id`,
    ).toEqual([{ title: 'Published on main', version: '1.0.0' }]);
    expect(await client`select managed_by,enabled from gateways`).toEqual([
      { managed_by: 'env', enabled: false },
    ]);
  } finally {
    await client.end();
    await container.stop();
    await rm(folder, { recursive: true, force: true });
  }
});
