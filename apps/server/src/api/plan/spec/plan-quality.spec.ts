import { describe, expect, it, jest } from '@jest/globals';
import {
  assessPlanQuality,
  parsePlanQualityContract,
} from '@shared/plan-quality';
import { presentCoachPlanDraftTool } from '@/api/ai/core/tools/presentCoachPlanDraft.tool';
import { EnduranceWorkoutCodec } from '@/api/workout/codecs/endurance-workout.codec';
import { StrengthWorkoutCodec } from '@/api/workout/codecs/strength-workout.codec';
import { FreeformWorkoutCodec } from '@/api/workout/codecs/freeform-workout.codec';
import { WorkoutCodecRegistry } from '@/api/workout/workout-codec.registry';
import { WorkoutDefinitionService } from '@/api/workout/workout-definition.service';
import { WorkoutService } from '@/api/workout/workout.service';

const workoutDefinitions = new WorkoutDefinitionService(
  new WorkoutCodecRegistry(
    new EnduranceWorkoutCodec(new WorkoutService({} as never)),
    new StrengthWorkoutCodec(),
    new FreeformWorkoutCodec(),
  ),
);

const workout = (weekIndex: number, durationSeconds = 1800, dayIndex = 1) => ({
  weekIndex,
  dayIndex,
  sportType: 'RUN',
  text: `work ${durationSeconds}s`,
  durationSeconds,
});
const codes = (result: ReturnType<typeof assessPlanQuality>) =>
  result.issues.map((issue) => issue.code);

