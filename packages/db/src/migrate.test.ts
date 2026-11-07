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
    await client`insert into "user" (id,name,email,role) values ('019a3cc0-0000-7000-8000-000000000002','Test','upgrade@example.com','developer')`;
    await client`insert into apps (id,owner_id,name) values ('019a3cc0-0000-7000-8000-000000000003','019a3cc0-0000-7000-8000-000000000002','Upgrade')`;
    await client`insert into credentials (id,app_id,gateway_id,key_hint,status) values ('019a3cc0-0000-7000-8000-000000000004','019a3cc0-0000-7000-8000-000000000003','019a3cc0-0000-7000-8000-000000000001','1234','revoked')`;
    await client`insert into gateway_consumers (id,app_id,gateway_id,external_id,username) values ('019a3cc0-0000-7000-8000-000000000005','019a3cc0-0000-7000-8000-000000000003','019a3cc0-0000-7000-8000-000000000001','external','consumer')`;
    await client.unsafe(
      await readFile(
        new URL('../migrations/0001_gateway_connections.sql', import.meta.url),
        'utf8',
      ),
    );
    const [gateway] = await client`select managed_by,enabled from gateways`;
    expect(gateway).toEqual({ managed_by: 'admin', enabled: true });
    await expect(
      client`insert into gateways (id,name,kind,admin_url,proxy_public_url,proxy_internal_url) values ('019a3cc0-0000-7000-8000-000000000006','second','kong','http://kong:8001','http://localhost:8000','http://kong:8000')`,
    ).rejects.toThrow();
    await client`update credentials set status='active'`;
    await expect(client`delete from gateways`).rejects.toThrow();
    await client`update credentials set status='revoked'`;
    await client`delete from gateways`;
    expect(await client`select gateway_id,status from credentials`).toEqual([
      { gateway_id: null, status: 'revoked' },
    ]);
    expect(await client`select * from gateway_consumers`).toHaveLength(0);
  } finally {
    await client.end();
    await container.stop();
  }
});
