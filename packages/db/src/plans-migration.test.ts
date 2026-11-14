// SPDX-License-Identifier: Apache-2.0
import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { connect, BUILTIN_PLAN_ID } from './index.js';
it('backfills Unlimited without changing existing subscriptions and enforces plan membership', async () => {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const { client } = connect(container.getConnectionUri());
  const id = '019a3cc0-0000-7000-8000-000000000001';
  const other = '019a3cc0-0000-7000-8000-000000000002';
  try {
    for (const name of [
      '0000_0000_init',
      '0001_gateway_connections',
      '0002_api_versions',
      '0003_email_and_account_security',
      '0004_teams',
    ])
      await client.begin(async (tx) => {
        await tx.unsafe(
          await readFile(
            new URL(`../migrations/${name}.sql`, import.meta.url),
            'utf8',
          ),
        );
      });
    await client`insert into teams(id,name) values (${id},'Team')`;
    await client`insert into apps(id,team_id,name) values (${id},${id},'Legacy')`;
    await client`insert into gateways(id,name,kind,admin_url,proxy_public_url,proxy_internal_url) values (${id},'Kong','kong','http://kong','http://kong','http://kong')`;
    await client`insert into apis(id,slug,gateway_id,gateway_service_id,gateway_service_name,route_path) values (${id},'api',${id},'service','service','/api')`;
    await client`insert into subscriptions(id,app_id,api_id) values (${id},${id},${id})`;
    const before = await client`select * from subscriptions`;
    await client.begin(async (tx) => {
      await tx.unsafe(
        await readFile(
          new URL('../migrations/0005_watery_rachel_grey.sql', import.meta.url),
          'utf8',
        ),
      );
    });
    expect(await client`select plan_id from apps`).toEqual([
      { plan_id: BUILTIN_PLAN_ID },
    ]);
    expect(await client`select * from subscriptions`).toEqual(before);
    expect(await client`select name,builtin from plans`).toEqual([
      { name: 'Unlimited', builtin: true },
    ]);
    await client`insert into products(id,slug,name,description) values (${id},'product','Product','Description')`;
    await client`insert into plans(id,product_id,name,rate_limit,rate_limit_unit,monthly_quota) values (${id},${id},'Free',5,'second',10)`;
    await expect(
      client`insert into plan_apis(plan_id,product_id,api_id) values (${id},${id},${id})`,
    ).rejects.toThrow();
    await client`insert into product_apis(product_id,api_id) values (${id},${id})`;
    await client`insert into plan_apis(plan_id,product_id,api_id) values (${id},${id},${id})`;
    await expect(client`delete from product_apis`).rejects.toThrow();
    await expect(
      client`insert into plans(id,name,builtin) values (${other},'Other',true)`,
    ).rejects.toThrow();
    await expect(
      client`update plans set rate_limit=null where id=${id}`,
    ).rejects.toThrow();
    await expect(
      client`update plans set monthly_quota=1 where id=${id}`,
    ).rejects.toThrow();
    await expect(
      client`delete from plans where id=${BUILTIN_PLAN_ID}`,
    ).rejects.toThrow();
  } finally {
    await client.end();
    await container.stop();
  }
});
