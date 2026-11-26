import {
  addCalendarDays,
  scheduleConstraintsSchema,
  assessPlanSchedule,
  calendarIsoWeekday,
  isCalendarDate,
} from '@shared/plan-calendar';
import {
  WorkoutDefinitionService,
  type ResolvedWorkoutDefinition,
} from '@/api/workout/workout-definition.service';
import { aiToolError, buildAiTool, type AiToolCheckResult, type AiToolContext, type AiToolDef, type PlanValidationFeedback } from '../tool.types';
import {
  COACH_PLAN_DRAFT_TYPE,
  parseCoachPlanDraftData,
  type CoachPlanDraftData,
  type JsonSchemaObject,
} from '../../../../../../../packages/shared/ai-coach-schema';
import type { EndurancePlanBlock } from '../../../../../../../packages/shared/endurance-workout-ir';
import { formatPlanDraftRepair, PLAN_DRAFT_RESULT_BUDGET, timedIntervalBreakdown } from './plan-draft-repair-feedback';
import { asRecord } from '../ai-common.util';
import { planPhaseProgress } from './plan-draft-phase-progress';
import type {
  CompetitionEventImpactAssessment,
  CompetitionImpactResult,
} from '@/api/competition/competition-impact.types';
import {
  normalizeSportDefinitionCode,
  type SportFamily,
} from '@/sports/sport-catalog.types';
import type { jsonSchema } from 'ai';
import {
  assessPlanQuality,
  planDailyMinuteLimit,
  planQualityContractSchema,
  type PlanQualityWorkout,
} from '@shared/plan-quality';
import { WORKOUT_DSL_CONTRACT_LINES } from '../prompt-contracts/workout-generation.contract';

type AiSdkJsonSchema = Exclude<
  Parameters<typeof jsonSchema>[0],
  PromiseLike<unknown> | (() => unknown)
>;
type AiSdkJsonSchemaDefinition = AiSdkJsonSchema | boolean;

type Input = Record<string, unknown>;

/** 与客户端 `coach_plan_draft` / `POST /plans/create` 对齐；不落库，仅驱动预览 SSE */
type Output = {
  kind: typeof COACH_PLAN_DRAFT_TYPE;
} & CoachPlanDraftData;

const compactWorkoutProperties = {
  weekIndex: { type: 'integer', minimum: 1 },
  weekIndexes: {
    type: 'array',
    minItems: 1,
    uniqueItems: true,
    items: { type: 'integer', minimum: 1 },
    description:
      'Use instead of weekIndex when the same session repeats unchanged across multiple weeks.',
  },
  dayIndex: { type: 'integer', minimum: 1, maximum: 7 },
  isoWeekday: {
    type: 'integer', minimum: 1, maximum: 7,
    description: 'Use for named calendar weekdays instead of dayIndex: Monday=1 through Sunday=7. Requires the dated qualityContract.',
  },
  sessionIndex: { type: 'integer', minimum: 1 },
  templateId: {
    type: 'string',
    description:
      'References sessionTemplates[].id. Direct fields on this workout override the template.',
  },
  structureKind: {
    type: 'string',
    enum: ['ENDURANCE', 'STRENGTH', 'FREEFORM'],
  },
  dslVersion: { type: 'integer', enum: [1] },
  text: {
    type: 'string',
    minLength: 1,
    description: 'Executable workout DSL using the grammar for structureKind.',
  },
  notes: {
    type: 'string',
    description:
      "Explain the complete prescription in the athlete's language, including effort, repeats and rests. For strength give exercises, sets, reps or time, load or effort, and rest.",
  },
  plannedSessionRpe: {
    type: 'number',
    minimum: 1,
    maximum: 10,
    description: 'Planned whole-session effort on the 1–10 scale for endurance without reliable measured targets. Match the actual prescription and notes.',
  },
  sportType: {
    type: 'string',
    enum: ['RUN', 'CYCLING', 'SWIM', 'STRETCHING', 'UNKNOWN'],
  },
  sportDefinitionCode: {
    type: 'string',
    description:
      'Exact sport catalog code, not the sport family. Examples: ROAD_RUNNING (not RUN), ROAD_CYCLING (not CYCLING), POOL_SWIMMING (not SWIM), STRENGTH_TRAINING.',
  },
  name: { type: 'string' },
} satisfies Record<string, AiSdkJsonSchemaDefinition>;

export const compactCoachPlanDraftToolParametersSchema = {
  type: 'object',
  description: [
    'Workout DSL for sessionTemplates[].text and inline workouts[].text:',
    ...WORKOUT_DSL_CONTRACT_LINES,
  ].join('\n'),
  additionalProperties: false,
  required: ['title'],
  anyOf: [{ required: ['periodWeeks', 'workouts'] }, { required: ['assessmentId'] }],
  properties: {
    title: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    periodWeeks: { type: 'integer', minimum: 1 },
    assessmentId: { type: 'string', description: 'Use the latest READY assessmentId when its blueprint contains weekTargets.' },
    repairWeeks: {
      type: 'array', minItems: 1, uniqueItems: true, items: { type: 'integer', minimum: 1 },
      description: 'Use the same assessmentId and replace the entire schedule for each listed week. Reference prior template IDs and send only changed or new templates. A same-ID definition overrides its previous prescription for these replacements.',
    },
    qualityContract: {
      ...planQualityContractSchema,
      description:
        'Agreed availability and required sports. The server carries phases from assessed week targets. For fixed training weekdays, set startDate and omit relative allowedDays. Determine offsets using actual dates.',
    },
    scheduleConstraints: scheduleConstraintsSchema,
    sessionTemplates: {
      type: 'array',
      description:
        'Reusable session definitions. Prefer templates for repeated easy, quality, long, recovery, and strength sessions to keep the tool payload compact.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'structureKind', 'text'],
        properties: {
          id: { type: 'string', minLength: 1 },
          structureKind: compactWorkoutProperties.structureKind,
          dslVersion: compactWorkoutProperties.dslVersion,
          text: compactWorkoutProperties.text,
          notes: compactWorkoutProperties.notes,
          plannedSessionRpe: compactWorkoutProperties.plannedSessionRpe,
          sportType: compactWorkoutProperties.sportType,
          sportDefinitionCode: compactWorkoutProperties.sportDefinitionCode,
          name: compactWorkoutProperties.name,
        },
      },
    },
    workouts: {
      type: 'array',
      minItems: 1,
      description:
        'Schedule entries. Provide weekIndex or weekIndexes, isoWeekday for named weekdays or relative dayIndex, and either templateId or a complete inline workout.',
      items: {
        type: 'object',
        additionalProperties: false,
        anyOf: [{ required: ['dayIndex'] }, { required: ['isoWeekday'] }],
        properties: compactWorkoutProperties,
      },
    },
  },
} satisfies JsonSchemaObject & AiSdkJsonSchema;

