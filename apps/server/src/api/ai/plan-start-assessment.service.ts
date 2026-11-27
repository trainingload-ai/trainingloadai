import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import type { PlanProposalPresentation, PlanStartPreviewRequest } from '@shared/plan-proposal';
import type { RollingStartSettings } from '@shared/rolling-plan';
import { z } from 'zod';
import { resolveSupportedLocale } from '@/utils/locale.util';
import { PlanStartService } from '../plan/application/plan-start.service';
import { AiService } from './ai.service';
import { aiFallbackText } from './core/ai-fallback-copy';

const PLAN_START_ASSESSMENT_READ_TOOLS = [
  'plan.by_id',
  'time.current',
  'training.baseline',
  'training.readiness',
  'profile.current',
  'profile.zones',
  'workout.intensity_strategy',
  'activity.search',
] as const;

const workoutChangeSchema = z.object({
  sourceWorkoutId: z.string().min(1),
  expectedRevision: z.number().int().min(0),
  workout: z.record(z.string(), z.unknown()),
});

const workoutAdditionSchema = z.object({
  candidateKey: z.string().min(1),
  workout: z.record(z.string(), z.unknown()),
});

const workoutDeletionSchema = z.object({
  sourceWorkoutId: z.string().min(1),
  expectedRevision: z.number().int().min(0),
});

const startAssessmentModelSchema = z.object({
  verdict: z.enum(['FIT', 'SUGGEST_ADJUSTMENT', 'INSUFFICIENT_DATA']),
  summary: z.string().trim().min(1).max(1200),
  missingEvidence: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
  rationale: z.string().trim().max(1200).optional(),
  changes: z.array(workoutChangeSchema).optional(),
  additions: z.array(workoutAdditionSchema).optional(),
  deletions: z.array(workoutDeletionSchema).optional(),
  rolling: z.record(z.string(), z.unknown()).optional(),
});

type StartAssessmentModelOutput = z.infer<typeof startAssessmentModelSchema>;

export type PlanStartConflict = {
  date?: string;
  code: string;
  message: string;
};

export type PlanStartAssessmentResult =
  | {
      outcome: 'STARTED';
      alreadyActive: boolean;
      startDate: string;
      calendarTimeZone: string;
      revision: string;
      summary: string;
      plan: unknown;
      receipt?: unknown;
    }
  | {
      outcome: 'SUGGESTED_CHANGES';
      startDate: string;
      calendarTimeZone: string;
      revision: string;
      summary: string;
      originalCanStart: true;
      previewId: string;
      proposal: PlanProposalPresentation;
    }
  | {
      outcome: 'CONFLICT';
      startDate: string;
      calendarTimeZone: string;
      revision: string;
      summary: string;
      conflicts: PlanStartConflict[];
      originalCanStart: false;
      previewId?: string;
      proposal?: PlanProposalPresentation;
    }
  | {
      outcome: 'INSUFFICIENT_DATA';
      startDate: string;
      calendarTimeZone: string;
      revision: string;
      summary: string;
      missingEvidence: string[];
      originalCanStart: boolean;
      conflicts: PlanStartConflict[];
    };

@Injectable()
export class PlanStartAssessmentService {
  private readonly logger = new Logger(PlanStartAssessmentService.name);

  constructor(
    private readonly ai: AiService,
    private readonly planStarts: PlanStartService,
    private readonly i18n: I18nService,
  ) {}

  getStartDraft(userId: string, planId: string, selectedDate?: string) {
    return this.planStarts.getStartDraft(userId, planId, selectedDate);
  }

  confirmStart(
    userId: string,
    planId: string,
    input: {
      startDate: string;
      revision: string;
      choice: 'ORIGINAL' | 'SUGGESTED';
      previewId?: string;
    },
  ) {
    return this.planStarts.confirmDirectStart(userId, planId, input);
  }

