import type { PlanSchedulePreviewRequest } from '@shared/plan-proposal';
import type { RollingMonthDraft } from '@shared/rolling-plan';

export type RollingPlanCandidateInput = {
  jobId: string;
  userId: string;
  lang: string;
  inputRevision: string;
  kind: 'MONTH' | 'WEEK' | 'ADJUST';
  windowStart: string;
  from: string;
  through: string;
  planId: string;
  /** Complete plan/window/calendar, athlete, activity and health evidence. */
  facts: unknown;
  policy: unknown;
  monthStrategies: unknown;
};

export type RollingPlanCandidate =
  | { kind: 'MONTH'; strategy: RollingMonthDraft; reason: string }
  | {
      kind: 'WEEK' | 'ADJUST';
      schedule: PlanSchedulePreviewRequest;
      reason: string;
    };

export class RollingPlanCandidateError extends Error {
  constructor(
    readonly code:
      | 'ROLLING_CANDIDATE_INPUT_INVALID'
      | 'ROLLING_CANDIDATE_INVALID'
      | 'ROLLING_CANDIDATE_NEEDS_INPUT'
      | 'ROLLING_CANDIDATE_USAGE_MISSING',
    readonly reason?: string,
  ) {
    super(code);
    this.name = 'RollingPlanCandidateError';
  }
}