type ExpandResult =
  | { ok: true; data: CoachPlanDraftData }
  | { ok: false; error: string };

type TemplateIds = WeakMap<CoachPlanDraftData['workouts'][number], string>;

export function expandAssessedDraft(ctx: AiToolContext, input: Input, templateIds?: TemplateIds, allowEmptyWorkouts = false): ExpandResult {
  const assessment = ctx.planSuitability?.latest;
  const previous = input.repairWeeks !== undefined && input.assessmentId === assessment?.assessmentId
    ? ctx.planSuitability?.rejectedDraft : undefined;
  const expanded = expandCoachPlanDraftInput(previous ? { ...input, qualityContract: previous.draft.qualityContract } : input,
    previous?.templates, templateIds, allowEmptyWorkouts);
  if (input.repairWeeks !== undefined && (!assessment?.weekTargets || ctx.rollingPlanDraft))
    return { ok: false, error: 'Scoped repair requires the current assessed fixed plan.' };
  if (!expanded.ok || assessment?.status !== 'READY' || ctx.rollingPlanDraft)
    return expanded;

  let data = { ...expanded.data };
  if (assessment.weekTargets) {
    if (input.assessmentId !== assessment.assessmentId)
      return { ok: false, error: 'Use assessmentId from the latest READY suitability assessment; the draft must use its week targets.' };
    if (input.repairWeeks !== undefined) {
      const weeks = input.repairWeeks;
      if (!previous || previous.assessmentId !== assessment.assessmentId || !Array.isArray(weeks) ||
        !weeks.length || new Set(weeks).size !== weeks.length ||
        weeks.some((week) => !previous.repairableWeeks.includes(week)) ||
        data.workouts.some((workout) => !weeks.includes(workout.weekIndex)))
        return { ok: false, error: 'Repair only the reported weeks of the last rejected draft for this assessment. Use repairWeeks and include workouts for those weeks only.' };
      data = {
        ...previous.draft,
        workouts: [...previous.draft.workouts.filter((workout) => !weeks.includes(workout.weekIndex)), ...data.workouts]
          .sort((a, b) => a.weekIndex - b.weekIndex || a.dayIndex - b.dayIndex || (a.sessionIndex ?? 1) - (b.sessionIndex ?? 1)),
      };
    }
    const phases = assessment.weekTargets.map((week) => week.phase);
    if (data.qualityContract?.weekPhases && (
      data.qualityContract.weekPhases.length !== phases.length ||
      data.qualityContract.weekPhases.some((phase, index) => phase !== phases[index])
    )) return { ok: false, error: 'The draft changed the assessed week phases. Use the assessed phases or reassess the whole blueprint if the strategy needs to change.' };
    data.qualityContract = { ...data.qualityContract, weekPhases: phases };
    data.planAssessment = {
      assessmentId: assessment.assessmentId,
      weekTargets: assessment.weekTargets,
      ...(assessment.phases ? { phases: assessment.phases } : {}),
    };
  }
  const assessedCaps = assessment.constraints.maxMinutesByIsoWeekday;
  const suppliedCaps = data.qualityContract?.maxMinutesByIsoWeekday;
  if (suppliedCaps && [1, 2, 3, 4, 5, 6, 7].some((day) =>
    planDailyMinuteLimit(data.qualityContract, day) !== planDailyMinuteLimit(assessment.constraints, day))) {
    return { ok: false, error: 'The draft changed the assessed weekday time limits. Inherit them from the READY assessment.' };
  }
  if (assessedCaps) {
    if (!data.qualityContract?.startDate)
      return { ok: false, error: 'Weekday time limits require a dated draft. Supply the agreed qualityContract.startDate.' };
    data.qualityContract = { ...data.qualityContract, maxMinutesByIsoWeekday: assessedCaps };
  }
  const weekdays = assessment.constraints.fixedTrainingWeekdays;
  if (!weekdays) return { ok: true, data };

  const contract = data.qualityContract;
  const calendar = ctx.currentTurnCalendar;
  if (!contract?.startDate || !calendar) {
    return {
      ok: false,
      error: 'Fixed training weekdays require a dated draft: include qualityContract.startDate and place workouts according to the athlete calendar.',
    };
  }
  const supplied = data.scheduleConstraints;
  const effectiveFrom = calendar.date < contract.startDate
    ? calendar.date
    : contract.startDate;
  const lastPlanDate = addCalendarDays(contract.startDate, data.periodWeeks * 7 - 1);
  if (supplied && (supplied.effectiveFrom > contract.startDate ||
    (supplied.effectiveUntil && supplied.effectiveUntil < lastPlanDate))) {
    return {
      ok: false,
      error: `The assessed weekday rule must cover the training calendar from ${contract.startDate} through ${lastPlanDate}, inclusive. If the athlete confirmed a shorter window, reassess the schedule.`,
    };
  }
  const fixedRestWeekdays = [1, 2, 3, 4, 5, 6, 7].filter(
    (day) => !weekdays.includes(day) || supplied?.fixedRestWeekdays.includes(day),
  );
  const relativeDays = new Set(contract.allowedDays);
  const anchorWeekday = calendarIsoWeekday(contract.startDate);
  const duplicatesFixedDays = relativeDays.size === weekdays.length &&
    weekdays.every((day) => relativeDays.has((day - anchorWeekday + 7) % 7 + 1));
  return {
    ok: true,
    data: {
      ...data,
      qualityContract: duplicatesFixedDays
        ? { ...contract, allowedDays: undefined }
        : contract,
      scheduleConstraints: {
        ...(supplied ?? {
          version: 1,
          revision: 1,
          calendarTimeZone: calendar.timezone,
          unavailableDates: [],
          availableDateOverrides: [],
          effectiveFrom,
          confirmation: {
            source: 'USER',
            reference: ctx.currentUserMessageId ?? assessment.assessmentId,
          },
        }),
        fixedRestWeekdays,
      },
    },
  };
}

