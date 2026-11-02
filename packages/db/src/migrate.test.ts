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
