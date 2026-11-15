# User-scoped activity identities

The migration changes both third-party projections and the legacy Activity
provider identity to include user_id. Existing row ids, owners and mappings
remain unchanged. It also enforces one ACTIVE Intervals.icu connection per real
remote athlete; conflicting existing connections cause migration failure.

Self-host applies this migration with application services stopped through its
normal signed-bundle upgrade flow. Its single-owner guard remains unchanged.
The multi-user database tests omit that guard only in isolated test databases.

Managed deployments must use an expand/deploy/contract rollout: add the new
indexes first, replace every old reader and worker, then remove the two global
indexes. Do not run this combined Core migration directly against Managed.
After cross-user duplicates exist, pre-cutover binaries cannot be used for
application rollback. No historical data may be transferred or deleted to make
an older binary or a global unique index work again.