function assessDraftQuality(
  ctx: AiToolContext,
  draft: CoachPlanDraftData,
  workouts: PlanQualityWorkout[],
) {
  const userId = ctx.session?.user?.id;
  return userId && ctx.planLoadEstimator
    ? ctx.planLoadEstimator.assessPlanQualityForViewer(userId, draft.periodWeeks, workouts, draft.qualityContract, undefined, draft.planAssessment)
    : assessPlanQuality(draft.periodWeeks, workouts, draft.qualityContract, draft.planAssessment);
}

function recoveryPrescriptions(workouts: PlanQualityWorkout[], weekIndex: number): string {
  return JSON.stringify(workouts.filter((workout) => workout.weekIndex === weekIndex).map((workout) =>
    JSON.stringify([workout.sportType, workout.structureKind, workout.text?.trim(), workout.durationSeconds]),
  ).sort());
}

function namedDistanceBenchmarkMeters(name?: string): number | undefined {
  const match = name?.match(/(\d+(?:[.,]\d+)?)\s*(km|k|公里|千米|m|米)\s*(?:完赛|完成|测试|验证|time trial|race\b|benchmark|test\b|finish\b)/i);
  if (!match) return undefined;
  return Number(match[1].replace(',', '.')) * (/^(?:m|米)$/i.test(match[2]) ? 1 : 1000);
}

function prescribesBenchmarkDistance(blocks: EndurancePlanBlock[], distanceMeters: number): boolean {
  return blocks.some((block) => block.type === 'work' && block.steps.some(({ stepKind, durationMeta }) =>
    stepKind === 'WORK' && durationMeta?.kind === 'DISTANCE' && durationMeta.value != null &&
    durationMeta.value * (durationMeta.unit === 'KILOMETERS' ? 1000 : 1) === distanceMeters,
  ));
}

/** Expand compact template/week references into the existing client plan draft protocol. */
export function expandCoachPlanDraftInput(raw: unknown, inheritedTemplates: Record<string, unknown>[] = [], templateIds?: TemplateIds, allowEmptyWorkouts = false): ExpandResult {
  const input = asRecord(raw);
  if (!input) return { ok: false, error: 'input must be an object' };

  const templates = new Map<string, Record<string, unknown>>();
  for (const { id, ...definition } of inheritedTemplates) templates.set(String(id).trim(), definition);
  const suppliedTemplateIds = new Set<string>();
  const templatesRaw = input.sessionTemplates;
  if (templatesRaw !== undefined && !Array.isArray(templatesRaw)) {
    return { ok: false, error: 'sessionTemplates must be an array' };
  }
  const templateList = Array.isArray(templatesRaw) ? templatesRaw : [];
  for (const [index, rawTemplate] of templateList.entries()) {
    const template = asRecord(rawTemplate);
    if (!template) {
      return {
        ok: false,
        error: `sessionTemplates[${index}] must be an object`,
      };
    }
    const id = typeof template.id === 'string' ? template.id.trim() : '';
    if (!id) {
      return { ok: false, error: `sessionTemplates[${index}].id is required` };
    }
    if (suppliedTemplateIds.has(id)) {
      return { ok: false, error: `sessionTemplates id "${id}" is duplicated` };
    }
    suppliedTemplateIds.add(id);
    const { id: _id, ...definition } = template;
    templates.set(id, definition);
  }

  if (!Array.isArray(input.workouts)) {
    return { ok: false, error: 'workouts must be an array' };
  }
  const workouts: Record<string, unknown>[] = [];
  for (const [index, rawWorkout] of input.workouts.entries()) {
    const workout = asRecord(rawWorkout);
    if (!workout) {
      return { ok: false, error: `workouts[${index}] must be an object` };
    }
    const templateId =
      typeof workout.templateId === 'string' ? workout.templateId.trim() : '';
    const template = templateId ? templates.get(templateId) : undefined;
    if (templateId && !template) {
      return {
        ok: false,
        error: `workouts[${index}].templateId "${templateId}" was not found`,
      };
    }
    const weekIndexes = Array.isArray(workout.weekIndexes)
      ? workout.weekIndexes
      : [workout.weekIndex];
    if (weekIndexes.length === 0) {
      return { ok: false, error: `workouts[${index}] needs a week index` };
    }
    const {
      weekIndex: _weekIndex,
      weekIndexes: _weekIndexes,
      templateId: _templateId,
      isoWeekday,
      ...overrides
    } = workout;
    if (isoWeekday !== undefined) {
      const anchor = asRecord(input.qualityContract)?.startDate;
      if (overrides.dayIndex !== undefined || typeof isoWeekday !== 'number' ||
        !Number.isInteger(isoWeekday) || isoWeekday < 1 || isoWeekday > 7 ||
        typeof anchor !== 'string' || !isCalendarDate(anchor))
        return { ok: false, error: `workouts[${index}] needs one valid isoWeekday and an agreed qualityContract.startDate, or a relative dayIndex.` };
      overrides.dayIndex = (isoWeekday - calendarIsoWeekday(anchor) + 7) % 7 + 1;
    }
    for (const weekIndex of weekIndexes) {
      workouts.push({
        ...(template ?? {}),
        ...overrides,
        templateId: overrides.text === undefined ? templateId : undefined,
        weekIndex,
      });
    }
  }

  const parsed = parseCoachPlanDraftData({
    qualityContract: input.qualityContract,
    scheduleConstraints: input.scheduleConstraints,
    title: input.title,
    description: input.description,
    periodWeeks: input.periodWeeks,
    workouts,
  }, { allowEmptyWorkouts });
  if (parsed.ok && templateIds) {
    parsed.data.workouts.forEach((workout, index) => {
      const id = workouts[index].templateId;
      if (typeof id === 'string' && id) templateIds.set(workout, id);
    });
  }
  return parsed.ok
    ? { ok: true, data: parsed.data }
    : { ok: false, error: parsed.error };
}

