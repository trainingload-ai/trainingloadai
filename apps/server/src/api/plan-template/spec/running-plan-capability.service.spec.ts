import { describe, expect, it, jest } from '@jest/globals';
import { MetricSource, UserFitnessMetricType } from '@prisma/client';
import { getRunPlanTemplate } from '@shared/plan-templates';
import {
  estimateVdotFromThresholdSpeed,
  predictTimeForVdot,
} from '@shared/vdot';
import { RunningPlanCapabilityService } from '../running-plan-capability.service';

const now = new Date('2026-08-25T12:00:00.000Z');
const baseline = {
  personalizationReadiness: 'adequate' as const,
  activityCount: 32,
  validWeeks: 8,
  activeDaysPerWeek: 4,
  medianRunsPerWeek: 5,
  medianDistanceMetersPerWeek: 60_000,
  medianDurationMinutesPerWeek: 360,
  latestWeekDurationMinutes: 360,
  latestWeekDistanceMeters: 60_000,
  longestRunDistanceMeters: 24_000,
  longestContinuousRunMinutes: 180,
  recent5kSeconds: 1_500,
  recentRaceEffort: null,
};

function service(metrics: unknown[] = []) {
  const prisma = {
    userFitnessMetric: { findMany: jest.fn(async (_query?: unknown) => metrics) },
    competitionEvent: { findFirst: jest.fn(async () => null) },
  };
  const users = { fitnessMetrics: () => prisma.userFitnessMetric };
  const competitions = {
    findPlannedGoalRaceById: (_userId: string, _eventId: string) =>
      prisma.competitionEvent.findFirst(),
  };
  return {
    resolver: new RunningPlanCapabilityService(
      users as never,
      competitions as never,
    ),
    prisma,
  };
}

