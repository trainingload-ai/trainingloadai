import { describe, expect, it, jest } from '@jest/globals';
import { SportType, UserFitnessMetricType } from '@prisma/client';
import { FitnessTimelineProjector } from '@/algorithm/fitness-timeline';
import { ActivityDependencyFingerprintService } from '../activity-dependency-fingerprint.service';
import { ActivityFitnessContextResolverService } from '../activity-fitness-context-resolver.service';

describe('ActivityFitnessContextResolverService', () => {
  it('bootstraps the current activity from its own eFTP/eCP without publishing future evidence', async () => {
    const prisma = {
      activityPeakMetric: { findFirst: jest.fn(async () => null) },
      activitySource: {
        findMany: jest.fn(async () => [
          { metadata: { datasetQuality: { powerCoverage: 1 } } },
        ]),
      },
      userBodyMetric: { findMany: jest.fn(async () => []) },
      userZoneSettingVersion: { findMany: jest.fn(async () => []) },
    };
    const users = {
      getComposedUserProfile: jest.fn(async () => ({
        loadSources: 'PACE',
        defaultVdotSource: 'STANDARD',
        vo2maxCorrectionFactor: 0.5,
        paceZoneModel: 'CUSTOM',
      })),
      listBodyMetricEvidenceAt: jest.fn(async () => []),
    };
    const service = new ActivityFitnessContextResolverService(
      prisma as never,
      users as never,
      new ActivityDependencyFingerprintService(),
      {
        resolveAt: jest.fn(async () => ({
          versionId: 'config-1',
          version: 1,
          effectiveAt: new Date('1970-01-01T00:00:00.000Z'),
          fingerprint: 'analysis-config-1',
          loadSources: ['POWER', 'HEART_RATE', 'PACE', 'SESSIONRPE'],
          altitudeOptimizationModel: 'THRESHOLDMETHOD',
          altitudeThreshold: null,
          defaultVdotSource: 'FACTOR',
          vo2maxCorrectionFactor: 1,
          heartRateZoneModel: 'MHR',
          paceZoneModel: 'DANIELS',
          powerZoneModel: 'FRIEL',
        })),
      } as never,
      {
        resolve: jest.fn(async () => ({
          overall: 'input-overall-1',
          dimensions: {
            HEART_RATE: 'input-heart-rate-1',
            POWER: 'input-power-1',
            PACE: 'input-pace-1',
            PROFILE: 'input-profile-1',
            LOAD: 'input-load-1',
          },
        })),
      } as never,
    );
    const startTime = new Date('2026-09-17T06:00:00.000Z');
    const resolved = await service.resolve({
      activity: {
        id: 1793804097,
        userId: 'user-1',
        sportType: SportType.CYCLING,
        startTime,
        endTime: new Date('2026-09-17T07:00:00.000Z'),
        timerTime: 3600,
        elapsedTime: 3600,
        eftp: 251,
        ecp: 264,
        ewPrime: 18_500,
        epmax: 910,
      },
      projector: new FitnessTimelineProjector(),
    });

    expect(resolved.metrics[UserFitnessMetricType.FTP]).toMatchObject({
      value: 251,
      source: 'ACTIVITY_BOOTSTRAP',
      sourceMetricId: 'activity:1793804097',
    });
    expect(resolved.metrics[UserFitnessMetricType.CP]).toMatchObject({
      value: 264,
      value2: 18_500,
      source: 'ACTIVITY_BOOTSTRAP',
    });
    expect(resolved.metrics[UserFitnessMetricType.RESTING_HR]).toMatchObject({
      value: 60,
      source: 'DEFAULT',
    });
    expect(resolved.profile).toMatchObject({
      loadSources: 'POWER,HEART_RATE,PACE,SESSIONRPE',
      defaultVdotSource: 'FACTOR',
      vo2maxCorrectionFactor: 1,
      paceZoneModel: 'DANIELS',
    });
    expect(resolved.calculationFingerprint).toHaveLength(64);
    expect(
      resolved.zones.find((zone) => zone.zoneType === 'POWER'),
    ).toMatchObject({
      versionId: null,
      setting: {
        configurationSource: 'generated',
        benchmark: 'FTP',
        model: 'FRIEL',
      },
    });
    expect(
      resolved.zones.find((zone) => zone.zoneType === 'POWER')?.setting.zones,
    ).toHaveLength(7);
  });

  it.each([
    ['unknown', []],
    ['insufficient', [{ metadata: { datasetQuality: { powerCoverage: 0 } } }]],
  ] as const)(
    'does not bootstrap CP from an activity whose measured power is %s',
    async (_label, sources) => {
      const prisma = {
        activityPeakMetric: { findFirst: jest.fn(async () => null) },
        activitySource: { findMany: jest.fn(async () => sources) },
        userBodyMetric: { findMany: jest.fn(async () => []) },
        userZoneSettingVersion: { findMany: jest.fn(async () => []) },
      };
      const service = new ActivityFitnessContextResolverService(
        prisma as never,
        {
          getComposedUserProfile: jest.fn(async () => ({})),
          listBodyMetricEvidenceAt: jest.fn(async () => []),
        } as never,
        new ActivityDependencyFingerprintService(),
        {
          resolveAt: jest.fn(async () => ({
            versionId: 'config-1',
            version: 1,
            effectiveAt: new Date('1970-01-01T00:00:00.000Z'),
            fingerprint: 'analysis-config-1',
            loadSources: ['HEART_RATE'],
            altitudeOptimizationModel: 'THRESHOLDMETHOD',
            altitudeThreshold: null,
            defaultVdotSource: 'FACTOR',
            vo2maxCorrectionFactor: 1,
            heartRateZoneModel: 'MHR',
            paceZoneModel: 'DANIELS',
            powerZoneModel: 'FRIEL',
          })),
        } as never,
        {
          resolve: jest.fn(async () => ({ overall: 'input', dimensions: {} })),
        } as never,
      );

      const resolved = await service.resolve({
        activity: {
          id: 42,
          userId: 'user-1',
          sportType: SportType.CYCLING,
          startTime: new Date('2026-09-17T06:00:00.000Z'),
          endTime: new Date('2026-09-17T07:00:00.000Z'),
          timerTime: 3600,
          elapsedTime: 3600,
          eftp: 251,
          ecp: 264,
          ewPrime: 18_500,
          epmax: 910,
        },
        projector: new FitnessTimelineProjector(),
      });

      expect(resolved.metrics[UserFitnessMetricType.CP]).toMatchObject({
        value: null,
        source: 'UNAVAILABLE',
      });
      expect(resolved.metrics[UserFitnessMetricType.FTP]).toMatchObject({
        value: null,
        source: 'UNAVAILABLE',
      });
      expect(resolved.metrics[UserFitnessMetricType.P_MAX]).toMatchObject({
        value: null,
        source: 'UNAVAILABLE',
      });
    },
  );
});
