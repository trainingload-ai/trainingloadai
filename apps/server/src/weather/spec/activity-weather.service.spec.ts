import { describe, expect, it, jest } from '@jest/globals';
import {
  ActivityWeatherStatus,
  ActivityWeatherUnavailableReason,
} from '@prisma/client';
import { ActivityWeatherService } from '../activity-weather.service';

function createService(options?: {
  enabled?: boolean;
  capabilityEnabled?: boolean;
  activity?: Record<string, unknown> | null;
  midpoint?: Record<string, unknown>;
}) {
  const activityWeatherSnapshot = {
    upsert: jest.fn(async (_args: unknown) => ({ id: 'weather-1' })),
    findFirst: jest.fn(async (_args: unknown): Promise<unknown> => null),
    updateMany: jest.fn(async (_args: unknown) => ({ count: 1 })),
  };
  const prisma = {
    activity: {
      findFirst: jest.fn(async () =>
        options?.activity === undefined
          ? {
              id: 42,
              sportDefinitionCode: 'ROAD_RUNNING',
              timezone: 'Asia/Shanghai',
            }
          : options.activity,
      ),
    },
    activityWeatherSnapshot,
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'activityWeather'
        ? {
            enabled: options?.enabled ?? true,
            maxAttempts: 3,
          }
        : undefined,
    ),
  };
  const sensorData = {
    getActivityMidpointTrackRecord: jest.fn(async () =>
      options?.midpoint === undefined
        ? {
            status: 'available',
            recordedAt: new Date('2026-08-15T06:30:00.000Z'),
            latitude: 31.23049,
            longitude: 121.47351,
            trackStartAt: new Date('2026-08-15T06:00:00.000Z'),
            trackEndAt: new Date('2026-08-15T07:00:00.000Z'),
            deltaMs: 0,
          }
        : options.midpoint,
    ),
  };
  const provider = {
    isConfigured: jest.fn(() => true),
    getHourAt: jest.fn(async () => ({
      sample: {
        forecastStart: '2026-08-15T07:00:00.000Z',
        conditionCode: 'PartlyCloudy',
        precipitationChance: 0.1,
        precipitationType: null,
        temperatureC: 23.24,
        temperatureApparentC: 24.15,
        dewPointC: 18.26,
        humidityRatio: 0.72,
        cloudCoverRatio: 0.46,
        pressureHpa: 1008.44,
        uvIndex: 1,
        daylight: true,
        windSpeedKph: 12.24,
        windGustKph: 18.16,
        windDirectionDeg: 134.7,
      },
      attribution: {
        serviceName: 'Apple Weather',
        modified: true as const,
        legalPageUrl: 'https://weatherkit.apple.com/legal-attribution.html',
      },
    })),
    getRemainingDayWeather: jest.fn(),
    getAttribution: jest.fn(),
  };
  return {
    service: new ActivityWeatherService(
      prisma as never,
      config as never,
      sensorData as never,
      provider as never,
      {
        isEnabled: jest.fn(() => options?.capabilityEnabled ?? true),
      } as never,
    ),
    prisma,
    activityWeatherSnapshot,
    sensorData,
    provider,
  };
}

const job = {
  id: 'weather-1',
  activityId: 42,
  userId: 'user-1',
  attemptCount: 1,
  lockToken: 'lease-1',
};

