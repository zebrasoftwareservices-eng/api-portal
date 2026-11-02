// SPDX-License-Identifier: Apache-2.0
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate as drizzleMigrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';
export * from './schema.js';
export { schema };
export function connect(url: string) {
  const client = postgres(url, { max: 10 });
  return { client, db: drizzle(client, { schema }) };
}
export type Database = ReturnType<typeof connect>['db'];
export async function migrate(url: string) {
  const client = postgres(url, { max: 1 });
  try {
    // A dedicated max:1 pool keeps the lock and migration on one session.
    await client`select pg_advisory_lock(71833001)`;
    try {
      await drizzleMigrate(drizzle(client), {
        migrationsFolder: fileURLToPath(
          new URL('../migrations', import.meta.url),
        ),
      });
    } finally {
      await client`select pg_advisory_unlock(71833001)`;
    }
  } finally {
    await client.end();
  }
}