function addUtcDays(ymd: string, days: number) {
  const value = new Date(`${ymd}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function ymdDiff(end: string, start: string) {
  return Math.round(
    (new Date(`${end}T00:00:00Z`).getTime() -
      new Date(`${start}T00:00:00Z`).getTime()) /
      86_400_000,
  );
}

function blocksContainHardTarget(blocks: EndurancePlanBlock[]): boolean {
  return blocks.some((block) => {
    if (block.type === 'repeat') return blocksContainHardTarget(block.children);
    return (block.steps ?? []).some((step) => {
      const zone = Number(step?.primaryTargetMeta?.zoneIndex ?? 0);
      return zone >= 4;
    });
  });
}

function asImpactEvents(
  value: unknown,
): Array<{ id?: string; title?: string; startDate?: string }> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const rec = asRecord(item);
    return {
      id: typeof rec?.id === 'string' ? rec.id : undefined,
      title: typeof rec?.title === 'string' ? rec.title : undefined,
      startDate: typeof rec?.startDate === 'string' ? rec.startDate : undefined,
    };
  });
}

function asImpactResult(value: unknown): CompetitionImpactResult | null {
  const rec = asRecord(value);
  if (!rec || !Array.isArray(rec.eventAssessments)) return null;
  return rec as unknown as CompetitionImpactResult;
}

function resolveDraftWorkout(
  definitionService: WorkoutDefinitionService,
  workout: CoachPlanDraftData['workouts'][number],
) {
  return definitionService.resolve({
    kind: workout.structureKind ?? 'ENDURANCE',
    version: 1,
    source: 'TEXT',
    text: workout.text,
  });
}

function presentationInput(ctx: AiToolContext, input: Input) {
  const progress = planPhaseProgress(ctx);
  if (!progress) return { ok: true as const, input };
  if (progress.next || !ctx.planSuitability?.stagedPhases || input.assessmentId !== progress.assessmentId) {
    return aiToolError('Complete the next assessed window with plan.stage_phase before presenting this plan.', 'PLAN_PHASE_REQUIRED');
  }
  if (Object.keys(input).some((key) => !['assessmentId', 'title', 'description'].includes(key))) {
    return aiToolError('The schedule is already assembled. Send only assessmentId, title and description to present it.', 'PLAN_PHASE_ALREADY_ASSEMBLED');
  }
  return { ok: true as const, input: { ...ctx.planSuitability.stagedPhases.draft,
    title: input.title, description: input.description, assessmentId: progress.assessmentId } };
}

export async function validateCoachPlanCandidate(ctx: AiToolContext, input: Input, stage?: { startWeek: number; endWeek: number; canPatchTemplates?: boolean }): Promise<AiToolCheckResult> {
  if (ctx.planQuestionReview && (
    !ctx.planQuestionReview.decisions ||
    ctx.planQuestionReview.decisions.some((item) => item.outcome === 'KEEP' || item.outcome === 'REPLACE')
  )) {
    return aiToolError(
      'Finish reviewing the prior questions and resolve any remaining user input before drafting.',
      'PLAN_QUESTION_REVIEW_REQUIRED',
    );
  }
  const suitability = ctx.planSuitability?.latest;
  const builder = ctx.activeSkillName === 'plan-builder';
  if (
    (ctx.planSuitability || builder) &&
    (!suitability || (builder && suitability.skillName !== 'plan-builder'))
  ) {
    return aiToolError(
      'Run plan.suitability_assess in plan-builder for the current request. Include any explicitly agreed fixed training weekdays before generating the full draft.',
      'PLAN_SUITABILITY_REQUIRED',
    );
  }
  if (suitability && suitability.status !== 'READY') {
    return aiToolError(
      `The latest plan suitability assessment is ${suitability?.status ?? 'missing'}; resolve it with the athlete and reassess before drafting.`,
      'PLAN_SUITABILITY_NOT_READY',
    );
  }
  const templateIds: TemplateIds = ctx.planSuitability?.rejectedDraft?.templateIds ?? new WeakMap();
  const parsed = expandAssessedDraft(ctx, input, templateIds, !!stage && stage.endWeek < suitability!.constraints.periodWeeks);
  if (parsed.ok === false) {
    return aiToolError(parsed.error, 'INVALID_INPUT');
  }
  if (ctx.rollingPlanDraft && parsed.data.periodWeeks !== 1) {
    return aiToolError(
      'A continuous draft previews one starter week. Set periodWeeks to 1 and keep all workouts in week 1.',
      'PLAN_SUITABILITY_CONSTRAINT_CHANGED',
    );
  }
  if (suitability) {
    const qualityContract = parsed.data.qualityContract;
    const requiredSports = new Set(qualityContract?.requiredSports ?? []);
    const missingSports = suitability.constraints.requiredSports.filter(
      (sport) => !requiredSports.has(sport),
    );
    if (
      parsed.data.periodWeeks !== suitability.constraints.periodWeeks ||
      qualityContract?.maxTrainingDaysPerWeek !==
        suitability.constraints.maxTrainingDaysPerWeek ||
      qualityContract?.maxDailyMinutes !==
        suitability.constraints.maxDailyMinutes ||
      missingSports.length > 0
    ) {
      return aiToolError(
        'The draft changed binding constraints after the READY suitability assessment. Reassess the whole brief instead of silently changing period, weekly availability, daily time, or required sports.',
        'PLAN_SUITABILITY_CONSTRAINT_CHANGED',
      );
    }
  }
  if (
    parsed.data.periodWeeks > 1 &&
    !parsed.data.qualityContract?.weekPhases
  ) {
    return aiToolError(
      'Multi-week drafts must declare qualityContract.weekPhases for every week',
      'PLAN_QUALITY_INVALID',
    );
  }

  const { workouts } = parsed.data;
  const definitionService = ctx.workoutDefinitions;
  const definitions = new Map<
    (typeof workouts)[number],
    ResolvedWorkoutDefinition
  >();
  const workoutFeedback: PlanValidationFeedback[] = [];
  for (const w of workouts) {
    const target = { scope: 'DAY' as const, weekIndex: w.weekIndex, dayIndex: w.dayIndex, sessionIndex: w.sessionIndex ?? 1 };
    const notes = w.notes?.trim() ?? '';
    if (!notes) {
      workoutFeedback.push({
        code: 'WORKOUT_NOTES_REQUIRED', target,
        message: `Workout at week ${w.weekIndex} day ${w.dayIndex} needs natural-language notes that explain the complete session in the user's language, including the ordered work and recovery details.`,
      });
    }
    if (notes === w.text.trim()) {
      workoutFeedback.push({
        code: 'WORKOUT_NOTES_COPY_PRESCRIPTION', target,
        message: `Workout at week ${w.weekIndex} day ${w.dayIndex} has notes copied from workouts[].text. Translate the complete prescription into athlete-readable natural language instead of pasting DSL.`,
      });
    }
    try {
      if (
        w.structureKind === 'STRENGTH' &&
        w.sportDefinitionCode &&
        w.sportDefinitionCode !== 'STRENGTH_TRAINING'
      ) {
        workoutFeedback.push({
          code: 'INVALID_STRENGTH_DISCIPLINE', target,
          message: `Strength workout at week ${w.weekIndex} day ${w.dayIndex} must use sportDefinitionCode=STRENGTH_TRAINING.`,
        });
      }
      const definition = resolveDraftWorkout(definitionService, w);
      definitions.set(w, definition);
      const goalDistance = parsed.data.planAssessment && namedDistanceBenchmarkMeters(w.name);
      if (goalDistance && definition.structure.kind === 'ENDURANCE') {
        const phase = parsed.data.qualityContract?.weekPhases?.[w.weekIndex - 1];
        const distanceMatches = prescribesBenchmarkDistance(definition.structure.blocks, goalDistance);
        if (!distanceMatches || phase !== 'RACE') {
          const prescription = w.text.replace(/\s+/g, ' ').trim();
          const excerpt = prescription.length > 160 ? prescription.slice(0, 159) + '…' : prescription;
          const distanceFinding = distanceMatches ? 'prescribes' : 'does not prescribe';
          const repair = distanceMatches
            ? 'Reassess the week as RACE if the athlete intends this distance test.'
            : 'For timed work keep the prescription and rename the session for its duration. Match the notes to that effort and keep the distance goal in the plan description. For an intended distance test, prescribe the distance in a RACE week with evidence it fits the time budget.';
          workoutFeedback.push({
            code: 'GOAL_BENCHMARK_MISMATCH', target,
            message: `name="${w.name}" promises a ${goalDistance} m test. text="${excerpt}" ${distanceFinding} that test. phase=${phase ?? 'unspecified'}. ${repair} If the assessed week focus or phase purpose promised a different test, reassess those fields to match the chosen session.`,
          });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'workout DSL parse failed';
      const message = `workouts[].text must be valid ${w.structureKind ?? 'ENDURANCE'} workout DSL (week ${w.weekIndex} day ${w.dayIndex}): ${msg}`;
      workoutFeedback.push({ code: 'INVALID_WORKOUT_PRESCRIPTION', message, target });
    }
  }
  let scheduleIssues: Array<{ code: string; date?: string; workoutId?: string }> = [];
  if (
    parsed.data.scheduleConstraints &&
    parsed.data.qualityContract?.startDate
  ) {
    const scheduled = workouts.map((w, index) => ({
      id: String(index),
      status: 'PLANNED',
      dayOffset: (w.weekIndex - 1) * 7 + w.dayIndex - 1,
      sportType: w.sportType,
      durationSeconds: definitions.get(w)?.summary.durationSeconds ?? null,
    }));
    const assessment = assessPlanSchedule({
      startDate: parsed.data.qualityContract.startDate,
      periodWeeks: parsed.data.periodWeeks,
      workouts: scheduled,
      changedWorkoutIds: scheduled.map((w) => w.id),
      constraints: parsed.data.scheduleConstraints,
      qualityContract: parsed.data.qualityContract,
      projectDates: true,
    });
    scheduleIssues = assessment.issues;
    for (const issue of scheduleIssues) {
      // The plan quality assessment below reports the exact budget and training day conflicts.
      if (['DAILY_TIME_BUDGET', 'WEEKLY_DAY_BUDGET', 'UNAVAILABLE_DAY'].includes(issue.code)) continue;
      const workout = issue.workoutId == null ? undefined : workouts[Number(issue.workoutId)];
      if (!workout) continue;
      workoutFeedback.push({
        code: issue.code,
        message: `The session on ${issue.date} conflicts with the agreed schedule (${issue.code}).`,
        target: { scope: 'DAY', weekIndex: workout.weekIndex, dayIndex: workout.dayIndex, sessionIndex: workout.sessionIndex ?? 1 },
      });
    }
  }
  const qualityInput = workouts.map((w) => {
      const definition = definitions.get(w);
      return {
        ...w,
        text: definition?.text,
        structureKind: definition?.kind ?? w.structureKind,
        durationSeconds: definition?.summary.durationSeconds ?? null,
        plannedSessionRpe: definition?.structure.kind === 'STRENGTH'
          ? definition.structure.plannedSessionRpe
          : w.plannedSessionRpe,
      };
  });
  const quality = await assessDraftQuality(ctx, parsed.data, qualityInput);
  const loadEstimates = 'workoutLoadEstimates' in quality ? quality.workoutLoadEstimates ?? [] : [];
  if (ctx.planSuitability) {
    const rejected = ctx.planSuitability.rejectedRecoveryPrescriptions ??= new Map();
    for (const [weekIndex, previous] of rejected) {
      if (previous === recoveryPrescriptions(qualityInput, weekIndex) &&
        !quality.issues.some((issue) => issue.code === 'RECOVERY_NOT_REDUCED' && issue.weekIndex === weekIndex)) {
        workoutFeedback.push({
          code: 'RECOVERY_PRESCRIPTION_UNCHANGED',
          target: { scope: 'WEEK', weekIndex },
          message: `Week ${weekIndex} still has the previously rejected prescriptions. Edit the intensity targets, durations or sessions. A phase label or RPE change alone cannot establish the reduction.`,
        });
      }
    }
    for (const { code, weekIndex } of quality.issues) {
      if (code === 'RECOVERY_NOT_REDUCED' && weekIndex && loadEstimates.some((workout) =>
        workout.weekIndex === weekIndex && workout.loadMethod === 'SESSION_RPE',
      )) rejected.set(weekIndex, recoveryPrescriptions(qualityInput, weekIndex));
    }
  }
  const remainingTrainingWeeks = stage && parsed.data.planAssessment?.weekTargets
    .slice(stage.endWeek).some((week) => week.trainingDays.max > 0);
  const errors = quality.issues.filter((issue) => {
    if (issue.severity !== 'ERROR') return false;
    if (!stage || stage.endWeek === parsed.data.periodWeeks) return true;
    const target = issue.target;
    if (target.scope === 'BLOCK') return target.lastWeek <= stage.endWeek;
    if (target.scope === 'PLAN') return !remainingTrainingWeeks || !['MISSING_DISCIPLINE', 'EMPTY_PLAN'].includes(issue.code);
    return target.weekIndex <= stage.endWeek;
  });
  if (stage && parsed.data.planAssessment) {
    const { phases, weekTargets } = parsed.data.planAssessment;
    const phase = phases?.find(({ startWeek, endWeek }) => startWeek <= stage.startWeek && stage.endWeek < endWeek);
    if (phase?.durationMinutes) {
      const submitted = quality.weeks.slice(phase.startWeek - 1, stage.endWeek);
      const known = submitted.reduce((sum, week) => sum + week.knownDurationSeconds, 0) / 60;
      const remaining = weekTargets.slice(stage.endWeek, phase.endWeek);
      const remainingMin = remaining.reduce((sum, week) => sum + week.durationMinutes.min, 0);
      const remainingMax = remaining.reduce((sum, week) => sum + week.durationMinutes.max, 0);
      const excess = known + remainingMin - phase.durationMinutes.max;
      const deficit = phase.durationMinutes.min - known - remainingMax;
      if (excess > 0 || (deficit > 0 && submitted.every((week) => !week.unknownDurationSessions))) {
        const correction = excess > 0 ? `cut at least ${excess.toFixed(1)}m` : `add at least ${deficit.toFixed(1)}m`;
        errors.push({
          code: 'PHASE_TARGET_DURATION', severity: 'ERROR',
          target: { scope: 'BLOCK', firstWeek: stage.startWeek, lastWeek: stage.endWeek },
          message: `Weeks ${phase.startWeek}–${stage.endWeek} total ${known.toFixed(1)} known minutes. Remaining weeks ${stage.endWeek + 1}–${phase.endWeek} target ${remainingMin}–${remainingMax}m. To reach the phase target of ${phase.durationMinutes.min}–${phase.durationMinutes.max}m, ${correction} in weeks ${stage.startWeek}–${stage.endWeek}.`,
        });
      }
    }
  }
  if (errors.length || workoutFeedback.length) {
    const assessment = parsed.data.planAssessment;
    const targets = [...workoutFeedback, ...errors].map((item) => item.target);
    const affectedWeeks = new Set<number>();
    if (assessment && !targets.some((target) => target.scope === 'PLAN')) {
      for (const target of targets) {
        if (target.scope === 'WEEK' || target.scope === 'DAY') affectedWeeks.add(target.weekIndex);
        if (target.scope === 'BLOCK')
          for (let week = target.firstWeek; week <= target.lastWeek; week++) affectedWeeks.add(week);
      }
    }
    const repairableWeeks = [...affectedWeeks].sort((a, b) => a - b);
    if (!stage && ctx.planSuitability && assessment) {
      const prior = ctx.planSuitability.rejectedDraft;
      const templates = new Map((input.repairWeeks && prior?.assessmentId === assessment.assessmentId ? prior.templates : [])
        .map((template) => [String(template.id).trim(), template]));
      for (const raw of Array.isArray(input.sessionTemplates) ? input.sessionTemplates : []) {
        const template = asRecord(raw);
        if (template && typeof template.id === 'string') templates.set(template.id.trim(), template);
      }
      ctx.planSuitability.rejectedDraft = repairableWeeks.length
        ? { assessmentId: assessment.assessmentId, draft: parsed.data, repairableWeeks, templateIds, templates: [...templates.values()] }
        : undefined;
    }
    const sessions = qualityInput.map((workout, index) => {
      const estimate = loadEstimates[index];
      const templateId = templateIds.get(workouts[index]);
      const definition = definitions.get(workouts[index]);
      const timedIntervals = definition?.structure.kind === 'ENDURANCE'
        ? timedIntervalBreakdown(definition.structure.blocks, definition.summary.durationSeconds)
        : undefined;
      return {
        weekIndex: workout.weekIndex, dayIndex: workout.dayIndex, sessionIndex: workout.sessionIndex ?? 1,
        durationSeconds: estimate?.durationDerivedFromPace ? estimate.durationSeconds ?? null : workout.durationSeconds,
        plannedSessionRpe: workout.plannedSessionRpe ?? null, estimatedLoad: estimate?.estimatedLoad ?? null,
        method: estimate?.loadMethod,
        ...(timedIntervals ? { timedIntervals } : {}),
        ...(templateId ? { templateId, prescription: workouts[index].text } : {}),
      };
    });
    const feedback: PlanValidationFeedback[] = [...workoutFeedback, ...errors].map(({ code, message, target }) => {
      if (target.scope !== 'WEEK' && target.scope !== 'DAY') return { code, message, target };
      const mainWorkouts = sessions.filter((session) => session.weekIndex === target.weekIndex &&
        (target.scope !== 'DAY' || (session.dayIndex === target.dayIndex &&
          (target.sessionIndex == null || session.sessionIndex === target.sessionIndex))));
      return { code, message, target, mainWorkouts,
        weeks: quality.weeks.slice(Math.max(0, target.weekIndex - 2), target.weekIndex + 1)
          .map(({ weekIndex, phase, totalEstimatedLoad, knownDurationSeconds, unknownDurationSessions, unknownLoadSessions }) => ({
            weekIndex, phase, totalEstimatedLoad, knownDurationSeconds, unknownDurationSessions, unknownLoadSessions,
          })),
      };
    });
    const message = [...new Set(feedback.map((issue) => issue.message))].join(' ');
    const repair = formatPlanDraftRepair(feedback, assessment?.weekTargets, parsed.data.qualityContract, repairableWeeks, stage);
    return {
      ...aiToolError(message, workoutFeedback.length ? 'INVALID_INPUT' : 'PLAN_QUALITY_INVALID'),
      modelRepair: repair,
      feedback,
      diagnostics: { ...quality, planAssessment: assessment, repairableWeeks, ...(scheduleIssues.length ? { scheduleIssues } : {}) },
    };
  }

  if (!ctx.session?.user?.id) return { ok: true };
  let scopeStartDate = new Date().toISOString().slice(0, 10);
  try {
    const currentTime = await ctx.coachTools.currentTime(ctx);
    scopeStartDate = String(
      currentTime?.user?.date ?? currentTime?.server?.date ?? scopeStartDate,
    );
  } catch {
    // The draft can still be validated with the server date when profile timezone lookup is unavailable.
  }
  scopeStartDate = parsed.data.qualityContract?.startDate ?? scopeStartDate;
  const scopeEndDate = addUtcDays(
    scopeStartDate,
    Math.max(0, parsed.data.periodWeeks * 7 - 1),
  );
  const impact = await ctx.coachTools.competitionImpactResolve(ctx, {
    scopeType: 'PLAN_DRAFT',
    scopeStartDate,
    scopeEndDate,
    anchorDate: scopeStartDate,
  });
  const inputEvents = asImpactEvents(impact?.events);
  const impactResult = asImpactResult(impact?.result);
  const assessments = impactResult?.eventAssessments ?? [];
  const relevant = assessments.filter(
    (item: CompetitionEventImpactAssessment) => item?.relevant === true,
  );
  const scheduled = workouts.map((workout) => {
    const definition = definitions.get(workout);
    const blocks: EndurancePlanBlock[] =
      definition?.structure.kind === 'ENDURANCE'
        ? definition.structure.blocks
        : [];
    const searchable = `${workout.name ?? ''} ${workout.notes ?? ''} ${workout.text}`;
    return {
      workout,
      date: addUtcDays(
        scopeStartDate,
        (workout.weekIndex - 1) * 7 + workout.dayIndex - 1,
      ),
      durationMinutes:
        definition?.summary.durationSeconds == null
          ? null
          : definition.summary.durationSeconds / 60,
      hard:
        definition?.summary.hardSession === true ||
        (definition?.summary.hardSession == null &&
          blocksContainHardTarget(blocks)) ||
        /\b(z[4-7]|threshold|vo2(?:max)?|anaerobic|sprint|race[ -]?pace)\b/i.test(
          searchable,
        ),
    };
  });

  for (const assessment of relevant) {
    const event = inputEvents.find((item) => item?.id === assessment.eventId);
    if (!event) continue;
    const hasEventDayWorkout = scheduled.some(
      (item) => item.date === event.startDate,
    );
    if (hasEventDayWorkout) {
      return aiToolError(
        `Plan conflicts with competition "${event.title}" on ${event.startDate}: do not create a PlanWorkout for the event itself. Use the validated competition impact phases and constraints, then retry.`,
        'COMPETITION_EVENT_DAY_CONFLICT',
      );
    }
    const description = String(parsed.data.description ?? '').toLowerCase();
    const acknowledgesEvent =
      description.includes(String(event.title ?? '').toLowerCase()) ||
      description.includes(String(event.startDate ?? '').toLowerCase());
    if (!stage && !acknowledgesEvent) {
      return aiToolError(
        `Plan preview must explain how it considered relevant competition "${event.title}" (${event.startDate}). Impact=${assessment.currentImpactLevel}; window=${assessment.influenceWindow?.startDate ?? 'n/a'}..${assessment.influenceWindow?.endDate ?? 'n/a'}; strategy=${impactResult?.combinedImpact?.strategySummary ?? assessment.reasoningSummary}. Revise workouts to honor the returned constraints and mention the event, assumptions, and risk in description.`,
        'COMPETITION_IMPACT_NOT_REFLECTED',
      );
    }

    const constraints = Array.isArray(assessment.constraints)
      ? assessment.constraints
      : [];
    for (const constraint of constraints) {
      const inRange = scheduled.filter(
        (item) =>
          item.date >= constraint.startDate &&
          item.date <= constraint.endDate,
      );
      if (constraint.type === 'LIMIT_INTENSITY_DENSITY') {
        const maxHard = Number(
          constraint.parameters?.maxHardSessionsPer7Days ??
            (constraint.strength === 'LOW' ? 2 : 1),
        );
        for (const item of inRange.filter((entry) => entry.hard)) {
          const count = inRange.filter(
            (other) =>
              other.hard &&
              ymdDiff(other.date, item.date) >= 0 &&
              ymdDiff(other.date, item.date) <= 6,
          ).length;
          if (count > maxHard) {
            return aiToolError(
              `Plan violates LIMIT_INTENSITY_DENSITY for competition "${event.title}" (${constraint.startDate}..${constraint.endDate}): at most ${maxHard} hard session(s) per 7 days.`,
              'COMPETITION_INTENSITY_DENSITY_CONFLICT',
            );
          }
        }
      }
      if (constraint.type === 'PROTECT_KEY_SESSION_SPACING') {
        const minDays = Number(
          constraint.parameters?.minimumSpacingDays ?? 2,
        );
        const hard = inRange
          .filter((entry) => entry.hard)
          .sort((a, b) => a.date.localeCompare(b.date));
        if (
          hard.some(
            (item, index) =>
              index > 0 && ymdDiff(item.date, hard[index - 1].date) < minDays,
          )
        ) {
          return aiToolError(
            `Plan violates PROTECT_KEY_SESSION_SPACING for competition "${event.title}": hard sessions need at least ${minDays} days of spacing.`,
            'COMPETITION_KEY_SESSION_SPACING_CONFLICT',
          );
        }
      }
      if (constraint.type === 'POST_EVENT_RECOVERY') {
        const noHardDays = Number(
          constraint.parameters?.noHardSessionsDays ?? 3,
        );
        const protectedEnd = addUtcDays(
          constraint.startDate,
          Math.max(0, noHardDays - 1),
        );
        if (inRange.some((item) => item.hard && item.date <= protectedEnd)) {
          return aiToolError(
            `Plan violates POST_EVENT_RECOVERY for competition "${event.title}": no hard session is allowed through ${protectedEnd}.`,
            'COMPETITION_RECOVERY_CONFLICT',
          );
        }
      }
      if (constraint.type === 'REDUCE_VOLUME' && inRange.length > 0) {
        if (inRange.some((item) => item.durationMinutes == null))
          return aiToolError(
            'Cannot verify a competition time/volume constraint using distance or open-duration sessions. Provide timed prescriptions in the protected window.',
            'COMPETITION_VOLUME_UNKNOWN',
          );
        const maxSessionMinutes = Number(
          constraint.parameters?.maxSessionMinutes ?? 0,
        );
        if (
          maxSessionMinutes > 0 &&
          inRange.some((item) => item.durationMinutes > maxSessionMinutes)
        ) {
          return aiToolError(
            `Plan violates REDUCE_VOLUME for competition "${event.title}": a session exceeds ${maxSessionMinutes} minutes.`,
            'COMPETITION_VOLUME_CONFLICT',
          );
        }
        const rangeDays = Math.max(
          1,
          ymdDiff(constraint.endDate, constraint.startDate) + 1,
        );
        const priorStart = addUtcDays(constraint.startDate, -rangeDays);
        const prior = scheduled.filter(
          (item) =>
            item.date >= priorStart && item.date < constraint.startDate,
        );
        const ratio = Number(constraint.parameters?.targetVolumeRatio ?? 0.8);
        if (prior.some((item) => item.durationMinutes == null))
          return aiToolError(
            'Cannot verify taper reduction against a prior window with unknown duration; use comparable timed prescriptions.',
            'COMPETITION_VOLUME_UNKNOWN',
          );
        const currentDaily =
          inRange.reduce((sum, item) => sum + item.durationMinutes, 0) /
          rangeDays;
        const priorDaily =
          prior.reduce((sum, item) => sum + item.durationMinutes, 0) /
          rangeDays;
        if (
          priorDaily > 0 &&
          currentDaily > priorDaily * Math.max(0.1, ratio + 0.1)
        ) {
          return aiToolError(
            `Plan does not reduce volume enough for competition "${event.title}" during ${constraint.startDate}..${constraint.endDate}.`,
            'COMPETITION_VOLUME_CONFLICT',
          );
        }
      }
    }
  }
  return { ok: true };
}

