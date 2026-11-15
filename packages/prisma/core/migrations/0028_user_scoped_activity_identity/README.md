# User-scoped activity identities

This additive migration creates user-scoped unique indexes for third-party
projections and legacy Activity provider identities. Existing row ids, owners,
mappings and both legacy global unique indexes remain unchanged. Keeping the
legacy indexes preserves older clients' native upserts and the declared
Self-host application rollback window. The single-owner database guard remains
in force, so retaining global activity uniqueness does not prevent a supported
Self-host operation.

The migration also enforces one ACTIVE Intervals.icu connection per real remote
athlete; conflicting existing connections cause migration failure. Self-host
applies it through the normal signed-bundle upgrade flow.

Multi-user Managed deployments use their own expand/deploy/contract rollout:
add the new indexes, replace every old reader and worker, then remove the two
global indexes through the separate Managed contract step. Only isolated
multi-user test fixtures omit the single-owner guard and simulate this contract.
After cross-user duplicates exist, pre-cutover binaries cannot be used for
Managed application rollback. Never transfer or delete historical user data to
make an older binary or a global unique index work again.
