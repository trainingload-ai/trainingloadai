/**
 * Web / Mobile 叠卡共用的 Decision 形状判断。
 * 推迟课、对话草案、周期「开启下一计划」都走同一套 apply，这里只负责辨认和拼 payload。
 */

export type PlanWorkoutAdjustmentLike = {
  planId: string;
  workoutId: string;
  title?: string;
  reason: string;
  before: {
    weekIndex?: number;
    dayIndex?: number;
    sessionIndex?: number;
    sportType: string;
    name?: string;
    notes?: string;
    text: string;
  };
  after: {
    weekIndex?: number;
    dayIndex?: number;
    sessionIndex?: number;
    sportType: string;
    name?: string;
    notes?: string;
    text: string;
  };
  changes?: Array<{
    field: string;
    before: string;
    after: string;
    reason?: string;
  }>;
};

/** 把草案收成已有 PLAN_WORKOUT_UPDATE apply 能吃的 payload。 */
export function adjustmentDraftToWorkoutUpdatePayload(
  draft: PlanWorkoutAdjustmentLike,
) {
  return {
    planId: draft.planId,
    workoutId: draft.workoutId,
    workoutName: draft.after.name || draft.before.name || null,
    dto: {
      weekIndex: draft.after.weekIndex ?? draft.before.weekIndex,
      dayIndex: draft.after.dayIndex ?? draft.before.dayIndex,
      sessionIndex: draft.after.sessionIndex ?? draft.before.sessionIndex,
      sportType: draft.after.sportType,
      text: draft.after.text,
      ...(draft.after.name !== undefined ? { name: draft.after.name } : {}),
      ...(draft.after.notes !== undefined ? { notes: draft.after.notes } : {}),
      reason: draft.reason,
    },
  };
}

/** 周期卡：确认后不是改课，而是带总结去开下一份计划。 */
export function isOpenNextCoachDecision(decision: {
  decisionType?: string | null;
  payload?: Record<string, unknown> | null;
}) {
  const action = String(decision.payload?.action ?? "")
    .trim()
    .toLowerCase();
  return decision.decisionType === "PLAN_LIFECYCLE" && action === "open_next";
}

/** apply 成功后跳进 plan-builder。path 默认 Web `/ai-coach`，Mobile 传 `/coach`。 */
export function coachCycleStartHref(
  decision: {
    planId?: string | null;
    payload?: Record<string, unknown> | null;
    rationale?: string | null;
  },
  path = "/ai-coach",
) {
  const params = new URLSearchParams();
  params.set("intent", "plan-builder");
  if (decision.planId) params.set("fromPlanId", decision.planId);
  const summaryId = String(decision.payload?.summaryId ?? "").trim();
  if (summaryId) params.set("summaryId", summaryId);
  const prompt =
    String(decision.payload?.nextPlanPrompt ?? "").trim() ||
    String(decision.rationale ?? "").trim();
  if (prompt) params.set("prompt", prompt);
  return `${path}?${params.toString()}`;
}

/** apply HTTP 仍可能是 200，但 result 不是 APPLIED（REBASE_REQUIRED / SKIPPED）。 */
export class CoachApplyNotAppliedError extends Error {
  constructor(readonly applyResult: string) {
    super(applyResult);
    this.name = "CoachApplyNotAppliedError";
  }
}

export function isCoachApplyNotAppliedError(
  error: unknown,
): error is CoachApplyNotAppliedError {
  return error instanceof Error && error.name === "CoachApplyNotAppliedError";
}

export function assertCoachDecisionApplied(result: string | undefined) {
  if (result === "APPLIED") return;
  throw new CoachApplyNotAppliedError(result ?? "UNKNOWN");
}
