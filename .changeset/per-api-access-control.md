---
'@portal/adapter-sdk': major
'@portal/adapter-kong': major
'@portal/server': major
'@portal/sdk': major
---

Enforce per-API access for Kong portal keys using subscription-backed ACL groups,
and hide credentials from upstream services. Keys lose access to APIs their app
is not subscribed to, and publishing a key-auth service restricts existing
non-portal consumers. Gateway adapters must implement the new access-control
contract, and API imports now return warnings or refuse conflicting service links
and operator-owned ACLs.

Before upgrading, read [the access-control upgrade notes](../docs/upgrade-004-access-control.md)
in `docs/upgrade-004-access-control.md` for compatibility changes, operator actions,
reconciliation behaviour, and propagation limitations.
