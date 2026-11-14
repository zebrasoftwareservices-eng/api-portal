// SPDX-License-Identifier: Apache-2.0
import { sql } from 'drizzle-orm';
import type { Db } from './app-plans.js';
// Run pg-boss's parameterized INSERT on the same transaction as the state change.
export function jobDb(db: Db) {
  return {
    async executeSql(text: string, values: unknown[]) {
      const normalized = values.map((value) =>
        value != null && typeof value === 'object' && !(value instanceof Date)
          ? JSON.stringify(value)
          : (value ?? null),
      );
      const chunks = text
        .split(/\$(\d+)/g)
        .map((part, i) =>
          i % 2 ? sql`${normalized[Number(part) - 1]}` : sql.raw(part),
        );
      const rows = await db.execute(sql.join(chunks, sql.empty()));
      return { rows: [...rows] };
    },
  };
}
