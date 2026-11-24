// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { connect } from './index.js';

const prelude = fileURLToPath(
  new URL('../../../deploy/production/restore-prelude.sh', import.meta.url),
);

const archiveList = `
;
; Selected TOC Entries:
;
219; 1259 16390 TABLE public notes postgres
218; 1259 16389 SEQUENCE public notes_id_seq postgres
217; 1259 16384 TABLE public user postgres
3464; 0 16390 TABLE DATA public notes postgres
3472; 0 0 SEQUENCE SET public notes_id_seq postgres
3316; 2606 16395 FK CONSTRAINT public notes notes_user_id_fkey postgres
9; 1259 1 TABLE public o'reilly postgres
`.trim();

function command(file: string, args: string[], input?: string | Buffer) {
  return execFileSync(file, args, {
    input,
    encoding: input && !Buffer.isBuffer(input) ? 'utf8' : undefined,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

it('lists public archive objects and escapes names', () => {
  const sql = command('sh', [prelude], `${archiveList}\n`);
  expect(sql).toContain("('table', NULL, 'notes')");
  expect(sql).toContain("('table', NULL, 'user')");
  expect(sql).toContain("('sequence', NULL, 'notes_id_seq')");
  expect(sql).toContain("('fk', 'notes', 'notes_user_id_fkey')");
  expect(sql).toContain("('table', NULL, 'o''reilly')");
  expect(sql).not.toContain('TABLE DATA');
  expect(sql).not.toContain('SEQUENCE SET');
});

it('restores a pre-upgrade dump after newer foreign keys reference user_pkey', async () => {
  const container = await new PostgreSqlContainer('postgres:17-alpine')
    .withUsername('portal')
    .withDatabase('portal')
    .withPassword('portal')
    .start();
  const id = container.getId();
  const { client } = connect(container.getConnectionUri());
  const userId = '019a3cc0-0000-7000-8000-0000000000b1';
  const noteId = '019a3cc0-0000-7000-8000-0000000000b2';
  const psql = (sql: string) =>
    command(
      'docker',
      [
        'exec',
        '-i',
        id,
        'psql',
        '-U',
        'portal',
        '-d',
        'portal',
        '-v',
        'ON_ERROR_STOP=1',
        '--single-transaction',
      ],
      sql,
    );
  try {
    await client`create table "user" (id uuid primary key, email text not null)`;
    await client`create table notes (
      id uuid primary key,
      user_id uuid references "user"(id) on delete set null
    )`;
    await client`insert into "user" (id, email) values (${userId}, 'dev@example.com')`;
    await client`insert into notes (id, user_id) values (${noteId}, ${userId})`;
    const dump = command('docker', [
      'exec',
      '-e',
      'PGPASSWORD=portal',
      id,
      'pg_dump',
      '-U',
      'portal',
      '-d',
      'portal',
      '-Fc',
    ]) as Buffer;
    await client`create table pages (
      id uuid primary key,
      created_by uuid,
      updated_by uuid
    )`;
    await client`create table navigation_settings (id smallint primary key, updated_by uuid)`;
    await client`alter table pages
      add constraint pages_created_by_user_id_fk
      foreign key (created_by) references "user"(id) on delete set null`;
    await client`alter table pages
      add constraint pages_updated_by_user_id_fk
      foreign key (updated_by) references "user"(id) on delete set null`;
    await client`alter table navigation_settings
      add constraint navigation_settings_updated_by_user_id_fk
      foreign key (updated_by) references "user"(id) on delete set null`;
    const clean = command(
      'docker',
      ['exec', '-i', id, 'pg_restore', '--clean', '--if-exists', '--no-owner', '--file=-'],
      dump,
    );
    let blocked = false;
    try {
      psql(String(clean));
    } catch (error) {
      blocked = true;
      const stderr = String((error as { stderr?: Buffer | string }).stderr ?? '');
      expect(stderr).toMatch(/cannot drop constraint user_pkey/);
      expect(stderr).toMatch(/pages_created_by_user_id_fk/);
    }
    expect(blocked).toBe(true);
    expect(await client`select to_regclass('public.pages')::text as name`).toEqual([
      { name: 'pages' },
    ]);

    const list = command('docker', ['exec', '-i', id, 'pg_restore', '--list'], dump);
    const restored = `${command('sh', [prelude], String(list))}\n${clean}`;
    psql(restored);
    expect(await client`select email from "user"`).toEqual([{ email: 'dev@example.com' }]);
    expect(await client`select id::text as id from notes`).toEqual([{ id: noteId }]);
    expect(await client`select to_regclass('public.pages')::text as name`).toEqual([
      { name: null },
    ]);
    expect(
      await client`select to_regclass('public.navigation_settings')::text as name`,
    ).toEqual([{ name: null }]);
    const constraints = await client`
      select conname
      from pg_constraint
      where contype in ('p', 'f')
        and connamespace = 'public'::regnamespace
      order by 1
    `;
    expect(constraints.map((row) => row.conname)).toEqual([
      'notes_pkey',
      'notes_user_id_fkey',
      'user_pkey',
    ]);
  } finally {
    await client.end();
    await container.stop();
  }
});
