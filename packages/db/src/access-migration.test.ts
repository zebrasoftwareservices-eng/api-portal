// SPDX-License-Identifier: Apache-2.0
import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { connect } from './index.js';
it('upgrades existing subscriptions unchanged and enforces pending request and live name uniqueness', async () => {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const { client } = connect(container.getConnectionUri());
  const id = '019a3cc0-0000-7000-8000-000000000001';
  const other = '019a3cc0-0000-7000-8000-000000000002';
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
    await client`insert into teams(id,name) values (${id},'Team')`;
    await client`insert into products(id,slug,name,description) values (${id},'product','Product','Description')`;
    await client`insert into plans(id,product_id,name,rate_limit,rate_limit_unit,monthly_quota) values (${id},${id},'Free',5,'second',10)`;
    await client`insert into apps(id,team_id,name,plan_id) values (${id},${id},'Legacy',${id})`;
    await client.unsafe(
      await readFile(
        new URL(
          `../migrations/${journal.entries.at(-1)!.tag}.sql`,
          import.meta.url,
        ),
        'utf8',
      ),
    );
    expect(await client`select visibility from products`).toEqual([
      { visibility: 'open' },
    ]);
    expect(
      await client`select requires_approval from plans where id=${id}`,
    ).toEqual([{ requires_approval: false }]);
    expect(
      await client`select status,origin,key_issued,revoked_at from apps`,
    ).toEqual([
      { status: 'active', origin: 'self', key_issued: true, revoked_at: null },
    ]);
    await expect(
      client`insert into apps(id,team_id,name,plan_id) values (${other},${id},'Legacy',${id})`,
    ).rejects.toThrow();
    await client`update apps set status='revoked' where id=${id}`;
    await client`insert into apps(id,team_id,name,plan_id) values (${other},${id},'Legacy',${id})`;
    await client`insert into access_requests(id,kind,team_id,plan_id,name,reason) values (${id},'subscribe',${id},${id},'Requested','Need access')`;
    await expect(
      client`insert into access_requests(id,kind,team_id,plan_id,name,reason) values (${other},'subscribe',${id},${id},'Other','Need access')`,
    ).rejects.toThrow();
    await client`update access_requests set status='rejected'`;
    await client`insert into access_requests(id,kind,team_id,plan_id,app_id,name,reason) values (${other},'plan-change',${id},${id},${other},'Legacy','Change')`;
    await client`delete from access_requests where id=${id}`;
    await expect(
      client`insert into access_requests(id,kind,team_id,plan_id,app_id,name,reason) values (${id},'plan-change',${id},${id},${other},'Legacy','Change')`,
    ).rejects.toThrow();
    await expect(
      client`update access_requests set reason=''`,
    ).rejects.toThrow();
    await expect(
      client`update access_requests set decision_note=${'a'.repeat(1001)}`,
    ).rejects.toThrow();
    await expect(
      client`update products set visibility='unknown'`,
    ).rejects.toThrow();
  } finally {
    await client.end();
    await container.stop();
  }
});
