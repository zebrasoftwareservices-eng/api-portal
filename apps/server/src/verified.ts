// SPDX-License-Identifier: Apache-2.0
import type { Database } from '@portal/db';
import type { Tx } from './auth-limits.js';
import { readAccountSettings } from './auth-limits.js';
import { securityProblem } from './security-problems.js';
export async function requireVerified(
  db: Database | Tx,
  user: { emailVerified: boolean },
) {
  if (
    !user.emailVerified &&
    (await readAccountSettings(db)).requireVerifiedEmail
  )
    throw securityProblem(403, 'email-not-verified');
}
