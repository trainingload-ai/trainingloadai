export const DEFAULT_POST_PROCESS_QUIET_MS = 3_000;
export const DEFAULT_POST_PROCESS_MAX_WAIT_MS = 15_000;
export const MAX_EVIDENCE_DRIFT_DEFERRALS = 3;

export function postProcessWindowMs(value: unknown, fallback: number) {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 3_600_000
    ? Math.floor(value)
    : fallback;
}

/**
 * Existing batch jobs form the durable per-user backlog. A later batch extends
 * the quiet window, but never the oldest ready request's maximum wait. Resumed
 * pages and completed sibling coverage do not need another ingestion delay.
 * $5 is the quiet cutoff and $6 the maximum-wait cutoff, both derived from $1.
 */
export function postProcessCoalescingSql(alias: string) {
  const checkpoint = `COALESCE(${alias}.replay_checkpoint::jsonb, '{}'::jsonb)`;
  return `(
    ${alias}.status = 'RUNNING'
    OR ${alias}.attempts > 0
    OR ${checkpoint} ?| ARRAY[
      'nextEffectiveFrom', 'pendingPmcRecomputeFrom', 'pendingPmcRecomputeTo',
      'replaySatisfiedThrough'
    ]
    OR ${alias}.created_at <= ($6::timestamptz AT TIME ZONE 'UTC')
    OR (
      ${alias}.created_at <= ($5::timestamptz AT TIME ZONE 'UTC')
      AND NOT EXISTS (
        SELECT 1 FROM t_user_post_process_job incoming
        WHERE incoming.user_id = ${alias}.user_id
          AND incoming.status IN ('PENDING', 'FAILED')
          AND incoming.created_at > ($5::timestamptz AT TIME ZONE 'UTC')
      )
      AND NOT EXISTS (
        SELECT 1 FROM t_import_item_job importing
        WHERE importing.user_id = ${alias}.user_id
          AND importing.analysis_required = true
          AND importing.status NOT IN ('DONE', 'SKIPPED', 'DEAD')
      )
    )
  )`;
}
