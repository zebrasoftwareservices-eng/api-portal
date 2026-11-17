// SPDX-License-Identifier: Apache-2.0
import { expect, it } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { connect, migrate } from './index.js';

it('creates empty theme tables and enforces the singleton, asset and delete rules', async () => {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const url = container.getConnectionUri();
  const { client } = connect(url);
  const userId = '019a3cc0-0000-7000-8000-0000000000a1';
  try {
    await migrate(url);
    expect(await client`select count(*)::int as count from theme_settings`).toEqual([
      { count: 0 },
    ]);
    expect(await client`select count(*)::int as count from theme_assets`).toEqual([
      { count: 0 },
    ]);
    const columns = async (table: string) =>
      (
        await client`select column_name from information_schema.columns where table_name=${table}`
      )
        .map((row) => row.column_name)
        .sort();
    expect(await columns('theme_settings')).toEqual([
      'custom_css',
      'id',
      'updated_at',
      'updated_by',
      'values',
    ]);
    expect(await columns('theme_assets')).toEqual([
      'byte_size',
      'content_type',
      'data',
      'kind',
      'sha256',
      'updated_at',
    ]);
    await expect(
      client`insert into theme_settings (id, values) values (2, '{}')`,
    ).rejects.toThrow();
    await client`insert into "user" (id, name, email, role) values (${userId}, 'Theme', 'theme@example.com', 'admin')`;
    await client`insert into theme_settings (id, values, updated_by) values (1, '{"font":"system"}', ${userId})`;
    await client`insert into theme_assets (kind, content_type, data, byte_size, sha256) values ('logo', 'image/png', ${Buffer.from([0x89, 0x50, 0x4e, 0x47])}, 4, 'abc')`;
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await expect(
      client`insert into theme_assets (kind, content_type, data, byte_size, sha256) values ('banner', 'image/png', ${png}, 4, 'abc')`,
    ).rejects.toThrow();
    await expect(
      client`insert into theme_assets (kind, content_type, data, byte_size, sha256) values ('favicon', 'image/gif', ${png}, 4, 'abc')`,
    ).rejects.toThrow();
    await expect(
      client`insert into theme_assets (kind, content_type, data, byte_size, sha256) values ('favicon', 'image/png', ${png}, 0, 'abc')`,
    ).rejects.toThrow();
    await expect(
      client`insert into theme_assets (kind, content_type, data, byte_size, sha256) values ('favicon', 'image/png', ${png}, 524289, 'abc')`,
    ).rejects.toThrow();
    const [fk] =
      await client`select confdeltype from pg_constraint where conrelid = 'theme_settings'::regclass and contype = 'f'`;
    expect(fk!.confdeltype).toBe('n');
    await client`delete from "user" where id = ${userId}`;
    expect(await client`select updated_by from theme_settings`).toEqual([
      { updated_by: null },
    ]);
  } finally {
    await client.end();
    await container.stop();
  }
});