describe('ActivityWeatherService', () => {
  it('does not schedule when the feature flag is off', async () => {
    const { service, activityWeatherSnapshot } = createService({
      enabled: false,
    });
    await expect(
      service.schedule({ activityId: 42, userId: 'user-1' }),
    ).resolves.toBe(false);
    expect(activityWeatherSnapshot.upsert).not.toHaveBeenCalled();
  });

  it('does not schedule when the runtime capability is disabled', async () => {
    const { service, activityWeatherSnapshot } = createService({
      enabled: true,
      capabilityEnabled: false,
    });
    await expect(
      service.schedule({ activityId: 42, userId: 'user-1' }),
    ).resolves.toBe(false);
    expect(activityWeatherSnapshot.upsert).not.toHaveBeenCalled();
  });

  it('schedules idempotently and resets only when explicitly forced', async () => {
    const { service, activityWeatherSnapshot } = createService();
    await service.schedule({ activityId: 42, userId: 'user-1' });
    await service.schedule({
      activityId: 42,
      userId: 'user-1',
      force: true,
    });

    expect(activityWeatherSnapshot.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ update: {} }),
    );
    expect(activityWeatherSnapshot.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        update: expect.objectContaining({
          status: ActivityWeatherStatus.PENDING,
          attemptCount: 0,
          inputFingerprint: null,
        }),
      }),
    );
  });

  it('persists one normalized midpoint sample guarded by lock and fingerprint', async () => {
    const { service, activityWeatherSnapshot, provider } = createService();
    await service.processClaimed(job);

    expect(provider.getHourAt).toHaveBeenCalledTimes(1);
    expect(provider.getHourAt).toHaveBeenCalledWith({
      latitude: 31.23,
      longitude: 121.474,
      timezone: 'Asia/Shanghai',
      at: new Date('2026-08-15T06:30:00.000Z'),
    });
    const fingerprintWrite = activityWeatherSnapshot.updateMany.mock
      .calls[0]![0] as {
      data: { inputFingerprint: string };
    };
    expect(fingerprintWrite).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({ lockToken: 'lease-1' }),
        data: expect.objectContaining({
          sampleLatitudeE3: 31230,
          sampleLongitudeE3: 121474,
          inputFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
    expect(activityWeatherSnapshot.updateMany.mock.calls[1]![0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          lockToken: 'lease-1',
          inputFingerprint: fingerprintWrite.data.inputFingerprint,
        }),
        data: expect.objectContaining({
          status: ActivityWeatherStatus.AVAILABLE,
          conditionCode: 'PARTLY_CLOUDY',
          temperatureC: 23.2,
          humidityPct: 72,
          windDirectionDeg: 135,
          lockToken: null,
        }),
      }),
    );
  });

  it('marks explicit indoor sports not applicable without reading GPS or weather', async () => {
    const { service, activityWeatherSnapshot, sensorData, provider } =
      createService({
        activity: {
          id: 42,
          sportDefinitionCode: 'INDOOR_CYCLING',
          timezone: 'Asia/Shanghai',
        },
      });
    await service.processClaimed(job);

    expect(sensorData.getActivityMidpointTrackRecord).not.toHaveBeenCalled();
    expect(provider.getHourAt).not.toHaveBeenCalled();
    expect(activityWeatherSnapshot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ActivityWeatherStatus.NOT_APPLICABLE,
          unavailableReason: ActivityWeatherUnavailableReason.INDOOR_ACTIVITY,
          inputFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
  });

  it('backs off transient errors and terminates the third failed attempt', async () => {
    const first = createService();
    const before = Date.now();
    await first.service.handleFailure(job, new Error('weatherkit_http_429'));
    const retry = first.activityWeatherSnapshot.updateMany.mock
      .calls[0]![0] as {
      data: { status: ActivityWeatherStatus; availableAt: Date };
    };
    expect(retry.data.status).toBe(ActivityWeatherStatus.PENDING);
    expect(retry.data.availableAt.getTime()).toBeGreaterThanOrEqual(
      before + 5 * 60_000,
    );

    const final = createService();
    await final.service.handleFailure(
      { ...job, attemptCount: 3 },
      new Error('weatherkit_http_503'),
    );
    expect(final.activityWeatherSnapshot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ActivityWeatherStatus.UNAVAILABLE,
          unavailableReason: ActivityWeatherUnavailableReason.RETRY_EXHAUSTED,
        }),
      }),
    );
  });

  it('persists an unsupported historical window as deterministic unavailable', async () => {
    const { service, activityWeatherSnapshot } = createService();
    await service.handleFailure(job, new Error('weatherkit_http_400'));
    expect(activityWeatherSnapshot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ActivityWeatherStatus.UNAVAILABLE,
          unavailableReason:
            ActivityWeatherUnavailableReason.PROVIDER_HISTORY_UNAVAILABLE,
          lockToken: null,
        }),
      }),
    );
  });

  it('serializes public states without coordinates, errors or provider raw codes', async () => {
    const { service, activityWeatherSnapshot } = createService();
    activityWeatherSnapshot.findFirst
      .mockResolvedValueOnce({ status: ActivityWeatherStatus.PROCESSING })
      .mockResolvedValueOnce({ status: ActivityWeatherStatus.UNAVAILABLE })
      .mockResolvedValueOnce({
        status: ActivityWeatherStatus.AVAILABLE,
        queryRecordedAt: new Date('2026-08-15T06:30:00.000Z'),
        sampledAt: new Date('2026-08-15T07:00:00.000Z'),
        source: 'APPLE_WEATHERKIT',
        conditionCode: 'RAIN',
        temperatureC: 23.2,
        apparentTemperatureC: 24.1,
        dewPointC: 18.3,
        windChillC: null,
        heatIndexC: null,
        windSpeedKph: 12.2,
        windGustKph: 18.2,
        windDirectionDeg: 135,
        humidityPct: 72,
        cloudCoverPct: 46,
        pressureHpa: 1008.4,
        attributionServiceName: 'Apple Weather',
        attributionLegalUrl:
          'https://weatherkit.apple.com/legal-attribution.html',
        sampleLatitudeE3: 31230,
        sampleLongitudeE3: 121474,
        sourceConditionCode: 'Rain',
        lastErrorCode: 'INTERNAL_ONLY',
      });

    await expect(service.read(42, 'user-1')).resolves.toEqual({
      status: 'PENDING',
    });
    await expect(service.read(42, 'user-1')).resolves.toEqual({
      status: 'UNAVAILABLE',
    });
    const available = await service.read(42, 'user-1');
    expect(available).toEqual(
      expect.objectContaining({
        status: 'AVAILABLE',
        sampleBasis: 'MIDPOINT_TRACK_RECORD',
        temperatureC: 23.2,
        attribution: expect.objectContaining({
          serviceName: 'Apple Weather',
        }),
      }),
    );
    expect(JSON.stringify(available)).not.toMatch(
      /latitude|longitude|lastError|sourceCondition/i,
    );
    expect(activityWeatherSnapshot.findFirst).toHaveBeenCalledWith({
      where: { activityId: 42, userId: 'user-1' },
    });
  });
});
