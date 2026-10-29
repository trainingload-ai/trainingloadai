import { isOpenNextLifecyclePayload } from './coach-branching-finalized';
import { containsZeroPercentage } from './daily-plan-review-judgment';

/**
 * 把库里的 CoachDecision 收成首页/Today 叠卡可用的列表项。
 * ACTIVE 计划的待确认全展示；FINALIZED 只留「开启下一计划」。
 */

export type PendingCoachDecisionRow = {
  id: string;
  branchId: string;
  branch?: { id: string; openReason: string };
  contextId: string;
  decisionType: string;
  riskTier: string;
  rationale: string | null;
  confidence: number | null;
  payload: unknown;
  options: Array<{
    optionKey: string;
    title: string | null;
    isSelected: boolean;
  }>;
  createdAt: Date;
  context: {
    id: string;
    planId: string;
    plan: { id: string; title: string | null };
  };
};

/** 无 ACTIVE 计划时，周期卡仍要能出现在首页。 */
export function isListablePendingCoachDecision(args: {
  contextStatus: string;
  decisionType: string;
  payload: unknown;
}) {
  if (args.contextStatus === 'ACTIVE') return true;
  return (
    args.contextStatus === 'FINALIZED' &&
    isOpenNextLifecyclePayload(args.decisionType, args.payload)
  );
}

/** 叠卡顺序：HIGH 在前，同风险新的在前。 */
export function rankPendingCoachDecisions<
  T extends { riskTier: string; createdAt: Date },
>(decisions: T[]): T[] {
  return [...decisions].sort((a, b) => {
    const tier = Number(b.riskTier === 'HIGH') - Number(a.riskTier === 'HIGH');
    if (tier !== 0) return tier;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

/** 前端只需这些字段。workout 从 payload 抽出来方便叠卡展示 before/after。 */
export function presentPendingCoachDecision(decision: PendingCoachDecisionRow) {
  const payload = asJsonRecord(decision.payload);
  const adjustment = asJsonRecord(payload.adjustment);
  const review = asJsonRecord(payload.review);
  const before = asJsonRecord(adjustment.before);
  const after = asJsonRecord(adjustment.after);
  return {
    id: decision.id,
    branchId: decision.branchId,
    openReason: decision.branch?.openReason ?? 'runtime_day_review',
    contextId: decision.contextId,
    planId: decision.context.planId,
    planTitle: decision.context.plan.title,
    decisionType: decision.decisionType,
    riskTier: decision.riskTier,
    rationale: decision.rationale,
    confidence: decision.confidence,
    payload,
    options: decision.options.map((option) => ({
      optionKey: option.optionKey,
      title: option.title,
      isSelected: option.isSelected,
    })),
    workout: {
      id: stringField(payload, 'workoutId'),
      name: stringField(payload, 'workoutName'),
      fromWeekIndex: numberField(payload, 'fromWeekIndex'),
      fromDayIndex: numberField(payload, 'fromDayIndex'),
      weekIndex: numberField(payload, 'weekIndex'),
      dayIndex: numberField(payload, 'dayIndex'),
      status: stringField(payload, 'status'),
    },
    review: stringField(review, 'scale')
      ? {
          scale: stringField(review, 'scale'),
          promptVersion: stringField(review, 'promptVersion'),
          source: stringField(review, 'source'),
          evidenceCodes: stringArrayField(review, 'evidenceCodes'),
        }
      : null,
    adjustment: stringField(adjustment, 'kind')
      ? {
          kind: stringField(adjustment, 'kind'),
          before: presentImpactSide(before),
          after:
            Object.keys(after).length > 0 ? presentImpactSide(after) : null,
          changes: Array.isArray(adjustment.changes)
            ? adjustment.changes.flatMap((value) => {
                const change = asJsonRecord(value);
                const field = stringField(change, 'field');
                const beforeValue = stringField(change, 'before');
                const afterValue = stringField(change, 'after');
                return field && beforeValue && afterValue
                  ? [
                      {
                        field,
                        before: beforeValue,
                        after: afterValue,
                        reason: stringField(change, 'reason'),
                      },
                    ]
                  : [];
              })
            : [],
        }
      : null,
    createdAt: decision.createdAt.toISOString(),
  };
}

export type CoachReviewGuidanceEvent = {
  id: string;
  occurredAt: Date;
  payload: unknown;
  context: {
    id: string;
    planId: string;
    plan: { id: string; title: string | null };
  };
};

/** 只有明确标记为指导的最新复盘才进入首页。 */
export function presentReviewGuidance(event: CoachReviewGuidanceEvent | null) {
  if (!event) return null;
  const payload = asJsonRecord(event.payload);
  if (payload.outcome !== 'KEEP_WITH_GUIDANCE') return null;
  const rationale = stringField(payload, 'rationale');
  if (!rationale || containsZeroPercentage(rationale)) return null;
  return {
    id: event.id,
    contextId: event.context.id,
    planId: event.context.planId,
    planTitle: event.context.plan.title,
    rationale,
    scale: stringField(payload, 'scale') || 'daily',
    evidenceCodes: stringArrayField(payload, 'evidenceCodes'),
    createdAt: event.occurredAt.toISOString(),
  };
}

function presentImpactSide(payload: Record<string, unknown>) {
  return {
    name: stringField(payload, 'name'),
    date: stringField(payload, 'date'),
    summary: stringField(payload, 'summary'),
    expectedLoad: numberField(payload, 'expectedLoad'),
  };
}

function asJsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringField(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberField(payload: Record<string, unknown>, key: string) {
  const value = Number(payload[key]);
  return Number.isFinite(value) ? value : null;
}

function stringArrayField(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return Array.isArray(value)
    ? value
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
}
