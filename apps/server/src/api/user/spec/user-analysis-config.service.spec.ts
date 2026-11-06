import { describe, expect, it, jest } from '@jest/globals';
import {
  AltitudeOptimizationModel,
  DefaultVdotSource,
  HeartRateZoneModel,
  PaceZoneModel,
  PowerZoneModel,
  UserFitnessMetricType,
} from '@prisma/client';
import {
  UserAnalysisConfigService,
  autoUpdateEnabledAt,
} from '../user-analysis-config.service';

describe('UserAnalysisConfigService', () => {
  it('resolves the version effective at activity time, not the current profile', async () => {
    const historical = {
      id: 'config-v1',
      userId: 'user-1',
      version: 1,
      effectiveAt: new Date('1970-01-01T00:00:00.000Z'),
      source: 'MIGRATION_BASELINE',
      fingerprint: 'v1',
      loadSources: 'HEART_RATE,PACE',
      altitudeOptimizationModel: AltitudeOptimizationModel.THRESHOLDMETHOD,
      altitudeThreshold: 1_500,
      defaultVdotSource: DefaultVdotSource.FACTOR,
      vo2maxCorrectionFactor: 1,
      heartRateZoneModel: HeartRateZoneModel.MHR,
      paceZoneModel: PaceZoneModel.DANIELS,
      powerZoneModel: PowerZoneModel.FRIEL,
      createdAt: new Date(),
    };
    const currentProfile = {
      loadSources: 'POWER',
      defaultVdotSource: DefaultVdotSource.STANDARD,
    };
    const prisma = {
      userAnalysisConfigVersion: {
        findFirst: jest.fn(async () => historical),
      },
      userProfile: {
        findUnique: jest.fn(async () => currentProfile),
      },
    };
    const service = new UserAnalysisConfigService(prisma as never, {} as never);

    const resolved = await service.resolveAt(
      'user-1',
      new Date('2020-01-01T00:00:00.000Z'),
    );

    expect(resolved.loadSources).toEqual(['HEART_RATE', 'PACE']);
    expect(resolved.defaultVdotSource).toBe(DefaultVdotSource.FACTOR);
    expect(prisma.userProfile.findUnique).not.toHaveBeenCalled();
  });

  it('uses immutable product defaults when no historical version exists', async () => {
    const prisma = {
      userAnalysisConfigVersion: {
        findFirst: jest.fn(async () => null),
      },
      userProfile: {
        findUnique: jest.fn(async () => ({ loadSources: 'PACE' })),
      },
    };
    const service = new UserAnalysisConfigService(prisma as never, {} as never);

    const resolved = await service.resolveAt(
      'new-user',
      new Date('2020-01-01T00:00:00.000Z'),
    );

    expect(resolved.loadSources).toEqual([
      'POWER',
      'HEART_RATE',
      'PACE',
      'SESSIONRPE',
    ]);
    expect(prisma.userProfile.findUnique).not.toHaveBeenCalled();
  });

  it('resolves auto-update permission at the observation instant', () => {
    const versions = [
      {
        metric: UserFitnessMetricType.FTP,
        enabled: false,
        effectiveAt: new Date('2026-01-02T00:00:00.000Z'),
        version: 1,
      },
      {
        metric: UserFitnessMetricType.FTP,
        enabled: true,
        effectiveAt: new Date('2026-01-03T00:00:00.000Z'),
        version: 2,
      },
    ];

    expect(
      autoUpdateEnabledAt(
        versions as never,
        UserFitnessMetricType.FTP,
        new Date('2026-01-02T12:00:00.000Z'),
      ),
    ).toBe(false);
    expect(
      autoUpdateEnabledAt(
        versions as never,
        UserFitnessMetricType.FTP,
        new Date('2026-01-03T12:00:00.000Z'),
      ),
    ).toBe(true);
  });
});
