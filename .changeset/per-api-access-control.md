---
'@portal/adapter-sdk': minor
'@portal/adapter-kong': minor
'@portal/server': minor
'@portal/sdk': minor
'@portal/portal': minor
---

Enforce per-API access for Kong portal keys using subscription-backed ACL groups,
and hide credentials from upstream services. Keys lose access to APIs their app
is not subscribed to, and publishing a key-auth service restricts existing
non-portal consumers. Gateway adapters must implement the new access-control
contract, and API imports now return warnings or refuse conflicting service links
and operator-owned ACLs.

Before upgrading, read the access-control upgrade notes in
`docs/upgrade-004-access-control.md` for compatibility changes, operator actions,
reconciliation behaviour, and propagation limitations.
