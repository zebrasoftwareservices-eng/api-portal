// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from 'vitest';
import { databaseReadiness } from './app.js';
import { Problem } from './problem.js';

it('maps a database outage or timeout to a credential-free readiness problem', async () => {
  const secret = 'postgres://portal:secret@private-db:5432/portal';
  const db = { execute: vi.fn(async () => { throw new Error(secret); }) };
  await expect(databaseReadiness(db as never, 5)).rejects.toMatchObject({
    status: 503,
    code: 'database-unavailable',
    message: "The server can't reach its database.",
  } satisfies Partial<Problem>);
  try {
    await databaseReadiness(db as never, 5);
  } catch (error) {
    expect(String(error)).not.toContain(secret);
  }
});
