// SPDX-License-Identifier: Apache-2.0
import { gatewayOperations } from '@portal/db';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { Db } from './app-plans.js';
import { Problem } from './problem.js';
export const PENDING_OPERATION_GRACE_MS = 10 * 60_000;
export type OperationKind =
  | 'create-app'
  | 'issue-credential'
  | 'revoke-credential';
export function gatewayChanged() {
  return new Problem(
    409,
    'gateway-changed',
    'The gateway changed during this request. Nothing was saved.',
  );
}
export async function beginOperation(
  tx: Db,
  input: {
    kind: OperationKind;
    appId: string;
    credentialId?: string;
    gatewayId: string;
  },
) {
  const id = uuidv7();
  await tx.insert(gatewayOperations).values({
    id,
    kind: input.kind,
    appId: input.appId,
    credentialId: input.credentialId,
    gatewayId: input.gatewayId,
  });
  return id;
}
export async function endOperation(db: Db, id: string) {
  await db.delete(gatewayOperations).where(eq(gatewayOperations.id, id));
}
