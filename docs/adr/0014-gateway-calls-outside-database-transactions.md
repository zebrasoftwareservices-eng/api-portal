# ADR 0014 — Gateway calls run outside database transactions, guarded by a pending-operation row

- Status: Proposed (accept by merging)
- Date: 2026-11-16
- Spec: 022-server-robustness
- Builds on: [ADR 0002](0002-gateway-adapter-contract-v0.md) (idempotent, tagged gateway calls)

## Context
App creation, key creation, subscription by an admin and access approval open one database
transaction, take advisory locks, call Kong, then write rows. The lock on gateway config
(`71833002`, shared) is what stops reconcile from deleting a consumer or key that Kong has but
the database does not have yet. The cost is that a slow Kong holds a pooled connection
(the pool has 10), its row locks and its advisory locks for the whole call.

Key revoke has the opposite problem. Kong deletes the key first. If the database update after it
fails, the row stays `active`, reconcile sees an active key missing from Kong, and it reports
drift on every run.

Options considered:
- **Session-level advisory lock held across the Kong call.** No open transaction, but it still
  holds a connection per slow call, so it does not fix starvation.
- **Outbox with a retry worker.** Fixes every path. It is a new subsystem, and spec 022 excludes it.
- **Write the app or key row first in a `pending` state.** Users and every query would have to
  hide pending rows, and a crash leaves a half-created row, which criterion 2 forbids.
- **Validate, call the gateway, validate again and commit, with a pending-operation row.**
  The chosen option.

## Decision
A request that changes Kong runs in three steps:

1. **Prepare** (short transaction). Take today's locks, run today's checks, insert one
   `gateway_operations` row (`kind`, `app_id`, `credential_id`, `gateway_id`, `started_at`),
   and commit.
2. **Gateway** (no transaction). Make the idempotent, tagged adapter calls.
3. **Commit** (short transaction). Take the same locks, run the same checks again, write the
   app, key or revoke rows, delete the operation row, and commit.

If step 2 or 3 fails, the server runs the compensation outside any transaction, logs a failed
compensation at error level, and deletes the operation row. The exception is a revoke whose
step 3 fails: its operation row stays so reconcile can finish the revoke.

Reconcile reads `gateway_operations`:
- It does not delete a consumer or revoke a key whose operation started less than
  10 minutes ago. Ten minutes is far longer than an adapter call's timeout.
- For a `revoke-credential` operation, an active row whose key is gone from Kong is marked
  `revoked`. This is not drift. Reconcile revokes the key again first if it is still in Kong.
- It deletes operation rows older than 10 minutes after it applies the normal rules, so a crash
  between steps leaves nothing in Kong after the next run.

## Consequences
- No transaction is open while Kong is called on these paths, so a slow Kong no longer holds
  row locks or advisory locks. A gateway switch between steps 1 and 3 fails step 3, which then
  compensates on the adapter it used.
- Each check runs twice, so checks must be factored into a function that both steps call.
- A crash can leave a Kong consumer or key for up to 10 minutes plus one reconcile interval.
  That is the same "reconcile will clean up" promise as today, now with a bound.
- Other paths that call Kong inside a transaction (plan change, app delete, gateway switch,
  seed, revoke-pending apps) keep their current shape. They can move to this pattern later
  without a schema change.
