import { describe, expect, it, jest } from '@jest/globals';
import { ActivityAnalyzeMode } from '../metrics/activity-analyze-mode';
import { ActivityMetricsPipelineService } from '../metrics/activity-metrics-pipeline.service';

function createHarness() {
  const prisma = {
    activitySource: { findMany: jest.fn(async () => []) },
    activity: { findUnique: jest.fn() },
  };
  const orchestrator = {
    run: jest.fn(),
    runStrict: jest.fn(async (context: unknown, _tasks: unknown[]) => context),
  };
  const task = (key: string) => ({ key });
  const tasks = {
    maxMeanPower: task('maxMeanPower'),
    maxMeanHeartRate: task('maxMeanHeartRate'),
    lthrObservation: task('lthrObservation'),
    peakPace: task('peakPace'),
    recordsBootstrap: task('recordsBootstrap'),
    calculatedPowerSummary: task('calculatedPowerSummary'),
    activityStatistics: task('activityStatistics'),
    estimatedPowerMetrics: task('estimatedPowerMetrics'),
    derivedMetrics: task('derivedMetrics'),
    trainingEffect: task('trainingEffect'),
    vo2Max: task('vo2Max'),
    bindFitnessMetrics: task('bindFitnessMetrics'),
    heartRateBase: task('heartRateBase'),
    heartRateZones: task('heartRateZones'),
    heartRateTrimp: task('heartRateTrimp'),
    powerBase: task('powerBase'),
    powerZones: task('powerZones'),
    powerCogganBike: task('powerCogganBike'),
    paceBase: task('paceBase'),
    paceZones: task('paceZones'),
    paceGovss: task('paceGovss'),
    swimScore: task('swimScore'),
    calories: task('calories'),
  };
  const service = new ActivityMetricsPipelineService(
    prisma as never,
    orchestrator as never,
    tasks.maxMeanPower as never,
    tasks.maxMeanHeartRate as never,
    tasks.lthrObservation as never,
    tasks.peakPace as never,
    tasks.recordsBootstrap as never,
    tasks.calculatedPowerSummary as never,
    tasks.activityStatistics as never,
    tasks.estimatedPowerMetrics as never,
    tasks.derivedMetrics as never,
    tasks.trainingEffect as never,
    tasks.vo2Max as never,
    tasks.bindFitnessMetrics as never,
    tasks.heartRateBase as never,
    tasks.heartRateZones as never,
    tasks.heartRateTrimp as never,
    tasks.powerBase as never,
    tasks.powerZones as never,
    tasks.powerCogganBike as never,
    tasks.paceBase as never,
    tasks.paceZones as never,
    tasks.paceGovss as never,
    tasks.swimScore as never,
    tasks.calories as never,
  );
  const activity = {
    id: 42,
    userId: 'user-1',
    sportType: 'RUN',
    startTime: new Date('2026-08-20T06:00:00Z'),
    timezone: 'Asia/Shanghai',
  };
  return { activity, orchestrator, prisma, service };
}

describe('ActivityMetricsPipelineService', () => {
  it.each([
    [
      ActivityAnalyzeMode.LIGHT,
      [
        'recordsBootstrap',
        'calculatedPowerSummary',
        'activityStatistics',
        'maxMeanPower',
        'maxMeanHeartRate',
        'lthrObservation',
        'peakPace',
        'estimatedPowerMetrics',
        'derivedMetrics',
        'vo2Max',
      ],
    ],
    [
      ActivityAnalyzeMode.HEAVY,
      [
        'recordsBootstrap',
        'calculatedPowerSummary',
        'activityStatistics',
        'bindFitnessMetrics',
        'heartRateBase',
        'heartRateZones',
        'heartRateTrimp',
        'paceBase',
        'paceZones',
        'paceGovss',
        'swimScore',
        'powerBase',
        'powerZones',
        'powerCogganBike',
        'trainingEffect',
        'calories',
      ],
    ],
  ])('preserves the %s task order', async (mode, expectedKeys) => {
    const { activity, orchestrator, service } = createHarness();

    await service.runByMode({ activity: activity as never, mode });

    const selected = orchestrator.runStrict.mock.calls[0]?.[1] as Array<{
      key: string;
    }>;
    expect(selected.map(({ key }) => key)).toEqual(expectedKeys);
  });

  it('provides the measured-power context through the narrow pipeline API', async () => {
    const { activity, orchestrator, prisma, service } = createHarness();

    await service.runByMode({
      activity: activity as never,
      userId: 'user-1',
      mode: ActivityAnalyzeMode.FULL,
    });

    expect(prisma.activitySource.findMany).toHaveBeenCalledWith({
      where: { activityId: 42, isActive: true, isPrimary: true },
      select: { metadata: true },
    });
    expect(orchestrator.runStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: expect.objectContaining({
          activity,
          userId: 'user-1',
          measuredPowerEvidence: 'UNKNOWN',
        }),
      }),
      expect.any(Array),
    );
  });
});
