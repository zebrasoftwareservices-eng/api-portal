// SPDX-License-Identifier: Apache-2.0
import { expect, it } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { connect, migrate } from './index.js';

it('creates empty pages and navigation tables and enforces their checks', async () => {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const url = container.getConnectionUri();
  const { client } = connect(url);
  const userId = '019a3cc0-0000-7000-8000-0000000000b1';
  try {
    await migrate(url);
    expect(await client`select count(*)::int as count from pages`).toEqual([{ count: 0 }]);
    expect(await client`select count(*)::int as count from navigation_settings`).toEqual([
      { count: 0 },
    ]);
    const columns = async (table: string) =>
      (
        await client`select column_name from information_schema.columns where table_name = ${table}`
      )
        .map((row) => row.column_name)
        .sort();
    expect(await columns('pages')).toEqual([
      'body',
      'created_at',
      'created_by',
      'description',
      'id',
      'og_image_url',
      'seo_title',
      'slug',
      'status',
      'title',
      'updated_at',
      'updated_by',
      'visibility',
    ]);
    expect(await columns('navigation_settings')).toEqual([
      'footer',
      'header',
      'id',
      'updated_at',
      'updated_by',
    ]);
    await client`insert into "user" (id, name, email, role) values (${userId}, 'Pages', 'pages@example.com', 'admin')`;
    const pageId = '019a3cc0-0000-7000-8000-0000000000b2';
    await client`insert into pages (id, slug, title, visibility, created_by, updated_by) values (${pageId}, 'getting-started', 'Getting started', 'public', ${userId}, ${userId})`;
    await expect(
      client`insert into pages (id, slug, title, visibility) values ('019a3cc0-0000-7000-8000-0000000000b3', 'Bad Slug', 'Title', 'public')`,
    ).rejects.toThrow();
    await expect(
      client`insert into pages (id, slug, title, visibility) values ('019a3cc0-0000-7000-8000-0000000000b4', 'ok-slug', '   ', 'public')`,
    ).rejects.toThrow();
    await expect(
      client`insert into pages (id, slug, title, visibility) values ('019a3cc0-0000-7000-8000-0000000000b5', 'other-slug', 'Title', 'team')`,
    ).rejects.toThrow();
    await expect(
      client`insert into navigation_settings (id, header, footer) values (2, '[]', '[]')`,
    ).rejects.toThrow();
    const deletes = await client`
      select conrelid::regclass::text as table_name, confdeltype
      from pg_constraint
      where contype = 'f'
        and conrelid in ('pages'::regclass, 'navigation_settings'::regclass)
      order by 1
    `;
    expect(deletes.every((row) => row.confdeltype === 'n')).toBe(true);
    expect(deletes.map((row) => row.table_name).sort()).toEqual([
      'navigation_settings',
      'pages',
      'pages',
    ]);
    await client`delete from "user" where id = ${userId}`;
    expect(await client`select created_by, updated_by from pages`).toEqual([
      { created_by: null, updated_by: null },
    ]);
    expect(await client`select count(*)::int as count from pages`).toEqual([{ count: 1 }]);
  } finally {
    await client.end();
    await container.stop();
  }
});