/**
 * 将结构化计划草案交给客户端展示（日历 +「保存计划」），与 `ask_user_question` 一样走专用 SSE，不写入数据库。
 */
export const presentCoachPlanDraftTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'present_coach_plan_draft',
  aliases: ['coach_plan_draft', 'show_training_plan_draft'],
  description:
    'Present a reviewable training plan in the app. First record named weekdays in plan.suitability_assess; date the draft and place workouts on its calendar. Keep preview dates out of the plan title and weekdays out of workout titles. Prefer sessionTemplates and weekIndexes for repeats. Each workout needs structureKind, a valid prescription, and athlete-readable notes. Does not save.',
  searchHint: 'show plan draft calendar preview',
  cost: 'low',
  applicableSkills: ['plan-builder'],
  requiresActiveSkill: true,
  maxResultChars: PLAN_DRAFT_RESULT_BUDGET,
  isReadOnly: true,
  isConcurrencySafe: false,
  parameters: compactCoachPlanDraftToolParametersSchema,
  validateInput: async (ctx, input) => {
    const candidate = presentationInput(ctx, input);
    return candidate.ok ? validateCoachPlanCandidate(ctx, candidate.input) : candidate;
  },
  execute: async (ctx, input) => {
    const candidate = presentationInput(ctx, input);
    if (candidate.ok === false) throw new Error(candidate.message);
    const expanded = expandAssessedDraft(ctx, candidate.input);
    if (expanded.ok === false) {
      throw new Error(expanded.error);
    }
    const definitionService = ctx.workoutDefinitions;
    const workouts = expanded.data.workouts.map((w) => {
      const definition = resolveDraftWorkout(definitionService, w);
      const isStrength = definition.kind === 'STRENGTH';
      return {
        weekIndex: w.weekIndex,
        dayIndex: w.dayIndex,
        sessionIndex: w.sessionIndex,
        structureKind: definition.kind,
        dslVersion: definition.version,
        text: definition.text,
        notes: w.notes?.trim() || undefined,
        plannedSessionRpe: (definition.structure.kind === 'STRENGTH'
          ? definition.structure.plannedSessionRpe
          : w.plannedSessionRpe) ?? undefined,
        name: w.name?.trim() || undefined,
        sportType: isStrength
          ? w.sportType?.trim() || 'UNKNOWN'
          : w.sportType?.trim() || undefined,
        sportDefinitionCode: isStrength
          ? 'STRENGTH_TRAINING'
          : w.sportType
            ? normalizeSportDefinitionCode(
                w.sportType as SportFamily,
                w.sportDefinitionCode,
              )
            : w.sportDefinitionCode?.trim() || undefined,
        structure: definition.structure,
        summary: definition.summary,
        ...(definition.structure.kind === 'ENDURANCE'
          ? { blocks: definition.structure.blocks }
          : {}),
      };
    });
    const qualityReport = await assessDraftQuality(
      ctx,
      expanded.data,
      workouts.map((w) => ({
        ...w,
        durationSeconds: w.summary.durationSeconds,
      })),
    );
    if (!qualityReport.valid)
      throw new Error('The plan quality evidence changed before delivery. Reassess the plan draft.');
    const warningCodes = [
      ...new Set(
        qualityReport.issues
          .filter((issue) => issue.severity === 'WARNING')
          .map((issue) => issue.code),
      ),
    ];
    const warnings = warningCodes.map((code) =>
      String(
        ctx.i18n.t(`common.coach_plan_quality.${code}`, { lang: ctx.lang }),
      ),
    );
    return {
      kind: COACH_PLAN_DRAFT_TYPE,
      title: expanded.data.title,
      description: [expanded.data.description, ...warnings]
        .filter(Boolean)
        .join('\n\n'),
      periodWeeks: expanded.data.periodWeeks,
      ...(ctx.rollingPlanDraft
        ? { planningMode: 'ROLLING' as const, goal: ctx.planSuitability?.latest?.goalSummary }
        : {}),
      ...(expanded.data.qualityContract
        ? { qualityContract: expanded.data.qualityContract }
        : {}),
      ...(expanded.data.planAssessment ? { planAssessment: expanded.data.planAssessment } : {}),
      ...(expanded.data.scheduleConstraints
        ? { scheduleConstraints: expanded.data.scheduleConstraints }
        : {}),
      qualityReport,
      workouts,
    };
  },
});
