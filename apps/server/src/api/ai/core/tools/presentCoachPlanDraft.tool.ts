import {
  WorkoutDefinitionService,
  type ResolvedWorkoutDefinition,
} from '@/api/workout/workout-definition.service';
import { aiToolError, buildAiTool, type AiToolDef } from '../tool.types';
import {
  COACH_PLAN_DRAFT_TYPE,
  parseCoachPlanDraftData,
  type CoachPlanDraftData,
  type JsonSchemaObject,
} from '../../../../../../../packages/shared/ai-coach-schema';
import type { EndurancePlanBlock } from '../../../../../../../packages/shared/endurance-workout-ir';
import { asRecord } from '../ai-common.util';
import { PLAN_DRAFT_SKILLS } from '../tool-skill-scopes';
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
  planQualityContractSchema,
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
    description: [
      'Parseable Trainingload.ai workout DSL only.',
      ...WORKOUT_DSL_CONTRACT_LINES,
    ].join('\n'),
  },
  notes: {
    type: 'string',
    description:
      "Athlete-readable natural-language explanation of the complete workout, in the user's language. In roughly 1-3 practical sentences, restate the ordered warm-up, main work, repeats, recovery/rest, cool-down, durations/distances, and intensity/effort cues. For strength include exercises, sets, reps/time, load or RPE/RIR, and rest. It must make sense without reading the DSL text; do not paste DSL or provide only an intent cue.",
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
  additionalProperties: false,
  required: ['title', 'periodWeeks', 'workouts'],
  properties: {
    title: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    periodWeeks: { type: 'integer', minimum: 1 },
    qualityContract: {
      ...planQualityContractSchema,
      description:
        'Explicit schedule/phase commitments to validate. Copy availability and disciplines from the agreed brief; never invent a budget. weekPhases lists one phase per week for multi-week drafts.',
    },
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
        'Schedule entries. Provide weekIndex or weekIndexes, dayIndex, and either templateId or a complete inline workout.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['dayIndex'],
        properties: compactWorkoutProperties,
      },
    },
  },
} satisfies JsonSchemaObject & AiSdkJsonSchema;

type ExpandResult =
  | { ok: true; data: CoachPlanDraftData }
  | { ok: false; error: string };

/** Expand compact template/week references into the existing client plan draft protocol. */
export function expandCoachPlanDraftInput(raw: unknown): ExpandResult {
  const input = asRecord(raw);
  if (!input) return { ok: false, error: 'input must be an object' };

  const templates = new Map<string, Record<string, unknown>>();
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
    if (templates.has(id)) {
      return { ok: false, error: `sessionTemplates id "${id}" is duplicated` };
    }
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
      ...overrides
    } = workout;
    for (const weekIndex of weekIndexes) {
      workouts.push({
        ...(template ?? {}),
        ...overrides,
        weekIndex,
      });
    }
  }

  const parsed = parseCoachPlanDraftData({
    qualityContract: input.qualityContract,
    title: input.title,
    description: input.description,
    periodWeeks: input.periodWeeks,
    workouts,
  });
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

/**
 * 将结构化计划草案交给客户端展示（日历 +「保存计划」），与 `ask_user_question` 一样走专用 SSE，不写入数据库。
 */
