import { Injectable } from '@nestjs/common';
import { AiUsageKind } from '@prisma/client';
import type { PlanWorkoutAdjustmentDraftData } from '@shared/ai-coach-schema';
import { AiService } from '../ai.service';
import type { parseOpenAIUsage } from '../ai-usage.service';
import { sha256Hex, stableJson } from '../core/ai-common.util';
import {
  buildCoachReviewAdjustmentSystemPrompt,
  buildPlanReviewJudgmentSystemPrompt,
  serializeCoachReviewAdjustmentInput,
  serializePlanReviewJudgmentContext,
} from '../core/prompt-contracts/plan-review-judgment.contract';
import {
  parseCoachReviewAdjustment,
  parseDailyPlanReviewJudgment,
  type CoachReviewAction,
} from '../daily-plan-review-judgment';

@Injectable()
export class TrainingCoachAgent {
  constructor(private readonly tasks: AiService) {}

  async generateDailyPlanReviewJudgment(params: {
    userId: string;
    lang: string;
    context: unknown;
    signal?: AbortSignal;
  }) {
    return this.generatePlanReviewJudgment({ ...params, scale: 'daily' });
  }

  /** Return the training judgment for the review domain to publish. */
  async generatePlanReviewJudgment(params: {
    userId: string;
    lang: string;
    scale?: 'daily' | 'weekly' | 'monthly';
    context: unknown;
    signal?: AbortSignal;
  }): Promise<{
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
    usage: ReturnType<typeof parseOpenAIUsage>;
    provider: string | null;
    model: string;
    runId: string;
    operationId: string;
    replayed: boolean;
  }> {
    const scale = params.scale ?? 'daily';
    const skillName =
      scale === 'daily'
        ? 'plan-day-review'
        : scale === 'weekly'
          ? 'plan-week-review'
          : 'plan-cycle-review';
    const usageKind =
      scale === 'daily'
        ? AiUsageKind.REVIEW_DAILY
        : scale === 'weekly'
          ? AiUsageKind.REVIEW_WEEKLY
          : AiUsageKind.REVIEW_MONTHLY;
    const task = await this.tasks.runBackgroundCoachTask({
      userId: params.userId,
      lang: params.lang,
      taskType: `PLAN_${scale.toUpperCase()}_REVIEW`,
      funding: 'PLATFORM',
      activeSkillName: skillName,
      signal: params.signal,
      usageKind,
      allowedToolNames: [
        'training.data_coverage',
        'integration.status',
        'time.current',
        'plan.active',
        'plan.by_id',
        'plan.recent',
        'plan.execution_context',
        'training.weekSummary',
        'training.readiness',
        'activity.search',
        'activity.byHashId',
        'activity.series',
        'profile.current',
        'competition.events.list',
        'competition.impact.resolve',
        'metric.history',
        'metric.current',
        'bests.summary',
      ],
      instructions: [
        buildPlanReviewJudgmentSystemPrompt({
          scale,
          lang: params.lang,
          delivery: 'agent-tool',
        }),
        serializePlanReviewJudgmentContext(params.context),
      ].join('\n\n'),
      validateResult: (raw) => {
        const object =
          raw && typeof raw === 'object' && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : null;
        if (
          !object ||
          (object.decision !== 'KEEP' && object.decision !== 'ADJUST')
        ) {
          throw new Error('Review decision must be KEEP or ADJUST.');
        }
        const parsed = parseDailyPlanReviewJudgment(JSON.stringify(object));
        if (object.decision === 'ADJUST' && parsed.decision !== 'ADJUST') {
          throw new Error(
            'ADJUST result is incomplete or internally inconsistent.',
          );
        }
        if (!parsed.rationale.trim()) {
          throw new Error('Review rationale is required.');
        }
        return parsed;
      },
    });
    return {
      ...task.result,
      usage: task.usage,
      provider: task.provider,
      model: task.model,
      runId: task.runId,
      operationId: task.operationId,
      replayed: task.replayed,
    };
  }

  /** Compile an accepted adjustment intent into a candidate for domain validation. */
  async generatePlanReviewAdjustment(params: {
    userId: string;
    lang: string;
    scale: 'daily' | 'weekly' | 'monthly';
    action: string;
    input: unknown;
    targetWorkoutId: string;
    validationError?: string | null;
    signal?: AbortSignal;
  }): Promise<{
    draft: PlanWorkoutAdjustmentDraftData | null;
    usage: ReturnType<typeof parseOpenAIUsage>;
    provider: string | null;
    model: string;
    runId: string;
    operationId: string;
    replayed: boolean;
  }> {
    const prompt = [
      buildCoachReviewAdjustmentSystemPrompt({
        lang: params.lang,
        action: params.action,
        validationError: params.validationError,
        delivery: 'agent-tool',
      }),
      serializeCoachReviewAdjustmentInput(params.input),
    ].join('\n\n');
    const task = await this.tasks.runBackgroundCoachTask<{
      draft: PlanWorkoutAdjustmentDraftData | null;
    }>({
      userId: params.userId,
      lang: params.lang,
      taskType: `PLAN_${params.scale.toUpperCase()}_REVIEW_ADJUSTMENT`,
      funding: 'PLATFORM',
      activeSkillName: 'plan-review-adjustment',
      instructions: prompt,
      allowedToolNames: [],
      signal: params.signal,
      usageKind:
        params.scale === 'daily'
          ? AiUsageKind.REVIEW_DAILY
          : params.scale === 'weekly'
            ? AiUsageKind.REVIEW_WEEKLY
            : AiUsageKind.REVIEW_MONTHLY,
      dedupeKey: sha256Hex(
        stableJson({
          action: params.action,
          input: params.input,
          validationError: params.validationError ?? null,
        }),
      ),
      triggerType: `PLAN_${params.scale.toUpperCase()}_REVIEW_ADJUSTMENT`,
      triggerRef: params.targetWorkoutId,
      validateResult: (raw) => {
        const value =
          raw && typeof raw === 'object' && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : null;
        const draft = parseCoachReviewAdjustment(
          JSON.stringify(value?.draft ?? {}),
        );
        return { draft };
      },
    });
    return {
      draft: task.result.draft,
      usage: task.usage,
      provider: task.provider,
      model: task.model,
      runId: task.runId,
      operationId: task.operationId,
      replayed: task.replayed,
    };
  }
}
