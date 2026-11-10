// SPDX-License-Identifier: Apache-2.0
import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { connect } from './index.js';
it('backfills personal teams with UUIDv7 while preserving apps, credentials and consumers', async () => {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const { client } = connect(container.getConnectionUri());
  const owner = '019a3cc0-0000-7000-8000-000000000001';
  const app = '019a3cc0-0000-7000-8000-000000000002';
  const gateway = '019a3cc0-0000-7000-8000-000000000003';
  const key = '019a3cc0-0000-7000-8000-000000000004';
  try {
    for (const name of [
      '0000_0000_init',
      '0001_gateway_connections',
      '0002_api_versions',
      '0003_email_and_account_security',
    ]) {
      await client.begin(async (tx) => {
        await tx.unsafe(
          await readFile(
            new URL(`../migrations/${name}.sql`, import.meta.url),
            'utf8',
          ),
        );
      });
    }
    await client`insert into "user" (id,name,email,role,created_at) values (${owner},'Owner','owner@example.com','developer','2024-03-01T10:00:00Z')`;
    await client`insert into gateways (id,name,kind,admin_url,proxy_public_url,proxy_internal_url) values (${gateway},'Kong','kong','http://kong','http://kong','http://kong')`;
    await client`insert into apps (id,owner_id,name) values (${app},${owner},'Existing')`;
    await client`insert into credentials (id,app_id,gateway_id,key_hint,status) values (${key},${app},${gateway},'1234','active')`;
    await client`insert into gateway_consumers (id,app_id,gateway_id,external_id,username) values (${key},${app},${gateway},'external','consumer')`;
    const credentialsBefore = await client`select * from credentials`;
    const consumersBefore = await client`select * from gateway_consumers`;
    await client.begin(async (tx) => {
      await tx.unsafe(
        await readFile(
          new URL('../migrations/0004_teams.sql', import.meta.url),
          'utf8',
        ),
      );
    });
    const [team] =
      await client`select t.*,m.role,m.user_id,a.created_by as app_creator from teams t join team_members m on m.team_id=t.id join apps a on a.team_id=t.id`;
    expect(team).toMatchObject({
      name: 'Personal',
      personal_owner_id: owner,
      role: 'admin',
      user_id: owner,
      app_creator: owner,
    });
    expect(new Date(team!.created_at).toISOString()).toBe(
      '2024-03-01T10:00:00.000Z',
    );
    expect(team!.id[14]).toBe('7');
    expect(parseInt(team!.id.replaceAll('-', '').slice(0, 12), 16)).toBe(
      Date.parse('2024-03-01T10:00:00Z'),
    );
    expect(await client`select * from credentials`).toEqual(credentialsBefore);
    expect(await client`select * from gateway_consumers`).toEqual(
      consumersBefore,
    );
    await expect(
      client`delete from teams where id=${team!.id}`,
    ).rejects.toThrow();
    await expect(
      client`insert into apps(id,team_id,name) values (${owner},${team!.id},'Existing')`,
    ).rejects.toThrow();
    await expect(
      client`update team_members set role='owner'`,
    ).rejects.toThrow();
    await client`insert into rate_limit_hits(id,bucket,subject_hash) values (${owner},'team-invitation','hash')`;
    const otherTeam = '019a3cc0-0000-7000-8000-000000000005';
    await client`insert into teams(id,name) values (${otherTeam},'Shared')`;
    await client`insert into apps(id,team_id,created_by,name) values (${otherTeam},${otherTeam},${owner},'Existing')`;
    await client`delete from apps where team_id=${team!.id}`;
    await client`delete from "user" where id=${owner}`;
    expect(await client`select created_by from apps`).toEqual([
      { created_by: null },
    ]);
    expect(await client`select name from teams`).toEqual([{ name: 'Shared' }]);
  } finally {
    await client.end();
    await container.stop();
  }
});
