/** Far-future park so claim SQL (next_attempt_at <= now) never picks held children. */
export const PERSONAL_ACTIVITY_PARKED_AT = new Date('2999-01-01T00:00:00.000Z');

export function isPersonalActivitySerialHeld(result?: unknown): boolean {
  return (
    !!result &&
    typeof result === 'object' &&
    (result as Record<string, unknown>).serialHeld === true
  );
}

/** Recompute from the child ledger even when discovery stopped partway through. */
export function personalSyncCounts(
  children: Array<{ kind: string; status: string; result?: unknown }>,
) {
  const terminal = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN']);
  const resultOf = (child: { result?: unknown }) =>
    child.result && typeof child.result === 'object'
      ? (child.result as Record<string, unknown>)
      : {};
  const activity = children.filter((child) => child.kind === 'ACTIVITY');
  const pendingActivity = activity.filter(
    (child) => !terminal.has(child.status),
  );
  /** Only the active (released) slot counts as downloading/importing — held siblings stay quiet. */
  const activePending = pendingActivity.filter(
    (child) => !isPersonalActivitySerialHeld(child.result),
  );
  return {
    discovered: activity.length,
    /** FIT not cached yet — still in the download stage of an ACTIVITY child. */
    downloading: activePending.filter((child) => {
      const fileKey = resultOf(child).fileKey;
      return typeof fileKey !== 'string' || fileKey.length === 0;
    }).length,
    /** FIT cached / import batch open — waiting on local import. */
    importing: activePending.filter((child) => {
      const fileKey = resultOf(child).fileKey;
      return typeof fileKey === 'string' && fileKey.length > 0;
    }).length,
    imported: activity.filter((child) => {
      const result = resultOf(child);
      return (
        !result.remoteDeleted &&
        (child.status === 'SUCCEEDED' || result.imported === 1)
      );
    }).length,
    healthDays: children.filter(
      (child) => child.kind === 'HEALTH' && child.status === 'SUCCEEDED',
    ).length,
    failed: children.filter(
      (child) => terminal.has(child.status) && child.status !== 'SUCCEEDED',
    ).length,
    pending: children.filter((child) => !terminal.has(child.status)).length,
  };
}

/** Parent SYNC statuses that must keep the frozen progress snapshot. */
export const PERSONAL_SYNC_TERMINAL = new Set([
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
]);

function asCount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Active SYNC parents recompute from the shared child ledger.
 * Terminal parents keep the snapshot written at checkpoint — ACTIVITY
 * children are connection-scoped and get reused by later syncs, so live
 * counts would make a historical card track the new job.
 */
export function personalSyncJobResult(
  job: { status: string; result?: unknown },
  children: Array<{ kind: string; status: string; result?: unknown }>,
) {
  const stored =
    job.result && typeof job.result === 'object'
      ? { ...(job.result as Record<string, unknown>) }
      : {};
  if (PERSONAL_SYNC_TERMINAL.has(job.status)) {
    return {
      ...stored,
      discovered: asCount(stored.discovered),
      downloading: asCount(stored.downloading),
      importing: asCount(stored.importing),
      imported: asCount(stored.imported),
      healthDays: asCount(stored.healthDays),
      failed: asCount(stored.failed),
      pending: asCount(stored.pending),
    };
  }
  return {
    ...stored,
    ...personalSyncCounts(children),
  };
}
