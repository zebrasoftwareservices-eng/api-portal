// SPDX-License-Identifier: Apache-2.0
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate as drizzleMigrate } from 'drizzle-orm/postgres-js/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';
export * from './schema.js';
export { schema };
export function connect(url: string) {
  const client = postgres(url, { max: 10 });
  return { client, db: drizzle(client, { schema }) };
}
export type Database = ReturnType<typeof connect>['db'];
export class SchemaAheadError extends Error {
  constructor() {
    super('Database schema is newer than this portal image');
    this.name = 'SchemaAheadError';
  }
}
export async function migrate(url: string) {
  const client = postgres(url, { max: 1 });
  try {
    // A dedicated max:1 pool keeps the lock and migration on one session.
    await client`select pg_advisory_lock(71833001)`;
    try {
      const migrationsFolder = fileURLToPath(
        new URL('../migrations', import.meta.url),
      );
      const local = readMigrationFiles({ migrationsFolder });
      const knownHashes = new Set(local.map((migration) => migration.hash));
      const newest = Math.max(...local.map((migration) => migration.folderMillis));
      const [exists] = await client<{ exists: string | null }[]>`
        select to_regclass('drizzle.__drizzle_migrations')::text as exists
      `;
      if (exists?.exists) {
        const applied = await client<{ hash: string; created_at: string }[]>`
          select hash, created_at from drizzle.__drizzle_migrations
        `;
        if (
          applied.some(
            (migration) =>
              Number(migration.created_at) > newest ||
              !knownHashes.has(migration.hash),
          )
        )
          throw new SchemaAheadError();
      }
      await drizzleMigrate(drizzle(client), {
        migrationsFolder,
      });
    } finally {
      await client`select pg_advisory_unlock(71833001)`;
    }
  } finally {
    await client.end();
  }
}