describe('plan quality contract', () => {
  it('applies the civil weekday budget to all sessions together and keeps the longer Saturday', () => {
    const sessions = [
      workout(6, 35 * 60, 2), { ...workout(6, 11 * 60, 2), sessionIndex: 2 },
      workout(6, 75 * 60, 5),
    ];
    // The start date is Tuesday. Day 2 is Wednesday and day 5 is Saturday.
    const limits = { startDate: '2026-12-01', maxDailyMinutes: 90, maxMinutesByIsoWeekday: { 3: 45, 6: 90 } };
    const report = assessPlanQuality(8, sessions, limits);
    expect(report.valid).toBe(false);
    expect(report.issues.filter(i => i.code === 'DAILY_TIME_BUDGET')).toEqual([
      expect.objectContaining({ target: { scope: 'DAY', weekIndex: 6, dayIndex: 2 }, message: expect.stringContaining('45-minute') }),
    ]);
    expect(assessPlanQuality(8, sessions, { maxDailyMinutes: 90 }).valid).toBe(true);
  });
  it('does not accept a multi-week training phase with only the first week populated', () => {
    expect(
      codes(
        assessPlanQuality(2, [workout(1)], { weekPhases: ['BUILD', 'BUILD'] }),
      ),
    ).toContain('EMPTY_TRAINING_WEEK');
  });
  it('preserves an agreed start date and rejects impossible calendar dates', () => {
    expect(
      parsePlanQualityContract({ startDate: '2026-09-07' })?.startDate,
    ).toBe('2026-09-07');
    expect(() => parsePlanQualityContract({ startDate: '2026-02-30' })).toThrow(
      'startDate',
    );
  });
  it('enforces Sunday across a year boundary, missing duration and the stricter global ceiling', () => {
    const limits = { startDate: '2026-12-31', maxDailyMinutes: 90, maxMinutesByIsoWeekday: { 7: 45, 6: 100 } };
    const unknown = { ...workout(1, 0, 4), durationSeconds: null, durationNeedsPace: true };
    const report = assessPlanQuality(1, [unknown, workout(1, 95 * 60, 3)], limits);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'UNBOUNDED_DISTANCE_SESSION', message: expect.stringContaining('45-minute') }),
      expect.objectContaining({ code: 'DAILY_TIME_BUDGET', message: expect.stringContaining('90-minute') }),
    ]));
    expect(codes(assessPlanQuality(1, [workout(1)], { maxMinutesByIsoWeekday: { 1: 45 } })))
      .toContain('WEEKDAY_BUDGET_START_DATE_REQUIRED');
  });
  it.each([{}, [], { 0: 45 }, { 8: 45 }, { '03': 45 }, { 3: '45' }, { 3: 0 }, { 3: Infinity }])(
    'rejects invalid weekday minute limits %j', (limits) => {
      expect(() => parsePlanQualityContract({ maxMinutesByIsoWeekday: limits })).toThrow('maxMinutesByIsoWeekday');
    },
  );
  it('rejects out-of-cycle days, fractional positions and duplicate sessions', () => {
    expect(
      codes(
        assessPlanQuality(2, [
          workout(3),
          workout(1, 1800, 8),
          workout(1.5),
          workout(1),
          workout(1),
        ]),
      ),
    ).toEqual(
      expect.arrayContaining(['INVALID_SCHEDULE', 'DUPLICATE_POSITION']),
    );
  });
  it('requires actual reduction when a recovery/taper phase is declared', () => {
    const report = assessPlanQuality(3, [workout(1), workout(2), workout(3)], {
      weekPhases: ['BUILD', 'RECOVERY', 'TAPER'],
    });
    expect(report.valid).toBe(false);
    expect(codes(report)).toContain('RECOVERY_NOT_REDUCED');
    expect(
      assessPlanQuality(
        3,
        [workout(1, 3600), workout(2, 2400), workout(3, 1800)],
        { weekPhases: ['BUILD', 'RECOVERY', 'TAPER'] },
      ).valid,
    ).toBe(true);
  });
  it.each([
    ['RECOVERY', 6_600, 81, true],
    ['RECOVERY', 7_200, 81, true],
    ['RECOVERY', 4_800, 124, false],
    ['TAPER', 4_800, 100, false],
  ] as const)('checks %s from weekly estimated load at %d seconds and %d load', (phase, duration, load, valid) => {
    const report = assessPlanQuality(
      2,
      [
        { ...workout(1, 6_600), estimatedLoad: 100 },
        { ...workout(2, duration), estimatedLoad: load },
      ],
      { weekPhases: ['BUILD', phase] },
    );
    expect(report.valid).toBe(valid);
    expect(report.weeks[1]).toMatchObject({ totalEstimatedLoad: load });
  });
  it('does not infer reduced load from a shorter week with an unestimated workout', () => {
    const report = assessPlanQuality(
      2,
      [
        { ...workout(1, 6_600), estimatedLoad: 100 },
        { ...workout(2, 2_400), estimatedLoad: 35 },
        workout(2, 1_800, 2),
      ],
      { weekPhases: ['BUILD', 'RECOVERY'] },
    );
    expect(report.weeks[1]).toMatchObject({ totalEstimatedLoad: null });
    expect(codes(report)).toContain('RECOVERY_LOAD_UNVERIFIED');
  });
  it.each([
    [80, 90, undefined],
    [115, 125, 'RECOVERY_NOT_REDUCED'],
    [95, 105, 'RECOVERY_LOAD_UNVERIFIED'],
  ])('compares the full recovery interval %d–%d', (min, max, expected) => {
    const report = assessPlanQuality(2, [
      { ...workout(1), estimatedLoadRange: { min: 100, max: 110 } },
      { ...workout(2, 2400), estimatedLoadRange: { min, max } },
    ], { weekPhases: ['BUILD', 'RECOVERY'] });
    expect(report.issues.find((issue) => issue.code.startsWith('RECOVERY_'))?.code).toBe(expected);
    expect(report.weeks[1].estimatedLoadRange).toEqual({ min, max });
  });
  it('requires review when the two weeks use different methods or swap sports', () => {
    const baseline = { ...workout(1), estimatedLoad: 100, loadMethod: 'PACE' };
    for (const changed of [
      { ...workout(2), estimatedLoad: 140, loadMethod: 'HR' },
      { ...workout(2), sportType: 'SWIM', estimatedLoad: 140, loadMethod: 'PACE' },
    ]) {
      const report = assessPlanQuality(2, [baseline, changed], { weekPhases: ['BUILD', 'RECOVERY'] });
      expect(report.valid).toBe(true);
      expect(codes(report)).toContain('RECOVERY_LOAD_UNVERIFIED');
    }
  });
  it('checks coverage of a sport target independently of the other sport in the week', () => {
    const report = assessPlanQuality(1, [
      { ...workout(1), estimatedLoad: 30, loadMethod: 'PACE' },
      { ...workout(1, 1800, 2), sportType: 'CYCLING', estimatedLoad: 20, loadMethod: 'POWER' },
    ], undefined, { weekTargets: [{
      weekIndex: 1, phase: 'BUILD', focus: 'Both endurance sports',
      trainingDays: { min: 2, max: 2 }, durationMinutes: { min: 50, max: 65 },
      loadTarget: { sport: 'RUN', method: 'PACE', range: { min: 50, max: 100 } },
    }] });
    expect(report.valid).toBe(false);
    expect(codes(report)).toContain('WEEK_TARGET_LOAD');
  });
  it('compares the return to training with the pre-recovery load', () => {
    const assess = (returnLoad: number) => assessPlanQuality(
      3,
      [100, 50, returnLoad].map((estimatedLoad, index) => ({ ...workout(index + 1), estimatedLoad })),
      { weekPhases: ['BUILD', 'RECOVERY', 'BUILD'] },
    );
    expect(codes(assess(105))).not.toContain('POST_RECOVERY_LOAD_JUMP_REVIEW');
    expect(codes(assess(150))).toContain('POST_RECOVERY_LOAD_JUMP_REVIEW');
  });
  it('warns, rather than mechanically rejecting, volume jumps and repeated maintenance', () => {
    const report = assessPlanQuality(4, [
      workout(1),
      workout(2, 3600),
      workout(3, 3600),
      workout(4, 3600),
    ]);
    expect(report.valid).toBe(true);
    expect(codes(report)).toEqual(
      expect.arrayContaining(['VOLUME_JUMP_REVIEW', 'REPEATED_WEEKS_REVIEW']),
    );
  });
  it('sums warm-up, work, repeat recoveries and cool-down', () => {
    const codec = new EnduranceWorkoutCodec(new WorkoutService({} as never));
    const summary = codec.summarize(
      codec.parseText('warmup 5m\nwork 20m\ncooldown 5m', 1),
    );
    expect(summary.durationSeconds).toBe(1800);
    expect(
      codec.summarize(
        codec.parseText(
          'warmup 5m\nrepeat 2 {\nwork 8m\nrecovery 1m\n}\ncooldown 5m',
          1,
        ),
      ).durationSeconds,
    ).toBe(1680);
  });
  it('does not report only the warm-up as the total duration of a distance session', () => {
    const codec = new EnduranceWorkoutCodec(new WorkoutService({} as never));
    const summary = codec.summarize(
      codec.parseText('warmup 5m\nwork 5km\ncooldown 5m', 1),
    );
    expect(summary.durationSeconds).toBeNull();
    expect(
      assessPlanQuality(1, [
        { ...workout(1), durationSeconds: summary.durationSeconds },
      ]).weeks[0].totalDurationSeconds,
    ).toBeNull();
  });
  it('uses a time-based repeat-until bound, but not a power-based bound, as duration', () => {
    const codec = new EnduranceWorkoutCodec(new WorkoutService({} as never));
    expect(
      codec.summarize(
        codec.parseText('repeat until 30m {\nwork 3m\nrecovery 1m\n}', 1),
      ).durationSeconds,
    ).toBe(1800);
    expect(
      codec.summarize(
        codec.parseText(
          'warmup 5m\nrepeat until power<100W {\nwork 3m\nrecovery 1m\n}',
          1,
        ),
      ).durationSeconds,
    ).toBeNull();
  });
  it('checks availability across sports and does not silently turn a triathlon into a running plan', () => {
    const report = assessPlanQuality(
      1,
      [
        workout(1),
        { ...workout(1), sessionIndex: 2, structureKind: 'STRENGTH' },
      ],
      { maxDailyMinutes: 45, raceDiscipline: 'TRIATHLON', allowedDays: [2] },
    );
    expect(codes(report)).toEqual(
      expect.arrayContaining([
        'DAILY_TIME_BUDGET',
        'MISSING_DISCIPLINE',
        'UNAVAILABLE_DAY',
      ]),
    );
  });
  it.each([
    { maxDailyMinutes: -1 },
    { weekPhases: ['garbage'] },
    { allowedDays: [8] },
    { raceDiscipline: 'FOOTBALL' },
  ])('rejects invalid contract %j', (value) => {
    expect(() => parsePlanQualityContract(value)).toThrow();
  });
  it('checks parsed definitions before delivering a draft card', async () => {
    const result = await presentCoachPlanDraftTool.validateInput!(
      {
        i18n: { t: jest.fn((key: string) => key) },
        session: null,
        workoutDefinitions,
      } as never,
      {
        title: 'Base and recovery',
        periodWeeks: 2,
        qualityContract: { weekPhases: ['BUILD', 'RECOVERY'] },
        workouts: [1, 2].map((weekIndex) => ({
          weekIndex,
          dayIndex: 1,
          sportType: 'RUN',
          text: 'work 30m',
          notes: 'Run easily for thirty minutes.',
        })),
      },
    );
    expect(result).toMatchObject({ ok: false, code: 'PLAN_QUALITY_INVALID' });
  });
});
