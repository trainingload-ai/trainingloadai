import { describe, expect, it, jest } from '@jest/globals';
import {
  expandCoachPlanDraftInput,
  presentCoachPlanDraftTool,
} from '../presentCoachPlanDraft.tool';
import { WorkoutDefinitionService } from '@/api/workout/workout-definition.service';
import { WorkoutCodecRegistry } from '@/api/workout/workout-codec.registry';
import { EnduranceWorkoutCodec } from '@/api/workout/codecs/endurance-workout.codec';
import { StrengthWorkoutCodec } from '@/api/workout/codecs/strength-workout.codec';
import { FreeformWorkoutCodec } from '@/api/workout/codecs/freeform-workout.codec';
import { WorkoutService } from '@/api/workout/workout.service';

const workoutDefinitions = new WorkoutDefinitionService(
  new WorkoutCodecRegistry(
    new EnduranceWorkoutCodec(new WorkoutService({} as never)),
    new StrengthWorkoutCodec(),
    new FreeformWorkoutCodec(),
  ),
);

function addDays(ymd: string, days: number) {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function context(eventDate: string, constraints: unknown[] = []) {
  return {
    session: { user: { id: 'user-1' } },
    i18n: { t: jest.fn((key: string) => key) },
    workoutDefinitions,
    coachTools: {
      competitionImpactResolve: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({
          events: [
            { id: 'event-1', title: 'Goal marathon', startDate: eventDate },
          ],
          result: {
            eventAssessments: [
              {
                eventId: 'event-1',
                relevant: true,
                currentImpactLevel: 'CRITICAL',
                influenceWindow: {
                  startDate: addDays(eventDate, -14),
                  endDate: addDays(eventDate, 7),
                },
                reasoningSummary: 'Protect taper.',
                constraints,
              },
            ],
            combinedImpact: { strategySummary: 'Protect the event taper.' },
          },
        }),
    },
  };
}

describe('presentCoachPlanDraftTool competition integration', () => {
  it('requires a READY suitability assessment in plan-builder turns', async () => {
    const result = await presentCoachPlanDraftTool.validateInput!(
      {
        activeSkillName: 'plan-builder',
        planSuitability: {},
        session: null,
        workoutDefinitions,
      } as never,
      {
        title: 'Base plan',
        periodWeeks: 1,
        workouts: [
          {
            weekIndex: 1,
            dayIndex: 1,
            text: 'work 30m',
            notes: 'Run easily for thirty minutes.',
          },
        ],
      },
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'PLAN_SUITABILITY_REQUIRED',
    });
  });

  it('rejects a draft that changes constraints after the READY assessment', async () => {
    const result = await presentCoachPlanDraftTool.validateInput!(
      {
        activeSkillName: 'plan-builder',
        planSuitability: {
          latest: {
            assessmentId: 'assessment-1',
            status: 'READY',
            constraints: {
              periodWeeks: 1,
              maxTrainingDaysPerWeek: 5,
              maxDailyMinutes: 70,
              requiredSports: ['RUN'],
              strengthPreference: 'AUTO',
            },
          },
        },
        session: null,
        workoutDefinitions,
      } as never,
      {
        title: 'Base plan',
        periodWeeks: 1,
        qualityContract: {
          maxTrainingDaysPerWeek: 5,
          maxDailyMinutes: 90,
          requiredSports: ['RUN'],
        },
        workouts: [
          {
            weekIndex: 1,
            dayIndex: 1,
            sportType: 'RUN',
            text: 'work 30m',
            notes: 'Run easily for thirty minutes.',
          },
        ],
      },
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'PLAN_SUITABILITY_CONSTRAINT_CHANGED',
    });
  });

  it('anchors competition checks to the agreed future date, not today', async () => {
    const ctx = context('2026-10-10');
    const result = await presentCoachPlanDraftTool.validateInput!(
      ctx as never,
      {
        title: 'Taper',
        description: 'Prepare for Goal marathon on 2026-10-10.',
        periodWeeks: 1,
        qualityContract: { startDate: '2026-10-01' },
        workouts: [
          {
            weekIndex: 1,
            dayIndex: 1,
            text: 'work 20m',
            notes: 'Run easily for twenty minutes.',
          },
        ],
      },
    );
    expect(result).toMatchObject({ ok: true });
    expect(ctx.coachTools.competitionImpactResolve).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        scopeStartDate: '2026-10-01',
        scopeEndDate: '2026-10-07',
      }),
    );
  });
  it('does not verify a protected time budget from the warm-up subtotal of a distance workout', async () => {
    const ctx = context('2026-10-10', [
      {
        type: 'REDUCE_VOLUME',
        startDate: '2026-10-01',
        endDate: '2026-10-07',
        parameters: { maxSessionMinutes: 45 },
      },
    ]);
    const result = await presentCoachPlanDraftTool.validateInput!(
      ctx as never,
      {
        title: 'Taper',
        description: 'Prepare for Goal marathon on 2026-10-10.',
        periodWeeks: 1,
        qualityContract: { startDate: '2026-10-01' },
        workouts: [
          {
            weekIndex: 1,
            dayIndex: 1,
            text: 'warmup 5m\nwork 10km',
            notes: 'Warm up for five minutes, then run ten kilometres easily.',
          },
        ],
      },
    );
    expect(result).toMatchObject({
      ok: false,
      code: 'COMPETITION_VOLUME_UNKNOWN',
    });
  });
  it('requires phase coverage for new multi-week drafts', async () => {
    expect(
      await presentCoachPlanDraftTool.validateInput!(
        { session: null, workoutDefinitions } as never,
        {
          title: 'Build',
          periodWeeks: 2,
          workouts: [
            {
              weekIndex: 1,
              dayIndex: 1,
              text: 'work 30m',
              notes: 'Run easily.',
            },
          ],
        },
      ),
    ).toMatchObject({ ok: false, code: 'PLAN_QUALITY_INVALID' });
  });

  it('returns actionable week totals when a recovery week is not reduced', async () => {
    const result = await presentCoachPlanDraftTool.validateInput!(
      { session: null, workoutDefinitions } as never,
      {
        title: 'Base and recovery',
        periodWeeks: 2,
        qualityContract: { weekPhases: ['BUILD', 'RECOVERY'] },
        workouts: [1, 2].map((weekIndex) => ({
          weekIndex,
          dayIndex: 1,
          text: 'work 30m',
          notes: 'Run easily for thirty minutes.',
        })),
      },
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'PLAN_QUALITY_INVALID',
      message: expect.stringContaining(
        'Week 2 is declared RECOVERY but totals 30 minutes; it must be shorter than week 1 (30 minutes)',
      ),
    });
  });
  it('expands reusable templates and repeated week indexes before validation', () => {
    const result = expandCoachPlanDraftInput({
      title: 'Compact base plan',
      periodWeeks: 3,
      sessionTemplates: [
        {
          id: 'easy-30',
          name: 'Easy run',
          structureKind: 'ENDURANCE',
          sportType: 'RUN',
          text: 'work 30m pace z2',
          notes: 'Keep this conversational.',
        },
      ],
      workouts: [
        {
          weekIndexes: [1, 2, 3],
          dayIndex: 2,
          templateId: 'easy-30',
        },
      ],
    });

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        periodWeeks: 3,
        workouts: [
          expect.objectContaining({ weekIndex: 1, dayIndex: 2 }),
          expect.objectContaining({ weekIndex: 2, dayIndex: 2 }),
          expect.objectContaining({ weekIndex: 3, dayIndex: 2 }),
        ],
      }),
    });
  });

  it('validates mixed DSL by structure kind and returns canonical strength summaries', async () => {
    const ctx = {
      i18n: { t: jest.fn((key: string) => key) },
      session: null,
      workoutDefinitions,
    } as never;
    const input = {
      title: 'Mixed plan',
      periodWeeks: 1,
      workouts: [
        {
          weekIndex: 1,
          dayIndex: 1,
          structureKind: 'ENDURANCE' as const,
          sportType: 'RUN',
          text: 'work 30m',
          notes: 'Run easily for 30 minutes at a conversational effort.',
        },
        {
          weekIndex: 1,
          dayIndex: 3,
          structureKind: 'STRENGTH' as const,
          sportType: 'UNKNOWN',
          sportDefinitionCode: 'STRENGTH_TRAINING',
          text: `duration 45m
session rpe 6
exercise "Back Squat" {
  work 3x5 open rpe 7 rest 3m
}
exercise "Push-Up" {
  work 3xAMRAP bodyweight rpe 8 rest 60s
}`,
          notes:
            'Complete 3 sets of 5 back squats at RPE 7 with 3 minutes of rest, then do 3 push-up sets to technical failure at RPE 8 with 60 seconds of rest; keep the whole 45-minute session around RPE 6.',
        },
      ],
    };

    await expect(
      presentCoachPlanDraftTool.validateInput!(ctx as never, input),
    ).resolves.toEqual({ ok: true });
    const output = await presentCoachPlanDraftTool.execute!(
      ctx as never,
      input,
    );

    expect(output.workouts[0]).toMatchObject({
      structureKind: 'ENDURANCE',
      summary: { kind: 'ENDURANCE', durationSeconds: 1800 },
      blocks: expect.any(Array),
    });
    expect(output.workouts[1]).toMatchObject({
      structureKind: 'STRENGTH',
      sportType: 'UNKNOWN',
      sportDefinitionCode: 'STRENGTH_TRAINING',
      structure: { kind: 'STRENGTH', exercises: expect.any(Array) },
      summary: {
        kind: 'STRENGTH',
        durationSeconds: 2700,
        exerciseCount: 2,
        workingSetCount: 6,
      },
    });
    expect(output.workouts[1].text).toContain(
      'work 3x1+ bodyweight rpe 8 rest 1m',
    );
  });

  it('normalizes a sport family mistakenly used as sportDefinitionCode', async () => {
    const ctx = {
      i18n: { t: jest.fn((key: string) => key) },
      session: null,
      workoutDefinitions,
    } as never;
    const input = {
      title: 'Easy running plan',
      periodWeeks: 1,
      workouts: [
        {
          weekIndex: 1,
          dayIndex: 2,
          structureKind: 'ENDURANCE' as const,
          sportType: 'RUN',
          sportDefinitionCode: 'RUN',
          text: 'work 30m hr z2',
          notes: 'Run easily for 30 minutes in heart-rate zone 2.',
        },
      ],
    };

    await expect(
      presentCoachPlanDraftTool.validateInput!(ctx as never, input),
    ).resolves.toEqual({ ok: true });
    const output = await presentCoachPlanDraftTool.execute!(
      ctx as never,
      input,
    );

    expect(output.workouts[0]).toMatchObject({
      sportType: 'RUN',
      sportDefinitionCode: 'ROAD_RUNNING',
    });
  });

  it('requires athlete-readable notes instead of exposing workout DSL alone', async () => {
    const ctx = {
      i18n: { t: jest.fn((key: string) => key) },
      session: null,
      workoutDefinitions,
    } as never;

    await expect(
      presentCoachPlanDraftTool.validateInput!(ctx as never, {
        title: 'One week plan',
        periodWeeks: 1,
        workouts: [
          {
            weekIndex: 1,
            dayIndex: 1,
            structureKind: 'ENDURANCE',
            text: 'work 30m',
          },
        ],
      }),
    ).resolves.toMatchObject({ ok: false, code: 'INVALID_INPUT' });

    await expect(
      presentCoachPlanDraftTool.validateInput!(ctx as never, {
        title: 'One week plan',
        periodWeeks: 1,
        workouts: [
          {
            weekIndex: 1,
            dayIndex: 1,
            structureKind: 'ENDURANCE',
            text: 'work 30m',
            notes: 'work 30m',
          },
        ],
      }),
    ).resolves.toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('automatically resolves out-of-range events and requires the preview to explain them', async () => {
    const start = new Date().toISOString().slice(0, 10);
    const eventDate = addDays(start, 9);
    const ctx = context(eventDate);
    const result = await presentCoachPlanDraftTool.validateInput!(
      ctx as never,
      {
        title: 'One week plan',
        description: 'General training block.',
        periodWeeks: 1,
        workouts: [
          {
            weekIndex: 1,
            dayIndex: 1,
            text: 'work 30m',
            notes: 'Run easily for 30 minutes at a conversational effort.',
          },
        ],
      },
    );
    expect(ctx.coachTools.competitionImpactResolve).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ scopeType: 'PLAN_DRAFT' }),
    );
    expect(result).toMatchObject({
      ok: false,
      code: 'COMPETITION_IMPACT_NOT_REFLECTED',
    });
  });

  it('rejects a generated workout that duplicates the competition event day', async () => {
    const start = new Date().toISOString().slice(0, 10);
    const ctx = context(start);
    const result = await presentCoachPlanDraftTool.validateInput!(
      ctx as never,
      {
        title: 'Race plan',
        description: `Goal marathon on ${start}.`,
        periodWeeks: 1,
        workouts: [
          {
            weekIndex: 1,
            dayIndex: 1,
            text: 'work 30m',
            notes: 'Run easily for 30 minutes at a conversational effort.',
          },
        ],
      },
    );
    expect(result).toMatchObject({
      ok: false,
      code: 'COMPETITION_EVENT_DAY_CONFLICT',
    });
  });

  it('enforces validated competition intensity-density constraints', async () => {
    const start = new Date().toISOString().slice(0, 10);
    const eventDate = addDays(start, 9);
    const ctx = context(eventDate, [
      {
        type: 'LIMIT_INTENSITY_DENSITY',
        startDate: start,
        endDate: addDays(start, 6),
        strength: 'CRITICAL',
        parameters: { maxHardSessionsPer7Days: 1 },
      },
    ]);
    const result = await presentCoachPlanDraftTool.validateInput!(
      ctx as never,
      {
        title: 'Race plan',
        description: `Goal marathon on ${eventDate}.`,
        periodWeeks: 1,
        workouts: [
          {
            weekIndex: 1,
            dayIndex: 1,
            text: 'work 30m hr z4',
            notes:
              'Run for 30 minutes in heart-rate zone 4 at a controlled hard effort.',
          },
          {
            weekIndex: 1,
            dayIndex: 3,
            text: 'work 30m hr z4',
            notes:
              'Run for 30 minutes in heart-rate zone 4 at a controlled hard effort.',
          },
        ],
      },
    );
    expect(result).toMatchObject({
      ok: false,
      code: 'COMPETITION_INTENSITY_DENSITY_CONFLICT',
    });
  });
});
