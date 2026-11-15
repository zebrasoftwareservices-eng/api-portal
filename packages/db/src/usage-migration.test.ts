// SPDX-License-Identifier: Apache-2.0
import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { connect } from './index.js';
it('backfills credential creators and cascades aggregate and first-call rows', async () => {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const { client } = connect(container.getConnectionUri());
  const id = '019a3cc0-0000-7000-8000-000000000001';
  try {
    const journal = JSON.parse(
      await readFile(
        new URL('../migrations/meta/_journal.json', import.meta.url),
        'utf8',
      ),
    ) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries.slice(0, -1))
      await client.unsafe(
        await readFile(
          new URL(`../migrations/${tag}.sql`, import.meta.url),
          'utf8',
        ),
      );
    await client`insert into "user" (id,name,email,role) values (${id},'Developer','usage@example.com','developer')`;
    await client`insert into teams (id,name,created_by) values (${id},'Team',${id})`;
    await client`insert into apps (id,team_id,name,created_by) values (${id},${id},'App',${id})`;
    await client`insert into credentials (id,app_id,key_hint,status) values (${id},${id},'1234','revoked')`;
    await client.unsafe(
      await readFile(
        new URL(
          `../migrations/${journal.entries.at(-1)!.tag}.sql`,
          import.meta.url,
        ),
        'utf8',
      ),
    );
    expect(await client`select created_by from credentials`).toEqual([
      { created_by: id },
    ]);
    await client`insert into usage_daily (app_id,day,count_2xx) values (${id},'2026-11-01',20)`;
    await client`insert into developer_first_calls (user_id,app_id,credential_id,first_call_at) values (${id},${id},${id},now())`;
    await client`delete from apps where id=${id}`;
    expect(await client`select * from usage_daily`).toEqual([]);
    expect(
      await client`select app_id,credential_id from developer_first_calls`,
    ).toEqual([{ app_id: null, credential_id: id }]);
    await client`delete from "user" where id=${id}`;
    expect(await client`select * from developer_first_calls`).toEqual([]);
  } finally {
    await client.end();
    await container.stop();
  }
});
