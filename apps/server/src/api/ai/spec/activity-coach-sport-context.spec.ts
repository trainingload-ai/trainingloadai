import { describe, expect, it, jest } from '@jest/globals';
import { SportType } from '@prisma/client';
import {
  buildActivityReviewGenerationContext,
  buildUnifiedActivityAnalysisInput,
} from '../activity-coach-unified-input';
import { resolveActivityCoachSportContext } from '../activity-coach-sport-context';

describe('resolveActivityCoachSportContext', () => {
  it('uses the endurance family with subtype-specific trail guidance', () => {
    const context = resolveActivityCoachSportContext({
      sportType: SportType.RUN,
      sportDefinitionCode: 'TRAIL_RUNNING',
    });

    expect(context.family).toBe('RUN');
    expect(context.sportCode).toBe('TRAIL_RUNNING');
    expect(context.coachingFocus).toContain('effort relative to elevation');
    expect(context.forbiddenInferences).toContain(
      'judge execution from flat-road pace alone',
    );
  });

  it('treats strength as OTHER with a strict strength-only evidence policy', () => {
    const context = resolveActivityCoachSportContext({
      sportType: SportType.UNKNOWN,
      sportDefinitionCode: 'STRENGTH_TRAINING',
    });

    expect(context.family).toBe('OTHER');
    expect(context.allowedMetricDomains).toEqual([
      'duration',
      'heart_rate',
      'load',
      'session_rpe',
      'strength',
    ]);
    expect(context.forbiddenInferences).toEqual(
      expect.arrayContaining([
        'pace',
        'elevation',
        'cadence',
        'stride mechanics',
      ]),
    );
  });
});