describe('RunningPlanCapabilityService', () => {
  it('prefers a fresh VO2_MAX over TP and CS pace equivalents', async () => {
    const { resolver, prisma } = service([
      {
        id: 'vo2-max',
        type: UserFitnessMetricType.VO2_MAX,
        value: 42,
        source: MetricSource.MANUAL,
        recordedAt: new Date('2026-08-20'),
      },
      {
        id: 'tp',
        type: UserFitnessMetricType.TP,
        value: 4,
        source: MetricSource.MANUAL,
        recordedAt: new Date('2026-08-21'),
      },
      {
        id: 'cs',
        type: UserFitnessMetricType.CS,
        value: 4.1,
        source: MetricSource.ESTIMATED,
        recordedAt: new Date('2026-08-22'),
      },
    ]);
    await expect(
      resolver.resolve('user-1', baseline, now),
    ).resolves.toMatchObject({
      state: 'AVAILABLE',
      vdot: 42,
      vo2Max: 42,
      thresholdPaceSecPerKm: 250,
      criticalSpeedMetersPerSecond: 4.1,
      source: 'VO2_MAX',
      metricRefs: expect.arrayContaining([
        expect.objectContaining({ id: 'vo2-max', type: 'VO2_MAX' }),
        expect.objectContaining({ id: 'tp', type: 'TP' }),
      ]),
    });
    expect(prisma.userFitnessMetric.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          OR: [
            {
              sport: 'RUN',
              type: { in: ['TP', 'CS'] },
            },
            {
              sport: 'UNKNOWN',
              type: 'VO2_MAX',
            },
          ],
        }),
      }),
    );
    expect(
      JSON.stringify(prisma.userFitnessMetric.findMany.mock.calls[0]?.[0]),
    ).not.toContain('VDOT');
  });

  it.each([
    {
      type: UserFitnessMetricType.TP,
      value: 4,
      source: 'TP' as const,
    },
    {
      type: UserFitnessMetricType.CS,
      value: 4.1,
      source: 'CS' as const,
    },
  ])(
    'uses a supported $type anchor without requiring a manual VO2 max',
    async ({ type, value, source }) => {
      const { resolver } = service([
        {
          id: type.toLowerCase(),
          type,
          value,
          source: MetricSource.AUTO,
          recordedAt: new Date('2026-08-22'),
        },
      ]);
      const capability = await resolver.resolve('user-1', baseline, now);
      const equivalentVdot = estimateVdotFromThresholdSpeed(value);

      expect(capability).toMatchObject({
        state: 'AVAILABLE',
        vdot: equivalentVdot,
        vo2Max: null,
        source,
        sourceId: type.toLowerCase(),
      });

      const evaluated = resolver.evaluate({
        template: getRunPlanTemplate('target-half-marathon')!,
        baseline,
        capability,
      });
      expect(evaluated.eligibility.status).toBe('ELIGIBLE');
      expect(evaluated.eligibility.missingInputs).not.toContain(
        'currentCapability',
      );
    },
  );

  it('does not accept a CS anchor below the pace model range', async () => {
    const { resolver } = service([
      {
        id: 'cs',
        type: UserFitnessMetricType.CS,
        value: 1.7,
        source: MetricSource.AUTO,
        recordedAt: new Date('2026-08-22'),
      },
    ]);

    await expect(
      resolver.resolve('user-1', baseline, now),
    ).resolves.toMatchObject({
      state: 'STALE',
      vdot: null,
      vo2Max: null,
      criticalSpeedMetersPerSecond: 1.7,
      source: null,
    });
  });

  it('falls back from an unusable VO2 max to a supported CS anchor', async () => {
    const { resolver } = service([
      {
        id: 'vo2-max',
        type: UserFitnessMetricType.VO2_MAX,
        value: 18,
        source: MetricSource.AUTO,
        recordedAt: new Date('2026-08-22'),
      },
      {
        id: 'cs',
        type: UserFitnessMetricType.CS,
        value: 4.1,
        source: MetricSource.AUTO,
        recordedAt: new Date('2026-08-22'),
      },
    ]);
    const capability = await resolver.resolve('user-1', baseline, now);

    expect(capability).toMatchObject({
      state: 'AVAILABLE',
      vdot: estimateVdotFromThresholdSpeed(4.1),
      vo2Max: 18,
      source: 'CS',
      sourceId: 'cs',
    });

    const evaluated = resolver.evaluate({
      template: getRunPlanTemplate('target-half-marathon')!,
      baseline,
      capability,
    });
    expect(evaluated.eligibility).toMatchObject({
      status: 'ELIGIBLE_WITH_WARNING',
      reasonCodes: ['VO2_MAX_BELOW_SUPPORTED_RANGE'],
      missingInputs: [],
    });
  });

  it('keeps fresh VO2_MAX primary when a training performance split differs by over 5%', async () => {
    const { resolver } = service([
      {
        id: 'vo2-max',
        type: UserFitnessMetricType.VO2_MAX,
        value: 55,
        source: MetricSource.MANUAL,
        recordedAt: new Date('2026-08-20'),
      },
    ]);
    const snapshot = await resolver.resolve(
      'user-1',
      {
        ...baseline,
        recentRaceEffort: {
          activityId: 'race',
          distanceMeters: 5_000,
          durationSeconds: 1_800,
          recordedAt: '2026-08-24T00:00:00.000Z',
        },
      },
      now,
    );
    expect(snapshot).toMatchObject({
      state: 'AVAILABLE',
      vdot: 55,
      vo2Max: 55,
      source: 'VO2_MAX',
    });
    expect(snapshot.conflicts).toContain(
      'VO2_MAX_RACE_ANCHORS_DIFFER_OVER_5_PERCENT',
    );
    expect(
      resolver.evaluate({
        template: getRunPlanTemplate('target-10k')!,
        baseline,
        capability: snapshot,
      }).eligibility,
    ).toMatchObject({
      status: 'ELIGIBLE',
      missingInputs: [],
    });
  });

  it('keeps a low VO2 max available for warnings even when a performance split conflicts', async () => {
    const { resolver } = service([
      {
        id: 'low-vo2-max',
        type: UserFitnessMetricType.VO2_MAX,
        value: 18,
        source: MetricSource.AUTO,
        recordedAt: new Date('2026-08-20'),
      },
    ]);
    const snapshot = await resolver.resolve(
      'user-1',
      {
        ...baseline,
        recentRaceEffort: {
          activityId: 'race',
          distanceMeters: 5_000,
          durationSeconds: 1_800,
          recordedAt: '2026-08-24T00:00:00.000Z',
        },
      },
      now,
    );

    expect(snapshot).toMatchObject({
      state: 'AVAILABLE',
      vdot: expect.any(Number),
      vo2Max: 18,
      source: 'RECENT_RACE',
    });
    expect(
      resolver.evaluate({
        template: getRunPlanTemplate('finish-half-marathon')!,
        baseline,
        capability: snapshot,
      }).eligibility,
    ).toMatchObject({
      status: 'ELIGIBLE_WITH_WARNING',
      reasonCodes: ['VO2_MAX_BELOW_SUPPORTED_RANGE'],
    });
  });

  it('uses fresh VO2 max as the plan capability', async () => {
    const { resolver, prisma } = service([
      {
        id: 'vo2-max',
        type: UserFitnessMetricType.VO2_MAX,
        value: 51.5,
        source: MetricSource.AUTO,
        recordedAt: new Date('2026-08-22'),
      },
    ]);

    await expect(
      resolver.resolve('user-1', baseline, now),
    ).resolves.toMatchObject({
      state: 'AVAILABLE',
      vdot: 51.5,
      vo2Max: 51.5,
      source: 'VO2_MAX',
      metricRefs: [expect.objectContaining({ id: 'vo2-max', type: 'VO2_MAX' })],
    });
    expect(prisma.userFitnessMetric.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              sport: 'UNKNOWN',
              type: UserFitnessMetricType.VO2_MAX,
            }),
          ]),
        }),
      }),
    );
  });

  it('exposes a below-range VO2 max without using it as a pace anchor', async () => {
    const { resolver } = service([
      {
        id: 'low-vo2-max',
        type: UserFitnessMetricType.VO2_MAX,
        value: 18,
        source: MetricSource.AUTO,
        recordedAt: new Date('2026-08-22'),
      },
    ]);

    await expect(
      resolver.resolve('user-1', baseline, now),
    ).resolves.toMatchObject({
      state: 'STALE',
      vdot: null,
      vo2Max: 18,
      metricRefs: [
        expect.objectContaining({
          id: 'low-vo2-max',
          type: 'VO2_MAX',
          value: 18,
        }),
      ],
    });
  });

  it('allows a Target plan without a linked race when current capability is available', () => {
    const { resolver } = service();
    const template = getRunPlanTemplate('target-half-marathon')!;
    const evaluated = resolver.evaluate({
      template,
      baseline,
      capability: {
        state: 'AVAILABLE',
        resolvedAt: now.toISOString(),
        vdot: 48,
        vo2Max: 48,
        source: 'VO2_MAX',
      },
      startDate: '2026-09-07',
    });

    expect(evaluated.targetRace).toBeNull();
    expect(evaluated.eligibility.missingInputs).not.toContain(
      'targetRaceEventId',
    );
    expect(evaluated.eligibility.status).toBe('ELIGIBLE');
  });

  it.each([
    {
      slug: 'finish-half-marathon' as const,
      actual: 9_000,
      required: 10_000,
      code: 'HALF_MARATHON_BASELINE_REQUIRED',
    },
    {
      slug: 'finish-marathon' as const,
      actual: 19_000,
      required: 20_000,
      code: 'MARATHON_LONG_RUN_REQUIRED',
    },
  ])(
    'returns a non-blocking coach reminder for $slug below the longest-run threshold',
    ({ slug, actual, required, code }) => {
      const { resolver } = service();
      const evaluated = resolver.evaluate({
        template: getRunPlanTemplate(slug)!,
        baseline: { ...baseline, longestRunDistanceMeters: actual },
        capability: {
          state: 'AVAILABLE',
          resolvedAt: now.toISOString(),
          vdot: 45,
          vo2Max: 45,
          source: 'VO2_MAX',
        },
      });

      expect(evaluated.eligibility).toMatchObject({
        status: 'ELIGIBLE_WITH_WARNING',
        reasonCodes: [code],
        reasonDetails: [{ code, actual, required, unit: 'meters' }],
      });
    },
  );

  it.each([
    { slug: 'finish-half-marathon' as const, distance: 10_000 },
    { slug: 'finish-marathon' as const, distance: 20_000 },
  ])('does not warn at the exact $slug threshold', ({ slug, distance }) => {
    const { resolver } = service();
    const evaluated = resolver.evaluate({
      template: getRunPlanTemplate(slug)!,
      baseline: { ...baseline, longestRunDistanceMeters: distance },
      capability: {
        state: 'AVAILABLE',
        resolvedAt: now.toISOString(),
        vdot: 45,
        vo2Max: 45,
        source: 'VO2_MAX',
      },
    });

    expect(evaluated.eligibility.status).toBe('ELIGIBLE');
    expect(evaluated.eligibility.reasonCodes).toEqual([]);
  });

  it.each([20, 24, 24.9])(
    'returns a non-blocking long-distance warning for VO2 max %s near the model floor',
    (vo2Max) => {
      const { resolver } = service();
      const evaluated = resolver.evaluate({
        template: getRunPlanTemplate('finish-half-marathon')!,
        baseline,
        capability: {
          state: 'AVAILABLE',
          resolvedAt: now.toISOString(),
          vdot: vo2Max,
          vo2Max,
          source: 'VO2_MAX',
        },
      });

      expect(evaluated.eligibility).toMatchObject({
        status: 'ELIGIBLE_WITH_WARNING',
        reasonCodes: ['VO2_MAX_LOW_FOR_LONG_DISTANCE'],
        reasonDetails: [
          {
            code: 'VO2_MAX_LOW_FOR_LONG_DISTANCE',
            actual: vo2Max,
            required: 25,
            unit: 'ml_kg_min',
          },
        ],
      });
    },
  );

  it('does not add a VO2 max warning at the exact long-distance caution boundary', () => {
    const { resolver } = service();
    const evaluated = resolver.evaluate({
      template: getRunPlanTemplate('finish-half-marathon')!,
      baseline,
      capability: {
        state: 'AVAILABLE',
        resolvedAt: now.toISOString(),
        vdot: 25,
        vo2Max: 25,
        source: 'VO2_MAX',
      },
    });

    expect(evaluated.eligibility.status).toBe('ELIGIBLE');
    expect(evaluated.eligibility.reasonCodes).toEqual([]);
  });

  it('rejects Target pace generation but preserves RPE fallback below the VO2 max model range', () => {
    const { resolver } = service();
    const capability = {
      state: 'STALE' as const,
      resolvedAt: now.toISOString(),
      vdot: null,
      vo2Max: 18,
      source: 'VO2_MAX' as const,
    };
    const finish = resolver.evaluate({
      template: getRunPlanTemplate('finish-half-marathon')!,
      baseline,
      capability,
    });
    const target = resolver.evaluate({
      template: getRunPlanTemplate('target-half-marathon')!,
      baseline,
      capability,
    });

    expect(finish.eligibility).toMatchObject({
      status: 'ELIGIBLE_WITH_WARNING',
      reasonCodes: ['VO2_MAX_BELOW_SUPPORTED_RANGE'],
    });
    expect(target.eligibility).toMatchObject({
      status: 'INPUT_REQUIRED',
      reasonCodes: ['VO2_MAX_BELOW_SUPPORTED_RANGE'],
      missingInputs: ['currentCapability'],
    });
  });

  it('enforces the exact 5% and 3% Target support boundaries', () => {
    const { resolver } = service();
    for (const [slug, fraction] of [
      ['target-10k', 0.05],
      ['target-marathon', 0.03],
    ] as const) {
      const template = getRunPlanTemplate(slug)!;
      const distance = template.goal === 'MARATHON' ? 42_195 : 10_000;
      const current = predictTimeForVdot(distance, 45)!;
      const accepted = resolver.evaluate({
        template,
        baseline,
        capability: {
          state: 'AVAILABLE',
          resolvedAt: now.toISOString(),
          vdot: 45,
          source: 'VO2_MAX',
        },
        targetRace: {
          eventId: 'race',
          distanceMeters: distance,
          targetTimeSeconds: current * (1 - fraction),
          raceDate: '2027-01-31',
          qualified: false,
        },
      });
      expect(accepted.eligibility.reasonCodes).not.toContain(
        'GOAL_NOT_SUPPORTED',
      );
      expect(accepted.targetRace?.qualified).toBe(true);
      const rejected = resolver.evaluate({
        template,
        baseline,
        capability: {
          state: 'AVAILABLE',
          resolvedAt: now.toISOString(),
          vdot: 45,
          source: 'VO2_MAX',
        },
        targetRace: {
          eventId: 'race',
          distanceMeters: distance,
          targetTimeSeconds: current * (1 - fraction - 0.001),
          raceDate: '2027-01-31',
          qualified: false,
        },
      });
      expect(rejected.eligibility).toMatchObject({ status: 'NOT_ELIGIBLE' });
      expect(rejected.eligibility.reasonCodes).toContain('GOAL_NOT_SUPPORTED');
    }
  });
});
