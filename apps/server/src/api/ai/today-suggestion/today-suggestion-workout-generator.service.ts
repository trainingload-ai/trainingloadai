import { Injectable } from '@nestjs/common';
import { AiUsageKind } from '@prisma/client';
import type { TodaySuggestionWorkout } from '@shared/ai-today-suggestion-contract';
import { PLAN_SPORT_TYPES } from '@/api/plan/plan.constants';
import { WorkoutDefinitionService } from '@/api/workout/workout-definition.service';
import { normalizeSportDefinitionCode } from '@/sports/sport-catalog.types';
import { AiService } from '../ai.service';
import { stableJson } from '../core/ai-common.util';
import type {
  TodaySuggestionConstraintProjection,
  TodaySuggestionDraft,
} from './today-suggestion.types';

const SPORT_TYPES = new Set<string>(PLAN_SPORT_TYPES);
const STRUCTURE_KINDS = new Set(['ENDURANCE', 'STRENGTH', 'FREEFORM']);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredText(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`TODAY_WORKOUT_${field}_REQUIRED`);
  if (text.length > maxLength) {
    throw new Error(`TODAY_WORKOUT_${field}_TOO_LONG`);
  }
  return text;
}

@Injectable()
export class TodaySuggestionWorkoutGeneratorService {
  constructor(
    private readonly ai: AiService,
    private readonly definitions: WorkoutDefinitionService,
  ) {}

  async generate(args: {
    projection: TodaySuggestionConstraintProjection;
    draft: TodaySuggestionDraft;
    signal?: AbortSignal;
    allowWithoutConsent?: boolean;
  }): Promise<{
    workout: TodaySuggestionWorkout;
    runId: string;
    provider: string | null;
    model: string;
    replayed: boolean;
  }> {
    const { projection, draft } = args;
    if (draft.preferredIntent !== 'CREATE_TODAY_WORKOUT') {
      throw new Error('TODAY_WORKOUT_GENERATION_NOT_REQUESTED');
    }
    const result = await this.ai.runBackgroundCoachTask({
      userId: projection.userId,
      lang: projection.locale,
      taskType: 'TODAY_SUGGESTION_WORKOUT',
      activeSkillName: 'workout-generator',
      usageKind: AiUsageKind.TODAY_SUGGESTION,
      funding: 'PLATFORM',
      triggerType: 'HOME_TODAY_SUGGESTION_WORKOUT',
      triggerRef: `${projection.date}:${projection.locale}`,
      dedupeKey: [
        'today-suggestion-workout-v1',
        projection.factHash,
        projection.constraintHash,
        projection.locale,
        stableJson(draft.recommendation),
        draft.summary,
      ].join(':'),
      allowedToolNames: [
        'workout.intensity_strategy',
        'coach_task_submit_result',
      ],
      signal: args.signal,
      allowWithoutConsent: args.allowWithoutConsent,
      instructions: [
        'The daily coaching decision is already complete. Generate the one standard Workout requested by that decision; do not repeat or revise the daily judgment.',
        'The Workout is an independent session for the supplied athlete-local date. Do not schedule or persist it, and do not output plan/week/day fields.',
        'For RUN, CYCLING, or SWIM, use structureKind ENDURANCE. For strength, use sportType UNKNOWN, sportDefinitionCode STRENGTH_TRAINING, and structureKind STRENGTH. Use FREEFORM only when the activity genuinely has no structured codec.',
        'The complete parsed duration should match recommendation.durationMinutes when it is supplied. Notes must explain the full session in the athlete language and must not copy the DSL.',
        'Submit exactly: {"name":"...","sportType":"RUN|CYCLING|SWIM|STRETCHING|UNKNOWN","sportDefinitionCode":"catalog code","structureKind":"ENDURANCE|STRENGTH|FREEFORM","dslVersion":1,"text":"valid Workout DSL only","notes":"complete athlete-readable execution instructions"}.',
        `Write name and notes in locale ${projection.locale}.`,
        `SETTLED_DAILY_DECISION_BEGIN\n${stableJson({
          date: projection.date,
          recommendation: draft.recommendation,
          summary: draft.summary,
          uncertainty: draft.uncertainty ?? null,
          evidenceCodes: draft.evidenceCodes,
        })}\nSETTLED_DAILY_DECISION_END`,
        `SERVER_CONTEXT_BEGIN\n${stableJson(projection.lightContext)}\nSERVER_CONTEXT_END`,
      ].join('\n\n'),
      validateResult: (raw) => this.validateWorkout(raw, draft),
    });
    return {
      workout: result.result,
      runId: result.runId,
      provider: result.provider,
      model: result.model,
      replayed: result.replayed,
    };
  }

  private validateWorkout(
    raw: unknown,
    draft: TodaySuggestionDraft,
  ): TodaySuggestionWorkout {
    const row = record(raw);
    if (!row) throw new Error('TODAY_WORKOUT_INVALID_RESULT');
    const sportType = String(row.sportType ?? '')
      .trim()
      .toUpperCase();
    const structureKind = String(row.structureKind ?? '')
      .trim()
      .toUpperCase();
    const dslVersion = Number(row.dslVersion);
    if (!SPORT_TYPES.has(sportType)) {
      throw new Error('TODAY_WORKOUT_INVALID_SPORT_TYPE');
    }
    if (!STRUCTURE_KINDS.has(structureKind) || dslVersion !== 1) {
      throw new Error('TODAY_WORKOUT_INVALID_STRUCTURE');
    }
    if (
      structureKind === 'ENDURANCE' &&
      !['RUN', 'CYCLING', 'SWIM'].includes(sportType)
    ) {
      throw new Error('TODAY_WORKOUT_ENDURANCE_SPORT_MISMATCH');
    }
    const rawSportDefinitionCode = String(row.sportDefinitionCode ?? '').trim();
    if (
      structureKind === 'STRENGTH' &&
      (sportType !== 'UNKNOWN' ||
        rawSportDefinitionCode.toUpperCase() !== 'STRENGTH_TRAINING')
    ) {
      throw new Error('TODAY_WORKOUT_STRENGTH_SPORT_MISMATCH');
    }
    const name = requiredText(row.name, 'NAME', 100);
    const notes = requiredText(row.notes, 'NOTES', 1_200);
    const text = requiredText(row.text, 'TEXT', 12_000);
    if (notes === text) throw new Error('TODAY_WORKOUT_NOTES_COPIED_FROM_DSL');

    const definition = this.definitions.resolve({
      kind: structureKind as TodaySuggestionWorkout['structureKind'],
      version: 1,
      source: 'TEXT',
      text,
    });
    const requestedMinutes = draft.recommendation.durationMinutes;
    const actualSeconds = definition.summary.durationSeconds;
    if (requestedMinutes && actualSeconds != null) {
      const deltaMinutes = Math.abs(actualSeconds / 60 - requestedMinutes);
      const toleranceMinutes = Math.max(3, requestedMinutes * 0.1);
      if (deltaMinutes > toleranceMinutes) {
        throw new Error('TODAY_WORKOUT_DURATION_MISMATCH');
      }
    }
    const normalizedSport = sportType as TodaySuggestionWorkout['sportType'];
    return {
      sportType: normalizedSport,
      sportDefinitionCode: normalizeSportDefinitionCode(
        normalizedSport,
        rawSportDefinitionCode || null,
      ),
      name,
      notes,
      structureKind: definition.kind,
      dslVersion: 1,
      text: definition.text,
      structure: definition.structure,
      summary: definition.summary,
    };
  }
}
