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
import type { AiToolContext } from '../../tool.types';
import { createAiSdkCoachTools, stringifyAiSdkToolResultForModel } from '../../ai-sdk-tool-adapter';
import { PlanLoadEstimatorService } from '@/api/plan/application/plan-load-estimator.service';
import { formatPlanDraftRepair, PLAN_DRAFT_RESULT_BUDGET } from '../plan-draft-repair-feedback';

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
  it('carries assessed weekday limits into the dated draft and reports the weekday cap on a repair', async () => {
    const limits = { maxDailyMinutes: 90, maxTrainingDaysPerWeek: 3, requiredSports: ['RUN'] };
    const ctx = {
      session: null, activeSkillName: 'plan-builder', workoutDefinitions,
      currentTurnCalendar: { date: '2026-11-26', timezone: 'Asia/Shanghai' },
      planSuitability: { latest: { assessmentId: 'test', skillName: 'plan-builder', status: 'READY',
        constraints: { ...limits, periodWeeks: 1, maxMinutesByIsoWeekday: { 1: 45, 3: 45 }, strengthPreference: 'AUTO' } } },
    } as unknown as AiToolContext;
    const workout = { dayIndex: 1, weekIndex: 1, sportType: 'RUN', text: 'warmup 10m\nrepeat 4 {\n work 5m\n recovery 2m\n}\ncooldown 8m', notes: 'Run four tempo intervals with jogging recoveries.' };
    const draft = { title: 'Base week', periodWeeks: 1, qualityContract: { ...limits, startDate: '2026-12-02' }, workouts: [workout] };
    const tooLong = await presentCoachPlanDraftTool.validateInput!(ctx, draft);
    expect(tooLong).toMatchObject({ ok: false, modelRepair: expect.stringContaining('daily cap 45m') });
    expect(await presentCoachPlanDraftTool.validateInput!(ctx, { ...draft, qualityContract: limits })).toMatchObject({ ok: false });
    expect(await presentCoachPlanDraftTool.validateInput!(ctx, { ...draft, qualityContract: { ...draft.qualityContract, maxMinutesByIsoWeekday: { 3: 90 } } }))
      .toMatchObject({ ok: false });
    const saturday = { ...draft, workouts: [{ ...workout, dayIndex: 4, text: 'work 75m' }] };
    expect(await presentCoachPlanDraftTool.validateInput!(ctx, saturday)).toEqual({ ok: true });
    expect(await presentCoachPlanDraftTool.execute(ctx, saturday)).toMatchObject({ qualityContract: { maxMinutesByIsoWeekday: { 1: 45, 3: 45 } } });
  });
  it('validates and delivers assessed training weekdays as actual calendar days', async () => {
    const ctx = {
      ...context('2027-12-31'),
      activeSkillName: 'plan-builder',
      currentTurnCalendar: { date: '2026-11-25', timezone: 'Asia/Shanghai' },
      currentUserMessageId: 'confirmed-brief',
      coachTools: { competitionImpactResolve: async () => ({ events: [] }) },
      planSuitability: {
        latest: {
          assessmentId: 'assessment-1',
          skillName: 'plan-builder',
          status: 'READY',
          constraints: {
            periodWeeks: 1,
            maxTrainingDaysPerWeek: 3,
            maxDailyMinutes: 45,
            requiredSports: ['RUN'],
            strengthPreference: 'AUTO',
            fixedTrainingWeekdays: [1, 3, 6],
          },
        },
      },
    } as AiToolContext;
    const workout = {
      weekIndex: 1,
      dayIndex: 3,
      sportType: 'RUN',
      structureKind: 'ENDURANCE',
      text: 'work 30m',
      notes: 'Run easily for thirty minutes.',
    };
    const draft = {
      title: 'Easy endurance running',
      periodWeeks: 1,
      qualityContract: {
        startDate: '2026-11-25',
        maxTrainingDaysPerWeek: 3,
        maxDailyMinutes: 45,
        requiredSports: ['RUN'],
        allowedDays: [1, 4, 6],
      },
      workouts: [workout],
    };
    // From a Wednesday anchor, position 3 is Friday and position 4 is Saturday.
    expect(await presentCoachPlanDraftTool.validateInput!(ctx, draft)).toMatchObject({
      ok: false,
      feedback: expect.arrayContaining([expect.objectContaining({ code: 'FIXED_REST_DAY' })]),
    });
    const revised = { ...draft, workouts: [{ ...workout, dayIndex: undefined, isoWeekday: 6 }] };
    expect(await presentCoachPlanDraftTool.validateInput!(ctx, revised)).toEqual({ ok: true });
    expect(await presentCoachPlanDraftTool.execute!(ctx, revised)).toMatchObject({
      workouts: [{ dayIndex: 4 }],
      qualityContract: { allowedDays: undefined },
      scheduleConstraints: {
        calendarTimeZone: 'Asia/Shanghai',
        fixedRestWeekdays: [2, 4, 5, 7],
        effectiveFrom: '2026-11-25',
        confirmation: { source: 'USER', reference: 'confirmed-brief' },
      },
    });
  });

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

  it('assesses the draft within plan-builder after a feasibility review', async () => {
    const review = {
      ...context('2027-12-31'),
      activeSkillName: 'plan-builder',
      planSuitability: { latest: { assessmentId: 'from-review', skillName: 'plan-cycle-review', status: 'READY' } },
    } as unknown as AiToolContext;

    expect(await presentCoachPlanDraftTool.validateInput!(review, {})).toMatchObject({
      ok: false, code: 'PLAN_SUITABILITY_REQUIRED',
    });
  });

  it('rejects a draft that changes constraints after the READY assessment', async () => {
    const result = await presentCoachPlanDraftTool.validateInput!(
      {
        activeSkillName: 'plan-builder',
        planSuitability: {
          latest: {
            assessmentId: 'assessment-1',
            skillName: 'plan-builder',
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

  it('rejects unchanged work prescriptions in a recovery week when estimates are unavailable', async () => {
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
        'Week 2 (RECOVERY) repeats the prescriptions from week 1',
      ),
    });
  });
  it('binds the assessed week targets and requires a prescription change after an RPE-only repair', async () => {
    const assessmentId = 'ddf48599-cdcb-4d58-b44c-a3c6e37cdf35';
    const planLoadEstimator = new PlanLoadEstimatorService(
      {} as never, { getComposedUserProfile: async () => ({}) } as never,
      new WorkoutService({} as never), {} as never, {} as never,
    );
    const ctx = {
      ...context('2027-12-31'),
      coachTools: { competitionImpactResolve: async () => ({ events: [] }) },
      planLoadEstimator,
      planSuitability: { latest: {
        assessmentId, status: 'READY',
        constraints: { periodWeeks: 2, maxTrainingDaysPerWeek: 3, maxDailyMinutes: 90, requiredSports: ['RUN'] },
        weekTargets: ['BUILD', 'RECOVERY'].map((phase, index) => ({
          weekIndex: index + 1, phase, focus: 'Aerobic work',
          trainingDays: { min: 1, max: 1 }, durationMinutes: { min: 25, max: 60 },
        })),
      } },
    } as unknown as AiToolContext;
    const draft = {
      title: 'Aerobic build and recovery', periodWeeks: 2, assessmentId,
      qualityContract: { maxTrainingDaysPerWeek: 3, maxDailyMinutes: 90, requiredSports: ['RUN'] },
      sessionTemplates: [{ id: 'shorter', structureKind: 'ENDURANCE', sportType: 'RUN', text: 'work 30m', notes: 'Run for thirty minutes at a conversational effort.', plannedSessionRpe: 4 }],
      workouts: [1, 2].map((weekIndex) => ({
        weekIndex, dayIndex: 1, sportType: 'RUN', text: 'work 45m',
        notes: 'Run for forty-five minutes at a manageable effort.', plannedSessionRpe: 5,
      })),
    };
    expect(await presentCoachPlanDraftTool.validateInput!(ctx, { ...draft, assessmentId: 'obsolete' }))
      .toMatchObject({ ok: false, message: expect.stringContaining('latest READY') });
    expect(await presentCoachPlanDraftTool.validateInput!(ctx, draft)).toMatchObject({
      ok: false, feedback: [expect.objectContaining({ code: 'RECOVERY_NOT_REDUCED' })],
    });
    draft.workouts[1].plannedSessionRpe = 4;
    expect(await presentCoachPlanDraftTool.validateInput!(ctx, draft)).toMatchObject({
      ok: false, feedback: [expect.objectContaining({ code: 'RECOVERY_PRESCRIPTION_UNCHANGED' })],
    });
    const repair = {
      ...draft, repairWeeks: [2], sessionTemplates: undefined,
      workouts: [{ weekIndex: 2, dayIndex: 1, templateId: 'shorter' }],
    };
    expect(await presentCoachPlanDraftTool.validateInput!(ctx, { ...repair, repairWeeks: [1, 2] }))
      .toMatchObject({ ok: false, message: expect.stringContaining('reported weeks') });
    expect(await presentCoachPlanDraftTool.validateInput!(ctx, {
      ...repair, workouts: [{ ...repair.workouts[0], name: '10 公里完成跑' }],
    })).toMatchObject({
      ok: false, feedback: expect.arrayContaining([expect.objectContaining({ code: 'GOAL_BENCHMARK_MISMATCH' })]),
    });
    expect(await presentCoachPlanDraftTool.validateInput!(ctx, repair)).toEqual({ ok: true });
    expect(await presentCoachPlanDraftTool.execute(ctx, repair)).toMatchObject({
      planAssessment: { assessmentId }, qualityContract: { weekPhases: ['BUILD', 'RECOVERY'] },
      workouts: [{ weekIndex: 1, text: 'work 45m' }, { weekIndex: 2, text: 'work 30m' }],
    });
  });
  it('identifies the distance promise and actual timed work even when the assessed phase is already RACE', async () => {
    const assessmentId = 'ddf48599-cdcb-4d58-b44c-a3c6e37cdf35';
    const limits = { maxTrainingDaysPerWeek: 1, maxDailyMinutes: 90, requiredSports: ['RUN'] };
    const weekTarget = { weekIndex: 1, phase: 'RACE', focus: '周六 10 公里完赛跑（约 75 分钟）',
      trainingDays: { min: 1, max: 1 }, durationMinutes: { min: 70, max: 80 } };
    const ctx = {
      session: { user: { id: 'runner' } }, workoutDefinitions,
      coachTools: { competitionImpactResolve: async () => ({ events: [] }) },
      planLoadEstimator: new PlanLoadEstimatorService(
        {} as never, { getComposedUserProfile: async () => ({}) } as never,
        new WorkoutService({} as never), {} as never, {} as never,
      ),
      planSuitability: { latest: {
        assessmentId, status: 'READY', constraints: { ...limits, periodWeeks: 1 }, weekTargets: [weekTarget],
      } },
    } as unknown as AiToolContext;
    const workout = { weekIndex: 1, dayIndex: 6, sportType: 'RUN',
      name: '10 公里完赛跑（约 75 分钟）', text: 'work 75m', notes: '连续跑完 10 公里。' };
    const input = { title: '为完成 10 公里做准备', periodWeeks: 1, assessmentId, qualityContract: limits };
    const result = await presentCoachPlanDraftTool.validateInput!(ctx, { ...input, workouts: [workout] });
    const issue = result.ok === false && result.feedback?.find((item) => item.code === 'GOAL_BENCHMARK_MISMATCH');
    expect(issue).toMatchObject({ target: { scope: 'DAY', weekIndex: 1, dayIndex: 6 } });
    for (const evidence of [workout.name, 'work 75m', 'phase=RACE', 'name', 'notes', 'focus', 'purpose']) {
      expect(issue && issue.message).toContain(evidence);
    }
    expect(await presentCoachPlanDraftTool.validateInput!(ctx, {
      ...input, workouts: [{ ...workout, text: 'work 10km pace 7:30-7:30' }],
    })).toMatchObject({ ok: true });
    weekTarget.focus = '周六连续跑 75 分钟，记录实际距离。';
    expect(await presentCoachPlanDraftTool.validateInput!(ctx, {
      ...input, workouts: [{ ...workout, name: '75 分钟耐力跑', notes: '维持可控体感跑 75 分钟，结束后记录距离。' }],
    })).toMatchObject({ ok: true });
  });
  it('returns compact actionable whole-week and template diagnostics while auditing every rejection', async () => {
    const assessmentId = 'ddf48599-cdcb-4d58-b44c-a3c6e37cdf35';
    const limits = { maxTrainingDaysPerWeek: 2, maxDailyMinutes: 30, requiredSports: ['RUN'] };
    const archive = jest.fn<NonNullable<AiToolContext['onPlanValidationRejected']>>();
    const ctx = {
      session: null, activeSkillName: 'plan-builder', workoutDefinitions,
      signal: new AbortController().signal, onPlanValidationRejected: archive,
      planSuitability: { latest: {
        assessmentId, skillName: 'plan-builder', status: 'READY',
        constraints: { ...limits, periodWeeks: 8 },
        weekTargets: Array.from({ length: 8 }, (_, i) => ({
          weekIndex: i + 1, phase: 'BASE', focus: 'Build a habit',
          trainingDays: { min: 2, max: 2 }, durationMinutes: { min: 50, max: 60 },
        })),
      } },
    } as unknown as AiToolContext;
    const weekIndexes = [1, 2, 3, 4, 5, 6, 7, 8];
    const input = {
      title: 'Build a running habit', assessmentId, periodWeeks: 8, qualityContract: limits,
      sessionTemplates: [{ id: 'walkrun_1_2', name: 'Walk and run', sportType: 'RUN', structureKind: 'ENDURANCE',
        text: 'warmup 5m\nrepeat 8 {\n  work 1m\n  recovery 2m\n}\ncooldown 5m', notes: 'Start and finish with five minutes of easy walking.' }],
      workouts: [{ weekIndexes, dayIndex: 1, templateId: 'walkrun_1_2' },
        { weekIndexes, dayIndex: 4, templateId: 'walkrun_1_2', name: '10 km test' }],
    };
    const sdk = createAiSdkCoachTools({ ctx, tools: [presentCoachPlanDraftTool] });
    const result = await sdk.present_coach_plan_draft.execute!(input, { messages: [], toolCallId: 'candidate' });
    const visible = JSON.stringify(result);
    expect(visible.length).toBeLessThan(4000);
    expect(visible).toContain('walkrun_1_2');
    for (const code of ['WEEK_TARGET_DURATION', 'DAILY_TIME_BUDGET', 'GOAL_BENCHMARK_MISMATCH'])
      expect(visible).toContain(code);
    expect(visible).toMatch(/34\s*m/);
    expect(visible).toMatch(/68\s*m/);
    expect(visible).toContain('cut 8–18m');
    expect(visible).toContain('repairWeeks');
    expect(archive.mock.calls[0][0]).toMatchObject({ candidate: input, modelRepair: (result as { error: string }).error,
      diagnostics: { repairableWeeks: weekIndexes } });
    expect(archive.mock.calls[0][0].feedback).toHaveLength(32);
    expect(archive.mock.calls[0][0].feedback).toContainEqual(expect.objectContaining({
      code: 'WEEK_TARGET_DURATION', mainWorkouts: expect.arrayContaining([
        expect.objectContaining({ durationSeconds: 2040, dayIndex: 1 }),
      ]),
    }));
  });
  it('shows both resolved template versions in a partial repair and keeps inline overrides local', async () => {
    const assessmentId = 'ddf48599-cdcb-4d58-b44c-a3c6e37cdf35';
    const limits = { maxTrainingDaysPerWeek: 2, maxDailyMinutes: 30, requiredSports: ['RUN'] };
    const ctx = {
      session: null, workoutDefinitions, planSuitability: { latest: {
        assessmentId, status: 'READY', constraints: { ...limits, periodWeeks: 2 },
        weekTargets: [1, 2].map((weekIndex) => ({ weekIndex, phase: 'BASE', focus: 'Habits',
          trainingDays: { min: 1, max: 2 }, durationMinutes: { min: 20, max: 60 } })),
      } },
    } as unknown as AiToolContext;
    const template = { id: 'easy', name: 'Easy run', notes: 'Run at conversational effort.',
      text: 'work 40m', structureKind: 'ENDURANCE', sportType: 'RUN' };
    const draft = { title: 'Easy running', periodWeeks: 2, assessmentId, qualityContract: limits,
      sessionTemplates: [template], workouts: [{ dayIndex: 1, templateId: 'easy', weekIndexes: [1, 2] },
        { weekIndex: 1, dayIndex: 4, templateId: 'easy', text: 'work 39m' }] };
    await presentCoachPlanDraftTool.validateInput!(ctx, draft);
    const revised = await presentCoachPlanDraftTool.validateInput!(ctx, { ...draft, repairWeeks: [1],
      sessionTemplates: [{ ...template, text: 'work 35m' }], workouts: [
        { weekIndex: 1, dayIndex: 1, templateId: 'easy' }, draft.workouts[1],
      ],
    });
    expect(revised).toMatchObject({ ok: false, modelRepair: expect.stringContaining('inline=39m') });
    if (!revised.ok) {
      expect(revised.modelRepair).toMatch(/easy[^\n]*W1\/D1[^\n]*work 35m/);
      expect(revised.modelRepair).toMatch(/easy[^\n]*W2\/D1[^\n]*work 40m/);
    }
  });

  it('groups a broken reusable prescription and reports all affected locations', async () => {
    const result = await presentCoachPlanDraftTool.validateInput!({ session: null, workoutDefinitions } as never, {
      title: 'Easy running', periodWeeks: 2, qualityContract: { weekPhases: ['BASE', 'BASE'] },
      sessionTemplates: [{ id: 'broken', sportType: 'RUN', structureKind: 'ENDURANCE', text: 'broken step', notes: 'Easy effort.' }],
      workouts: [{ weekIndexes: [1, 2], dayIndex: 1, templateId: 'broken' }],
    });
    expect(result).toMatchObject({ ok: false, modelRepair: expect.stringContaining('INVALID_WORKOUT_PRESCRIPTION') });
    if (!result.ok) {
      expect(result.modelRepair?.match(/INVALID_WORKOUT_PRESCRIPTION/g)).toHaveLength(1);
      expect(result.modelRepair).toMatch(/W1\/D1\/S1, W2\/D1\/S1/);
      expect(result.modelRepair).toContain('broken step');
    }
  });
  it('locates a default-session mistake on the first course and a daily budget mistake on both', async () => {
    const result = await presentCoachPlanDraftTool.validateInput!({ session: null, workoutDefinitions } as never, {
      title: 'Two sessions', periodWeeks: 1, qualityContract: { maxDailyMinutes: 30 },
      workouts: [{ weekIndex: 1, dayIndex: 2, text: 'work 24m' },
        { weekIndex: 1, dayIndex: 2, sessionIndex: 2, text: 'work 12m', notes: 'Afternoon jog.' }],
    });
    expect(result).toMatchObject({ feedback: expect.arrayContaining([
      expect.objectContaining({ code: 'WORKOUT_NOTES_REQUIRED', target: expect.objectContaining({ sessionIndex: 1 }),
        mainWorkouts: [expect.objectContaining({ sessionIndex: 1 })] }),
      expect.objectContaining({ code: 'DAILY_TIME_BUDGET', mainWorkouts: [
        expect.objectContaining({ sessionIndex: 1 }), expect.objectContaining({ sessionIndex: 2 }),
      ] }),
    ]) });
  });

  it.each([{ weeks: 24, planWide: false }, { weeks: 52, planWide: true }])(
    'keeps long repair results executable within the provider budget (%j)', async ({ weeks, planWide }) => {
      const assessmentId = 'ddf48599-cdcb-4d58-b44c-a3c6e37cdf35';
      const requiredSports = planWide ? ['RUN', 'SWIM'] : ['RUN'];
      const limits = { maxTrainingDaysPerWeek: 7, maxDailyMinutes: 30, requiredSports };
      const weekIndexes = Array.from({ length: weeks }, (_, index) => index + 1);
      const ctx = { session: null, activeSkillName: 'plan-builder', workoutDefinitions, signal: new AbortController().signal,
        planSuitability: { latest: { assessmentId, skillName: 'plan-builder', status: 'READY', constraints: { ...limits, periodWeeks: weeks },
          weekTargets: weekIndexes.map((weekIndex) => ({ weekIndex, phase: 'BUILD', focus: 'Training', trainingDays: { min: 5, max: 7 }, durationMinutes: { min: 100, max: 150 } })),
        } } } as unknown as AiToolContext;
      const entries = weekIndexes.flatMap((weekIndex) => [1, 2, 3, 4, 5, 6, 7].map((dayIndex) => ({
        weekIndex, dayIndex, templateId: `w${weekIndex}_d${dayIndex}_progressive_aerobic_work`,
      })));
      const input = { title: 'Long training block', periodWeeks: weeks, assessmentId, qualityContract: limits,
        sessionTemplates: entries.map(({ templateId, weekIndex, dayIndex }) => ({ id: templateId,
          text: `work ${30 + weekIndex + dayIndex}m`, notes: 'Run easily.', sportType: 'RUN', structureKind: 'ENDURANCE',
        })), workouts: entries };
      const sdk = createAiSdkCoachTools({ ctx, tools: [presentCoachPlanDraftTool] });
      const output = await sdk.present_coach_plan_draft.execute!(input, { messages: [], toolCallId: 'long' });
      const serialized = await stringifyAiSdkToolResultForModel({ tool: presentCoachPlanDraftTool, ctx, input, output });
      expect(serialized.length).toBeLessThanOrEqual(24000);
      const result = JSON.parse(serialized);
      expect(result).toMatchObject({ stage: 'validate_input', code: 'PLAN_QUALITY_INVALID' });
      expect(result.error).toContain(`1–${weeks}`);
      expect(result.error).toContain('DAILY_TIME_BUDGET');
      expect(result.error).toContain('WEEK_TARGET_DURATION');
      expect(result.error).toContain('w1_d7_progressive_aerobic_work');
      if (planWide) {
        expect(result.error).toContain('MISSING_DISCIPLINE');
        expect(result.error).toContain('SWIM');
        expect(result.error).not.toContain('send repairWeeks');
      } else {
        expect(result.error).toMatch(/send repairWeeks/);
      }
    },
  );
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

describe('whole-day interval budget feedback', () => {
  const interval = {
    weekIndex: 1, dayIndex: 1, name: '30-minute run-walk', notes: 'Walk, then run easy repeats.',
    text: 'warmup 5m\nrepeat 3 {\n  work 7m\n  recovery 2m\n}\ncooldown 3m',
  };
  it.each([
    { extra: [], remaining: '22m' },
    { extra: [{ weekIndex: 1, dayIndex: 1, sessionIndex: 2, text: 'work 5m', notes: 'Short spin.' }], remaining: '17m' },
  ])('explains the actual repeats and the time left under the daily cap ($remaining)', async ({ extra, remaining }) => {
    const result = await presentCoachPlanDraftTool.validateInput!({ session: null, workoutDefinitions } as never, {
      title: 'Habit-building', periodWeeks: 1, qualityContract: { maxDailyMinutes: 30 }, workouts: [interval, ...extra],
    });
    expect(result).toMatchObject({ ok: false, modelRepair: expect.stringContaining('5m + 3 × (7m + 2m) + 3m = 35m') });
    if (!result.ok) expect(result.modelRepair).toContain(`at most ${remaining} for all repeats`);
  });
});

describe('time edits constrained by both the day and the whole week', () => {
  const id = 'd8a4055e-0e1a-4905-9066-117cd6bd2131';
  const tempo = 'warmup 10m\nrepeat 3 {\n  work 8m\n  recovery 2m\n}\ncooldown 11m';
  const workout = (dayIndex: number, text: string, sessionIndex = 1) => ({
    weekIndex: 1, dayIndex, sessionIndex, text, notes: 'Keep the prescribed effort.', sportType: 'RUN', structureKind: 'ENDURANCE',
  });
  async function reject(text: string, additional: ReturnType<typeof workout>[] = [], range = { min: 120, max: 135 }) {
    const limits = { maxDailyMinutes: 45, maxTrainingDaysPerWeek: 3, requiredSports: ['RUN'] };
    const ctx = { session: null, workoutDefinitions, planSuitability: { latest: {
      assessmentId: id, status: 'READY', constraints: { ...limits, periodWeeks: 1 }, weekTargets: [{ weekIndex: 1, phase: 'BASE',
        trainingDays: { min: 3, max: 3 }, focus: 'Build endurance', durationMinutes: range }],
    } } } as unknown as AiToolContext;
    const result = await presentCoachPlanDraftTool.validateInput!(ctx, { assessmentId: id, title: 'Tempo phase', periodWeeks: 1, qualityContract: limits,
      workouts: [workout(1, 'work 40m'), workout(3, 'work 40m'), workout(6, text), ...additional] });
    expect(result.ok).toBe(false);
    return result.ok === false ? result.modelRepair : '';
  }
  it('offers the closest whole-minute cooldown within the athlete’s daily and weekly limits', async () => {
    const message = await reject(tempo);
    expect(message).toMatch(/cooldown 11m → 5m.*day 45m, week 125m/);
    expect(message).toContain('1–5m');
  });
  it('deducts a second session that day and never reduces a segment to zero', async () => {
    const message = await reject(tempo, [workout(6, 'work 4m', 2)]);
    expect(message).toMatch(/cooldown 11m → 1m.*day 45m, week 125m/);
    expect(message).not.toMatch(/→ 0m/);
  });
  it('leaves the arithmetic to the coach when there is an untimed distance session that week', async () => {
    const message = await reject(tempo, [workout(3, 'work 1km', 2)]);
    expect(message).toContain('DAILY_TIME_BUDGET');
    expect(message).not.toContain('one-slot option');
  });
  it('reports both over-budget days without suggesting a single edit would fix both', async () => {
    const message = await reject(tempo, [workout(1, 'work 10m', 2)]);
    expect(message).toContain('W1/D1');
    expect(message).toContain('W1/D6');
    expect(message).not.toContain('one-slot option');
  });
  it('allocates a combined budget for three over-limit days, adding multiple sessions on the same day', async () => {
    const message = await reject(tempo, [workout(1, 'work 10m', 2), workout(3, 'work 12m', 2)]);
    expect(message).toContain('change together: D1 ≤45m, D3 ≤45m, D6 ≤45m; combined 120m–135m');
    expect(message).not.toContain('one-slot option');
  });
  it('preserves a recovery after the final work rep when the original workout includes one', async () => {
    const message = await reject(['warmup 5m', ...Array(8).fill('work 4m\nrecovery 1m'), 'cooldown 5m'].join('\n'));
    expect(message).toContain('8 × 4m + 8 × 1m');
    expect(message).toContain('8→7 work reps (7 rests), day 45m, week 125m');
  });
  it('keeps equally timed work steps with different intensity targets separate', async () => {
    const message = await reject('warmup 5m\nwork 15m hr z2\nrecovery 5m\nwork 15m hr z3\nrecovery 5m\ncooldown 5m');
    expect(message).toContain('DAILY_TIME_BUDGET');
    expect(message).not.toContain('work reps');
    expect(message).not.toContain('2 × 15m');
  });
  it('gives the duration delta when a single edit cannot satisfy the daily and weekly constraints', async () => {
    const message = await reject(tempo, [], { min: 130, max: 135 });
    expect(message).toContain('daily cap 45m');
    expect(message).not.toContain('one-slot option');
  });
});

describe('oversized phase validation feedback', () => {
  it('identifies the existing template text to patch and retains the full-window path for inline edits', () => {
    const message = formatPlanDraftRepair([{
      code: 'WEEK_TARGET_DURATION', message: 'Week is short.', target: { scope: 'WEEK', weekIndex: 1 },
      weeks: [{ weekIndex: 1, phase: 'BASE', totalEstimatedLoad: null, knownDurationSeconds: 63.5 * 60, unknownDurationSessions: 0 }],
      mainWorkouts: [{ templateId: 'T11_QUAL30', dayIndex: 1, sessionIndex: 1, durationSeconds: 28.5 * 60, estimatedLoad: null,
        plannedSessionRpe: 5, timedIntervals: { equation: '', outsideRepeatsSeconds: 0, hasRepeats: true,
          editableSteps: [{ kind: 'work', seconds: 120, count: 5, stepIndex: 2 }] } }],
    }], [{ weekIndex: 1, phase: 'BASE', focus: 'Aerobic', durationMinutes: { min: 65, max: 75 }, trainingDays: { min: 2, max: 2 } }],
    { maxDailyMinutes: 40 }, [], { startWeek: 1, endWeek: 4, canPatchTemplates: true });
    expect(message).toContain('omit workouts');
    expect(message).toContain('matching notes');
    expect(message).toContain('inline workout or schedule change, send the complete schedule');
    expect(message).toContain('edit T11_QUAL30.text: step 2 work 2m → 3m');
  });
  it('does not suggest stretching a short work interval by multiples to fill a weekly duration gap', () => {
    const message = formatPlanDraftRepair([{
      code: 'WEEK_TARGET_DURATION', message: 'Week is short.', target: { scope: 'WEEK', weekIndex: 4 },
      weeks: [{ weekIndex: 4, phase: 'RECOVERY', totalEstimatedLoad: null, knownDurationSeconds: 51.33 * 60, unknownDurationSessions: 0 }],
      mainWorkouts: [{ templateId: 'w4_tue', dayIndex: 1, sessionIndex: 1, durationSeconds: 25.33 * 60, estimatedLoad: null,
        plannedSessionRpe: 4, timedIntervals: { equation: '', outsideRepeatsSeconds: 600, hasRepeats: true,
          editableSteps: [{ kind: 'work', seconds: 45, count: 1, stepIndex: 2 }] } }],
    }], [
      { weekIndex: 1, phase: 'BASE', focus: 'A', durationMinutes: { min: 60, max: 65 }, trainingDays: { min: 2, max: 2 } },
      { weekIndex: 2, phase: 'BASE', focus: 'A', durationMinutes: { min: 60, max: 65 }, trainingDays: { min: 2, max: 2 } },
      { weekIndex: 3, phase: 'BASE', focus: 'A', durationMinutes: { min: 60, max: 65 }, trainingDays: { min: 2, max: 2 } },
      { weekIndex: 4, phase: 'RECOVERY', focus: 'A', durationMinutes: { min: 55, max: 60 }, trainingDays: { min: 2, max: 2 } },
    ],
    { maxDailyMinutes: 40 }, [], { startWeek: 1, endWeek: 4, canPatchTemplates: true });
    expect(message).toContain('add 3.67–8.67m');
    expect(message).not.toContain('one-slot option');
  });
  it('fits the SDK envelope and scopes the retry to the rejected window', () => {
    const feedback = Array.from({ length: 128 }, (_, index) => ({
      code: 'WORKOUT_INVALID',
      message: 'Unrecognized "interval" step. '.repeat(30) + index,
      target: { scope: 'DAY' as const, weekIndex: 21 + index % 4, dayIndex: 6, sessionIndex: index + 1 },
    }));
    const message = formatPlanDraftRepair(feedback, undefined, undefined, [21, 22], { startWeek: 21, endWeek: 24 });
    expect(message).toContain('All rejection categories');
    expect(message).toContain('Resubmit plan.stage_phase with the complete schedule for weeks 21–24');
    expect(message).toContain('refer to unchanged ones by id');
    expect(message).not.toContain('Regenerate the full candidate');
    expect(message).not.toContain('send repairWeeks');
    expect(JSON.stringify({ error: message, code: 'PLAN_QUALITY_INVALID', stage: 'validate_input' }).length).toBeLessThanOrEqual(PLAN_DRAFT_RESULT_BUDGET);
  });
});