  async assessStart(
    userId: string,
    planId: string,
    input: {
      startDate: string;
      revision?: string;
      lang?: string;
    },
  ): Promise<PlanStartAssessmentResult> {
    const preflight = await this.planStarts.preflightStart(
      userId,
      planId,
      input.startDate,
      input.revision,
    );

    if (preflight.alreadyActive) {
      return {
        outcome: 'STARTED',
        alreadyActive: true,
        startDate: preflight.startDate,
        calendarTimeZone: preflight.calendarTimeZone,
        revision: preflight.revision,
        summary: '',
        plan: preflight.plan,
      };
    }

    const lang = resolveSupportedLocale(input.lang);
    const activeWorkouts = preflight.source.workouts.filter(
      (w) => w.status !== 'MOVED',
    );
    if (activeWorkouts.length === 0) {
      const message = aiFallbackText(this.i18n, lang, 'planStart.emptyDraft');
      return {
        outcome: 'CONFLICT',
        startDate: preflight.startDate,
        calendarTimeZone: preflight.calendarTimeZone,
        revision: preflight.revision,
        summary: message,
        conflicts: [{ code: 'PLAN_EMPTY_WORKOUTS', message }],
        originalCanStart: false,
      };
    }

    const isRolling = preflight.source.planningMode === 'ROLLING';
    const taskPayload = {
      planId,
      title: preflight.source.title,
      planningMode: preflight.source.planningMode,
      startDate: preflight.startDate,
      calendarTimeZone: preflight.calendarTimeZone,
      originalCanStart: preflight.originalCanStart,
      conflicts: preflight.conflicts,
      recentActivityCount: preflight.evidence.activities.length,
      hasZones: preflight.evidence.zones.length > 0,
      workouts: preflight.source.workouts.map((w) => ({
        sourceWorkoutId: w.id,
        expectedRevision: w.revision,
        weekIndex: Math.floor(w.dayOffset / 7) + 1,
        dayIndex: (w.dayOffset % 7) + 1,
        sessionIndex: w.sessionIndex,
        sportType: w.sportType,
        name: w.name,
        plannedDurationSeconds: w.plannedDurationSeconds,
      })),
    };

    const task = await this.ai.runBackgroundCoachTask<StartAssessmentModelOutput>({
      userId,
      lang,
      taskType: 'PLAN_START_ASSESSMENT',
      activeSkillName: 'plan-start',
      dedupeKey: `plan-start-assess:${planId}:${preflight.startDate}:${randomUUID()}`,
      triggerType: 'PLAN_START_ASSESSMENT',
      triggerRef: planId,
      allowedToolNames: PLAN_START_ASSESSMENT_READ_TOOLS,
      allowUserInteraction: false,
      resumeHistory: false,
      instructions: [
        'Assess whether this saved DRAFT training plan fits the athlete’s current training load, recovery, and schedule constraints for the selected startDate.',
        'Do NOT ask questions or open a conversation. Read relevant athlete evidence via allowed read tools, then submit a single structured JSON result.',
        'Return JSON matching: { verdict: "FIT" | "SUGGEST_ADJUSTMENT" | "INSUFFICIENT_DATA", summary: string, missingEvidence?: string[], rationale?: string, changes?: [{ sourceWorkoutId, expectedRevision, workout }], additions?: [{ candidateKey, workout }], deletions?: [{ sourceWorkoutId, expectedRevision }], rolling?: { policy, monthStrategies } }.',
        'Use verdict="FIT" when originalCanStart is true and the draft workouts fit the athlete’s current state without changes.',
        'Use verdict="SUGGEST_ADJUSTMENT" when adjustments (duration, intensity, date, sport, add/delete) meaningfully improve readiness or resolve schedule conflicts; include exact changes/additions/deletions referencing sourceWorkoutId and expectedRevision from the draft. Every workout object in changes/additions must include weekIndex (1-based integer), dayIndex (1..7 integer relative to startDate), sessionIndex (1-based integer), sportType, name, and executable text (or definition).',
        'Use verdict="INSUFFICIENT_DATA" when recent training history/zones/readiness are too sparse to judge load suitability and list specific gaps in missingEvidence.',
        'Write summary and missingEvidence concisely in the athlete’s language without internal IDs or schema names.',
        `PLAN_START_ASSESSMENT_DATA_BEGIN\n${JSON.stringify(taskPayload)}\nPLAN_START_ASSESSMENT_DATA_END`,
      ].join('\n\n'),
      validateResult: (raw) => startAssessmentModelSchema.parse(raw),
    });

    const model = task.result;
    const normalizedRolling: RollingStartSettings | undefined = isRolling
      ? this.planStarts.normalizeRollingForStart(
          preflight.source,
          preflight.startDate,
          model.rolling as Partial<RollingStartSettings> | undefined,
        )
      : undefined;

    const hasSuggestedEdits = Boolean(
      model.changes?.length || model.additions?.length || model.deletions?.length,
    );

    const sourceById = new Map(
      preflight.source.workouts.map((w) => [w.id, w]),
    );
    const tryBuildSuggestedPreview = async () => {
      if (!hasSuggestedEdits) return null;
      try {
        const normalizedChanges = (model.changes ?? []).map((change) => {
          const prior = sourceById.get(change.sourceWorkoutId);
          const workout = { ...change.workout };
          if (prior) {
            if (typeof workout.weekIndex !== 'number') {
              workout.weekIndex = Math.floor(prior.dayOffset / 7) + 1;
            }
            if (typeof workout.dayIndex !== 'number') {
              workout.dayIndex = (prior.dayOffset % 7) + 1;
            }
            if (typeof workout.sessionIndex !== 'number') {
              workout.sessionIndex = prior.sessionIndex ?? 1;
            }
            if (typeof workout.sportType !== 'string') {
              workout.sportType = prior.sportType;
            }
            if (typeof workout.name !== 'string' && prior.name) {
              workout.name = prior.name;
            }
          }
          return { ...change, workout };
        });
        const previewRequest: PlanStartPreviewRequest = {
          mode: 'START',
          planId,
          startDate: preflight.startDate,
          rationale: model.rationale || model.summary,
          evidenceRefs: [{ type: 'plan_start_assessment', label: 'Coach start assessment' }],
          changes: normalizedChanges as PlanStartPreviewRequest['changes'],
          additions: (model.additions ?? []) as PlanStartPreviewRequest['additions'],
          deletions: (model.deletions ?? []) as PlanStartPreviewRequest['deletions'],
          preserveUnmentioned: true,
          ...(normalizedRolling ? { rolling: normalizedRolling } : {}),
        };
        return await this.planStarts.createDirectStartPreview(userId, previewRequest);
      } catch (error) {
        this.logger.warn(
          `[PlanStartAssessment] Suggested preview failed validation planId=${planId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return null;
      }
    };

    // Branch 1: Original schedule has hard conflicts
    if (!preflight.originalCanStart) {
      const preview = await tryBuildSuggestedPreview();
      return {
        outcome: 'CONFLICT',
        startDate: preflight.startDate,
        calendarTimeZone: preflight.calendarTimeZone,
        revision: preflight.revision,
        summary: model.summary,
        conflicts: preflight.conflicts,
        originalCanStart: false,
        ...(preview
          ? { previewId: preview.previewId, proposal: preview.presentation }
          : {}),
      };
    }

    // Branch 2: Insufficient training data
    if (model.verdict === 'INSUFFICIENT_DATA') {
      return {
        outcome: 'INSUFFICIENT_DATA',
        startDate: preflight.startDate,
        calendarTimeZone: preflight.calendarTimeZone,
        revision: preflight.revision,
        summary: model.summary,
        missingEvidence: model.missingEvidence ?? [],
        originalCanStart: true,
        conflicts: [],
      };
    }

    // Branch 3: Coach suggests adjustments and they validate cleanly
    if (model.verdict === 'SUGGEST_ADJUSTMENT') {
      if (hasSuggestedEdits) {
        const preview = await tryBuildSuggestedPreview();
        if (preview) {
          const changedRows = preview.presentation.rows.filter(
            (row) => row.changeKind && row.changeKind !== 'PRESERVED',
          );
          if (changedRows.length > 0) {
            return {
              outcome: 'SUGGESTED_CHANGES',
              startDate: preflight.startDate,
              calendarTimeZone: preflight.calendarTimeZone,
              revision: preflight.revision,
              summary: model.summary,
              originalCanStart: true,
              previewId: preview.previewId,
              proposal: preview.presentation,
            };
          }
        }
      }
      // Never silently auto-start the unmodified plan when the coach recommended
      // adjustments but the preview could not be built; require explicit user confirmation.
      this.logger.warn(
        `PlanStartAssessment suggested adjustments for plan=${planId} but no valid preview was produced; requiring explicit confirmation`,
      );
      return {
        outcome: 'INSUFFICIENT_DATA',
        startDate: preflight.startDate,
        calendarTimeZone: preflight.calendarTimeZone,
        revision: preflight.revision,
        summary: model.summary,
        missingEvidence: model.missingEvidence ?? [],
        originalCanStart: true,
        conflicts: [],
      };
    }

    // Branch 4: Original schedule fits — start directly
    const confirmed = await this.planStarts.confirmDirectStart(userId, planId, {
      startDate: preflight.startDate,
      revision: preflight.revision,
      choice: 'ORIGINAL',
      rollingSettings: normalizedRolling,
    }, { assessed: true });
    return {
      outcome: 'STARTED',
      alreadyActive: confirmed.alreadyActive,
      startDate: preflight.startDate,
      calendarTimeZone: preflight.calendarTimeZone,
      revision: preflight.revision,
      summary: model.summary,
      plan: confirmed.plan,
      ...(confirmed.receipt ? { receipt: confirmed.receipt } : {}),
    };
  }
}