export const presentCoachPlanDraftTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'present_coach_plan_draft',
  aliases: ['coach_plan_draft', 'show_training_plan_draft'],
  description:
    'Present the finalized mixed training plan draft to the user in the app UI (calendar preview + save button). Prefer compact sessionTemplates plus templateId/weekIndexes schedule entries for repeated workouts; the server expands them before validation. Inline workouts remain supported. Every expanded workout must declare structureKind, parse with its matching DSL codec, and include athlete-readable natural-language notes that explain the complete session. Does NOT save to the database.',
  searchHint: 'show plan draft calendar preview',
  cost: 'low',
  applicableSkills: [...PLAN_DRAFT_SKILLS],
  maxResultChars: 24_000,
  isReadOnly: true,
  isConcurrencySafe: false,
  parameters: compactCoachPlanDraftToolParametersSchema,
  validateInput: async (ctx, input) => {
    const suitability = ctx.planSuitability?.latest;
    if (ctx.activeSkillName === 'plan-builder' && !suitability) {
      return aiToolError(
        'Run plan.suitability_assess before generating the full plan draft.',
        'PLAN_SUITABILITY_REQUIRED',
      );
    }
    if (
      ctx.activeSkillName === 'plan-builder' &&
      suitability?.status !== 'READY'
    ) {
      return aiToolError(
        `The latest plan suitability assessment is ${suitability?.status ?? 'missing'}; resolve it with the athlete and reassess before drafting.`,
        'PLAN_SUITABILITY_NOT_READY',
      );
    }
    const parsed = expandCoachPlanDraftInput(input);
    if (parsed.ok === false) {
      return aiToolError(parsed.error, 'INVALID_INPUT');
    }
    if (ctx.activeSkillName === 'plan-builder' && suitability) {
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
    for (const w of workouts) {
      const notes = w.notes?.trim() ?? '';
      if (!notes) {
        return aiToolError(
          `Workout at week ${w.weekIndex} day ${w.dayIndex} needs natural-language notes that explain the complete session in the user's language, including the ordered work and recovery details.`,
          'INVALID_INPUT',
        );
      }
      if (notes === w.text.trim()) {
        return aiToolError(
          `Workout at week ${w.weekIndex} day ${w.dayIndex} has notes copied from workouts[].text. Translate the complete prescription into athlete-readable natural language instead of pasting DSL.`,
          'INVALID_INPUT',
        );
      }
      try {
        if (
          w.structureKind === 'STRENGTH' &&
          w.sportDefinitionCode &&
          w.sportDefinitionCode !== 'STRENGTH_TRAINING'
        ) {
          return aiToolError(
            `Strength workout at week ${w.weekIndex} day ${w.dayIndex} must use sportDefinitionCode=STRENGTH_TRAINING.`,
            'INVALID_INPUT',
          );
        }
        definitions.set(w, resolveDraftWorkout(definitionService, w));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'workout DSL parse failed';
        return aiToolError(
          `workouts[].text must be valid ${w.structureKind ?? 'ENDURANCE'} workout DSL (week ${w.weekIndex} day ${w.dayIndex}): ${msg}`,
          'INVALID_INPUT',
        );
      }
    }

    const quality = assessPlanQuality(
      parsed.data.periodWeeks,
      workouts.map((w) => ({
        ...w,
        durationSeconds: definitions.get(w)?.summary.durationSeconds ?? null,
      })),
      parsed.data.qualityContract,
    );
    if (!quality.valid) {
      const errors = quality.issues.filter(
        (issue) => issue.severity === 'ERROR',
      );
      const messages = errors.map((issue) => {
        if (
          issue.code !== 'RECOVERY_NOT_REDUCED' ||
          typeof issue.weekIndex !== 'number'
        ) {
          return issue.weekIndex
            ? `Week ${issue.weekIndex}: ${issue.message}`
            : issue.message;
        }
        const current = quality.weeks[issue.weekIndex - 1];
        const previous = quality.weeks[issue.weekIndex - 2];
        if (!current || !previous) return issue.message;
        const currentMinutes = Math.round(current.knownDurationSeconds / 60);
        const previousMinutes = Math.round(previous.knownDurationSeconds / 60);
        return `Week ${issue.weekIndex} is declared ${current.phase ?? 'RECOVERY/TAPER'} but totals ${currentMinutes} minutes; it must be shorter than week ${issue.weekIndex - 1} (${previousMinutes} minutes). Reduce or remove sessions, or correct weekPhases when this is actually the goal RACE week. Recalculate complete DSL duration including warm-up, repeated recoveries, and cool-down.`;
      });
      return aiToolError(messages.join('; '), 'PLAN_QUALITY_INVALID');
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
      if (!acknowledgesEvent) {
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
  },
  execute: async (ctx, input) => {
    const expanded = expandCoachPlanDraftInput(input);
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
    const qualityReport = assessPlanQuality(
      expanded.data.periodWeeks,
      workouts.map((w) => ({
        ...w,
        durationSeconds: w.summary.durationSeconds,
      })),
      expanded.data.qualityContract,
    );
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
      ...(expanded.data.qualityContract
        ? { qualityContract: expanded.data.qualityContract }
        : {}),
      qualityReport,
      workouts,
    };
  },
});
