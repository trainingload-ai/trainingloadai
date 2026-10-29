import { TodaySuggestionWorkoutGeneratorService } from './today-suggestion-workout-generator.service';
import type {
  TodaySuggestionConstraintProjection,
  TodaySuggestionDraft,
} from './today-suggestion.types';

describe('TodaySuggestionWorkoutGeneratorService', () => {
  it('uses the dedicated generator skill and returns the validated standard Workout', async () => {
    const runBackgroundCoachTask = jest.fn(async (input) => ({
      result: input.validateResult({
        name: 'Gentle aerobic restart',
        sportType: 'RUN',
        sportDefinitionCode: 'ROAD_RUNNING',
        structureKind: 'ENDURANCE',
        dslVersion: 1,
        text: 'warmup 3m\nwork 12m\ncooldown 5m',
        notes:
          'Warm up easily for 3 minutes, run conversationally for 12 minutes, then walk for 5 minutes.',
      }),
      provider: 'test',
      model: 'test-model',
      runId: 'workout-run-1',
      operationId: 'operation-1',
      replayed: false,
    }));
    const definitions = {
      resolve: jest.fn(() => ({
        kind: 'ENDURANCE',
        version: 1,
        text: 'warmup 3m\nwork 12m\ncooldown 5m',
        structure: { kind: 'ENDURANCE', version: 1, blocks: [] },
        summary: {
          kind: 'ENDURANCE',
          durationSeconds: 1_200,
          stepCount: 3,
          hardSession: false,
        },
        warnings: [],
      })),
    };
    const service = new TodaySuggestionWorkoutGeneratorService(
      { runBackgroundCoachTask } as never,
      definitions as never,
    );
    const projection = {
      userId: 'user-1',
      locale: 'en',
      date: '2026-10-29',
      factHash: 'fact',
      constraintHash: 'constraint',
      lightContext: { load: { ctl: 0, atl: 0 } },
    } as TodaySuggestionConstraintProjection;
    const draft = {
      headline: 'Restart gently today',
      summary: 'Use one short easy session to restore rhythm.',
      recommendation: {
        kind: 'TRAIN',
        durationMinutes: 20,
        intensity: 'VERY_EASY',
      },
      confidence: 'MEDIUM',
      evidenceCodes: ['LOAD_ZERO_28D'],
      preferredIntent: 'CREATE_TODAY_WORKOUT',
      secondaryIntents: ['ASK_COACH'],
      tags: ['Easy'],
    } as TodaySuggestionDraft;

    await expect(service.generate({ projection, draft })).resolves.toEqual(
      expect.objectContaining({
        runId: 'workout-run-1',
        workout: expect.objectContaining({
          name: 'Gentle aerobic restart',
          sportType: 'RUN',
          structureKind: 'ENDURANCE',
          text: 'warmup 3m\nwork 12m\ncooldown 5m',
          summary: expect.objectContaining({ durationSeconds: 1_200 }),
        }),
      }),
    );
    expect(runBackgroundCoachTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'TODAY_SUGGESTION_WORKOUT',
        activeSkillName: 'workout-generator',
        funding: 'PLATFORM',
        allowedToolNames: [
          'workout.intensity_strategy',
          'coach_task_submit_result',
        ],
      }),
    );
    expect(definitions.resolve).toHaveBeenCalledWith({
      kind: 'ENDURANCE',
      version: 1,
      source: 'TEXT',
      text: 'warmup 3m\nwork 12m\ncooldown 5m',
    });
  });

  it('rejects a generated Workout whose parsed duration changes the settled decision', async () => {
    const runBackgroundCoachTask = jest.fn(async (input) => ({
      result: input.validateResult({
        name: 'Too long',
        sportType: 'RUN',
        structureKind: 'ENDURANCE',
        dslVersion: 1,
        text: 'work 60m',
        notes: 'Run for sixty minutes.',
      }),
    }));
    const service = new TodaySuggestionWorkoutGeneratorService(
      { runBackgroundCoachTask } as never,
      {
        resolve: () => ({
          kind: 'ENDURANCE',
          version: 1,
          text: 'work 60m',
          structure: { kind: 'ENDURANCE', version: 1, blocks: [] },
          summary: {
            kind: 'ENDURANCE',
            durationSeconds: 3_600,
            stepCount: 1,
            hardSession: false,
          },
          warnings: [],
        }),
      } as never,
    );

    await expect(
      service.generate({
        projection: {
          userId: 'user-1',
          locale: 'en',
          date: '2026-10-29',
          factHash: 'fact',
          constraintHash: 'constraint',
          lightContext: {},
        } as TodaySuggestionConstraintProjection,
        draft: {
          recommendation: { kind: 'TRAIN', durationMinutes: 20 },
          preferredIntent: 'CREATE_TODAY_WORKOUT',
          secondaryIntents: [],
          summary: 'Run briefly.',
          evidenceCodes: [],
        } as unknown as TodaySuggestionDraft,
      }),
    ).rejects.toThrow('TODAY_WORKOUT_DURATION_MISMATCH');
  });
});