describe('buildUnifiedActivityAnalysisInput', () => {
  it('reports distance/time pace and actual pace load without inventing heart-rate evidence', async () => {
    const input = await buildUnifiedActivityAnalysisInput({
      sportType: SportType.RUN,
      timerTime: 1410,
      distance: 2200,
      avgSpeed: 1.294,
      avgHeartRate: null,
      maxHeartRate: null,
      trimp: null,
      actualLoad: 1.7499,
      actualLoadSource: 'PACE',
      activityZones: [
        { zoneType: 'PACE', name: 'Z1', percent: 0, duration: 0 },
      ],
    } as never);
    expect(input.hr.available).toBe(false);
    expect(input.hr.primary_zone).toBeUndefined();
    expect(input.pace?.primary_zone).toBeUndefined();
    expect(input.pace?.average_sec_per_km).toBe(640.9);
    expect(input.pace?.average_formatted).toBe('10:41/km');
    expect(input.activity_fatigue).toMatchObject({
      actual_load: 1.7499,
      source: 'PACE',
    });
    expect(input.activity_fatigue.trimp).toBeUndefined();
  });

  it('resolves a coordinate timezone through the CommonJS tz-lookup export', async () => {
    const input = await buildUnifiedActivityAnalysisInput(
      {
        sportType: SportType.RUN,
        startTime: new Date('2026-08-24T13:25:00.000Z'),
        startLat: 31.2304,
        startLng: 121.4737,
        timezone: null,
        timerTime: 1200,
      } as never,
      'user-1',
      {},
    );

    expect(input.start_time).toBe('2026-08-24 21:25');
    expect(input.temporal_context).toEqual({
      activity_local_date: '2026-08-24',
      activity_timezone: 'Asia/Shanghai',
      historical_load_as_of: '2026-08-24',
      historical_load_window_days: 14,
    });
    expect(JSON.stringify(input)).not.toContain('31.2304');
    expect(JSON.stringify(input)).not.toContain('121.4737');
    expect(JSON.stringify(input)).not.toContain('user-1');
  });

  it('skips PMC history when the activity start time is missing', async () => {
    const listRange = jest.fn(async () => []);

    const input = await buildUnifiedActivityAnalysisInput(
      {
        sportType: SportType.UNKNOWN,
        sportDefinitionCode: 'STRENGTH_TRAINING',
        startTime: null,
        timezone: 'UTC',
        timerTime: 1800,
      } as never,
      'user-1',
      {},
      { listRange },
    );

    expect(listRange).not.toHaveBeenCalled();
    expect(input.start_time).toBeUndefined();
    expect(input.temporal_context).toBeUndefined();
    expect(input.historical_load?.daily_load_last_7d).toBeUndefined();
    expect(input.historical_load?.rest_days_last_14d).toBeUndefined();
  });

  it('marks an old imported activity as historical without changing stable evidence', async () => {
    const input = await buildUnifiedActivityAnalysisInput(
      {
        sportType: SportType.RUN,
        startTime: new Date('2026-07-29T11:00:00.000Z'),
        timezone: 'Asia/Shanghai',
        timerTime: 1500,
      } as never,
      'user-1',
      {},
      { listRange: jest.fn(async () => []) },
    );

    expect(input.temporal_context?.historical_load_as_of).toBe('2026-07-29');
    expect(
      buildActivityReviewGenerationContext(
        input,
        new Date('2026-10-26T12:00:00.000Z'),
      ),
    ).toEqual({
      review_local_date: '2026-10-26',
      activity_age_days: 89,
      recency: 'historical',
    });
    expect(input).not.toHaveProperty('review_context');
  });

  it('labels heart-rate, pace and power zone models without collapsing unknowns to Karvonen', async () => {
    const unlabeled = await buildUnifiedActivityAnalysisInput(
      {
        sportType: SportType.RUN,
        startTime: new Date('2026-07-17T08:00:00.000Z'),
        timezone: 'UTC',
        timerTime: 3600,
      } as never,
      'user-1',
      {},
    );
    expect(unlabeled.hr.zone_type).toBeUndefined();
    expect(unlabeled.power.zone_type).toBeUndefined();
    expect(unlabeled.pace?.zone_type).toBeUndefined();

    const labeled = await buildUnifiedActivityAnalysisInput(
      {
        sportType: SportType.RUN,
        startTime: new Date('2026-07-17T08:00:00.000Z'),
        timezone: 'UTC',
        timerTime: 3600,
      } as never,
      'user-1',
      {
        heartRateZoneModel: 'KARVONEN',
        paceZoneModel: 'DANIELS',
        powerZoneModel: 'STRYD',
      },
    );
    expect(labeled.hr.zone_type).toBe('Karvonen (HRR)');
    expect(labeled.pace?.zone_type).toBe('Jack Daniels (VO2max)');
    expect(labeled.power.zone_type).toBe('Stryd Run (5 zones, FTP)');
  });

  it('removes endurance evidence and includes completed strength work', async () => {
    const input = await buildUnifiedActivityAnalysisInput(
      {
        sportType: SportType.UNKNOWN,
        sportDefinitionCode: 'STRENGTH_TRAINING',
        startTime: new Date('2026-07-17T08:00:00.000Z'),
        timezone: 'UTC',
        timerTime: 3600,
        distance: 5000,
        ascent: 300,
        avgHeartRate: 122,
        avgPower: 240,
        avgCadence: 88,
        sessionRpe: 8,
        strengthExercises: [
          {
            name: 'Back Squat',
            exerciseCode: 'BACK_SQUAT',
            equipmentCode: 'BARBELL',
            sets: [
              {
                setIndex: 0,
                setType: 'WORKING',
                completedReps: 6,
                completedDurationSeconds: null,
                loadType: 'ABSOLUTE',
                loadValue: 50,
                loadUnit: 'KG',
                actualRpe: 8,
                actualRir: 2,
                completedAt: new Date('2026-07-17T08:30:00.000Z'),
                source: 'APP',
              },
            ],
          },
        ],
      } as never,
      'user-1',
      {},
      { listRange: jest.fn(async () => []) },
    );

    expect(input.sport_context.sportCode).toBe('STRENGTH_TRAINING');
    expect(input.distance_km).toBeUndefined();
    expect(input.ascent_m).toBeUndefined();
    expect(input.power.avg).toBeUndefined();
    expect(input.cadence.avg).toBeUndefined();
    expect(input.hr.avg).toBe(122);
    expect(input.session_rpe).toBe(8);
    expect(input.strength).toMatchObject({
      exercise_count: 1,
      set_count: 1,
      completed_set_count: 1,
      completed_reps: 6,
      volume_load_kg: 300,
    });
    expect(input.strength?.exercises[0].sets[0]).toMatchObject({
      reps: 6,
      load_type: 'ABSOLUTE',
      load_value: 50,
      load_unit: 'KG',
      rpe: 8,
      rir: 2,
    });
  });
});
