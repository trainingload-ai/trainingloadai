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
