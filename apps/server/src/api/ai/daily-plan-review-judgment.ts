import {
  parsePlanWorkoutAdjustmentDraftData,
  type PlanWorkoutAdjustmentDraftData,
} from '@shared/ai-coach-schema';

export const COACH_REVIEW_ACTIONS = [
  'POSTPONE',
  'SKIP',
  'REDUCE_VOLUME',
  'REDUCE_INTENSITY',
  'RECOVERY',
  'RESCHEDULE_MISSED',
  'REPLACE_NEXT',
  'ADD_SESSION',
  'INCREASE_VOLUME',
  'INCREASE_INTENSITY',
] as const;

export type CoachReviewAction = (typeof COACH_REVIEW_ACTIONS)[number];

export type CoachReviewJudgment = {
  decision: 'KEEP' | 'ADJUST';
  presentation?: 'SILENT' | 'GUIDANCE' | 'DECISION';
  action: CoachReviewAction | null;
  targetWorkoutId: string | null;
  sourceWorkoutId?: string | null;
  targetDate?: string | null;
  rationale: string;
  confidence: number | null;
  evidenceCodes: string[];
  adjustmentIntent: {
    magnitude: 'SMALL' | 'MODERATE';
    preserve: string[];
  } | null;
};

/**
 * Athlete-facing review copy must not expose a zero completion percentage.
 * A zero numerator is better explained in natural language by the coach model.
 */
export function containsZeroPercentage(text: string): boolean {
  const normalized = text.normalize('NFKC').toLowerCase();
  return (
    /(?:^|[^\d])0(?:[.,]0+)?\s*(?:%|percent(?:age)?\b|个百分点|百分比)/i.test(
      normalized,
    ) || /百分之\s*(?:0(?:[.,]0+)?|零)/.test(normalized)
  );
}

export function parseDailyPlanReviewJudgment(raw: string): CoachReviewJudgment {
  const obj = parseJsonObject(raw);
  const decision = obj.decision === 'ADJUST' ? 'ADJUST' : 'KEEP';
  const presentation =
    decision === 'ADJUST'
      ? 'DECISION'
      : obj.presentation === 'GUIDANCE'
        ? 'GUIDANCE'
        : 'SILENT';
  const action = COACH_REVIEW_ACTIONS.includes(obj.action as CoachReviewAction)
    ? (obj.action as CoachReviewAction)
    : null;
  const targetWorkoutId = trimmed(obj.targetWorkoutId);
  const sourceWorkoutId = trimmed(obj.sourceWorkoutId);
  const targetDateRaw = trimmed(obj.targetDate);
  const targetDate =
    targetDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(targetDateRaw)
      ? targetDateRaw
      : null;
  const confidenceRaw = Number(obj.confidence);
  const evidenceCodes = Array.isArray(obj.evidenceCodes)
    ? Array.from(
        new Set(
          obj.evidenceCodes
            .map((code: unknown) =>
              String(code ?? '')
                .trim()
                .toUpperCase(),
            )
            .filter((code: string) => /^[A-Z][A-Z0-9_]{1,48}$/.test(code)),
        ),
      ).slice(0, 8)
    : [];
  const intent = asRecord(obj.adjustmentIntent);
  const magnitude =
    intent.magnitude === 'MODERATE'
      ? 'MODERATE'
      : intent.magnitude === 'SMALL'
        ? 'SMALL'
        : null;
  const preserve = Array.isArray(intent.preserve)
    ? intent.preserve
        .map((item: unknown) => String(item ?? '').trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const contentAction =
    action === 'REDUCE_VOLUME' ||
    action === 'REDUCE_INTENSITY' ||
    action === 'RECOVERY' ||
    action === 'REPLACE_NEXT' ||
    action === 'ADD_SESSION' ||
    action === 'INCREASE_VOLUME' ||
    action === 'INCREASE_INTENSITY';
  const hasIntentPayload = Object.keys(intent).length > 0;
  const validTargetShape =
    action === 'ADD_SESSION'
      ? Boolean(sourceWorkoutId) && Boolean(targetDate) && !targetWorkoutId
      : action === 'RESCHEDULE_MISSED'
        ? Boolean(targetWorkoutId) && Boolean(targetDate) && !sourceWorkoutId
        : action === 'REPLACE_NEXT'
          ? Boolean(targetWorkoutId) && Boolean(sourceWorkoutId)
          : Boolean(targetWorkoutId) && !sourceWorkoutId && !targetDate;
  const validAdjust =
    decision === 'ADJUST' &&
    Boolean(action) &&
    validTargetShape &&
    (contentAction ? Boolean(magnitude) : !hasIntentPayload);
  if (!validAdjust) {
    return {
      decision: 'KEEP',
      presentation,
      action: null,
      targetWorkoutId: null,
      sourceWorkoutId: null,
      targetDate: null,
      rationale: trimmed(obj.rationale)?.slice(0, 600) ?? '',
      confidence: finiteConfidence(confidenceRaw),
      evidenceCodes,
      adjustmentIntent: null,
    };
  }
  return {
    decision: 'ADJUST',
    presentation: 'DECISION',
    action,
    targetWorkoutId,
    sourceWorkoutId,
    targetDate,
    rationale: trimmed(obj.rationale)?.slice(0, 600) ?? '',
    confidence: finiteConfidence(confidenceRaw),
    evidenceCodes,
    adjustmentIntent: contentAction
      ? { magnitude: magnitude!, preserve }
      : null,
  };
}

export function parseCoachReviewAdjustment(
  raw: string,
): PlanWorkoutAdjustmentDraftData | null {
  const parsed = parsePlanWorkoutAdjustmentDraftData(parseJsonObject(raw));
  return parsed.ok ? parsed.data : null;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    return asRecord(
      JSON.parse(
        String(raw ?? '')
          .trim()
          .replace(/^```json\s*/i, '')
          .replace(/```$/g, ''),
      ),
    );
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function trimmed(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function finiteConfidence(value: number) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;
}
