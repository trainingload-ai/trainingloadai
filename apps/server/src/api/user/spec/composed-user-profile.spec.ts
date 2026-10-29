import { describe, expect, it } from '@jest/globals';
import {
  BodyMetricType,
  HeartRateZoneModel,
  MetricSource,
  SportType,
  UserFitnessMetricType,
} from '@prisma/client';
import {
  composeUserProfile,
  composedFitnessMetricWhere,
  parseLoadSourcesCsv,
  parsePreferredSportsCsv,
  thresholdPaceToMetersPerSecond,
} from '../composed-user-profile';

describe('composed user profile helpers', () => {
  it.each([
    undefined,
    HeartRateZoneModel.MHR,
    HeartRateZoneModel.FRIEL,
    HeartRateZoneModel.KARVONEN,
  ])(
    'defaults missing models to MHR while preserving stored %s',
    (heartRateZoneModel) => {
      const profile = composeUserProfile({
        sport: SportType.RUN,
        base: { heartRateZoneModel },
        bodyMetrics: [],
        fitnessMetrics: [],
      });
      expect(profile.heartRateZoneModel).toBe(
        heartRateZoneModel ?? HeartRateZoneModel.MHR,
      );
    },
  );

  it('parses preferred sports and load sources without leaking unknown tokens', () => {
    expect(parsePreferredSportsCsv('run, SWIM, foo, run')).toEqual([
      'RUN',
      'SWIM',
    ]);
    expect(parseLoadSourcesCsv(null)).toEqual([
      'POWER',
      'HEART_RATE',
      'PACE',
      'SESSIONRPE',
    ]);
    expect(parseLoadSourcesCsv('PACE,bogus')).toEqual(['PACE']);
  });

  it('converts threshold pace from sec/km when value2 is present', () => {
    expect(thresholdPaceToMetersPerSecond(3.2, 250)).toBe(4);
    expect(thresholdPaceToMetersPerSecond(250, null)).toBe(4);
    expect(thresholdPaceToMetersPerSecond(3.5, null)).toBe(3.5);
  });

  it('drops noisy AUTO run CS in the fitness query, not after assembly', () => {
    const runWhere = composedFitnessMetricWhere(
      'user-1',
      SportType.RUN,
      new Date('2026-08-02T00:00:00.000Z'),
    );
    expect(runWhere.NOT).toEqual({
      type: UserFitnessMetricType.CS,
      sport: SportType.RUN,
      source: MetricSource.AUTO,
      value: { lt: 1.8 },
    });
    expect(
      composedFitnessMetricWhere(
        'user-1',
        SportType.CYCLING,
        new Date('2026-08-02T00:00:00.000Z'),
      ).NOT,
    ).toBeUndefined();
  });

  it('assembles a run profile and omits power on swim', () => {
    const bodyMetrics = [
      { type: BodyMetricType.WEIGHT, value: '70' },
      { type: BodyMetricType.WEIGHT, value: '68' },
      { type: BodyMetricType.TIMEZONE, value: 'Asia/Shanghai' },
    ];
    const run = composeUserProfile({
      sport: SportType.RUN,
      base: {
        preferredSports: 'RUN',
        loadSources: 'PACE,HEART_RATE',
        defaultVdotSource: 'AUTO',
      },
      bodyMetrics,
      fitnessMetrics: [
        {
          type: UserFitnessMetricType.TP,
          sport: SportType.RUN,
          source: MetricSource.MANUAL,
          recordedAt: new Date('2026-08-01T00:00:00.000Z'),
          value: 4,
          value2: 250,
        },
        {
          type: UserFitnessMetricType.FTP,
          sport: SportType.RUN,
          source: MetricSource.MANUAL,
          recordedAt: new Date('2026-08-01T00:00:00.000Z'),
          value: 280,
        },
        {
          type: UserFitnessMetricType.CS,
          sport: SportType.RUN,
          source: MetricSource.MANUAL,
          recordedAt: new Date('2026-08-01T00:00:00.000Z'),
          value: 3.2,
          value2: 120,
        },
      ],
    });

    expect(run.weight).toBe(70);
    expect(run.timezone).toBe('Asia/Shanghai');
    expect(run.tp).toBe(4);
    expect(run.cs).toBe(3.2);
    expect(run.dPrime).toBe(120);
    expect(run.ftp).toBe(280);
    expect(run.defaultVdotSource).toBe('AUTO');
    expect(run.loadSources).toEqual(['PACE', 'HEART_RATE']);

    const swim = composeUserProfile({
      sport: SportType.SWIM,
      base: { defaultVdotSource: 'AUTO' },
      bodyMetrics,
      fitnessMetrics: [
        {
          type: UserFitnessMetricType.FTP,
          sport: SportType.SWIM,
          source: MetricSource.MANUAL,
          recordedAt: new Date('2026-08-01T00:00:00.000Z'),
          value: 200,
        },
      ],
    });
    expect(swim.ftp).toBeUndefined();
    expect(swim.tp).toBeUndefined();
    expect(swim.defaultVdotSource).toBeUndefined();
  });
});
