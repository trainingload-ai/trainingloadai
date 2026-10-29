import { describe, expect, it, jest } from '@jest/globals';
import { WeatherContextService } from '../weather-context.service';
import { WeatherImpactDeriver } from '../weather-impact.deriver';
import type { WeatherProvider } from '../providers/weather-provider';
import type { TodayWeatherLocation } from '../weather.types';

const now = new Date('2026-08-15T06:05:00.000Z');
const location: TodayWeatherLocation = {
  latitude: 31.23049,
  longitude: 121.47351,
  accuracyMeters: 300,
  capturedAt: '2026-08-15T06:00:00.000Z',
};

function config(enabled = true) {
  return {
    get: jest.fn((key: string) => {
      if (key === 'weather.rawCacheMaxTtlSeconds') return 1_800;
      if (key === 'aiTodayWeather') {
        return { enabled, rolloutPercent: 100 };
      }
      return undefined;
    }),
  };
}

function provider(): WeatherProvider & { isConfigured(): boolean } {
  const getRemainingDayWeather =
    jest.fn<WeatherProvider['getRemainingDayWeather']>();
  getRemainingDayWeather.mockResolvedValue({
    current: null,
    expiresAt: '2026-08-15T06:30:00.000Z',
    attribution: null,
    hours: [
      {
        forecastStart: '2026-08-15T06:00:00.000Z',
        conditionCode: 'Rain',
        precipitationChance: 0.65,
        precipitationType: 'rain',
        temperatureC: 28,
        temperatureApparentC: 30,
        dewPointC: 22,
        humidityRatio: 0.7,
        cloudCoverRatio: 0.8,
        pressureHpa: 1008,
        uvIndex: 2,
        daylight: true,
        windSpeedKph: 10,
        windGustKph: 15,
        windDirectionDeg: 90,
      },
    ],
  });
  const getAttribution = jest.fn<WeatherProvider['getAttribution']>();
  getAttribution.mockResolvedValue({
    serviceName: 'Weather',
    modified: true,
    legalPageUrl: 'https://example.test/legal',
  });
  const getHourAt = jest.fn<WeatherProvider['getHourAt']>();
  getHourAt.mockResolvedValue({ sample: null, attribution: null });
  return {
    isConfigured: () => true,
    getRemainingDayWeather,
    getAttribution,
    getHourAt,
  };
}

describe('WeatherContextService', () => {
  it('exposes the same runtime capability used by weather requests', () => {
    const enabledProvider = provider();
    const enabledService = new WeatherContextService(
      config(true) as never,
      enabledProvider,
      new WeatherImpactDeriver(),
    );
    const disabledService = new WeatherContextService(
      config(false) as never,
      enabledProvider,
      new WeatherImpactDeriver(),
    );

    expect(enabledService.isTodayWeatherEnabledForUser('user-1')).toBe(true);
    expect(disabledService.isTodayWeatherEnabledForUser('user-1')).toBe(false);
  });

  it('does not call the provider when the feature is disabled', async () => {
    const weatherProvider = provider();
    const service = new WeatherContextService(
      config(false) as never,
      weatherProvider,
      new WeatherImpactDeriver(),
    );
    await expect(
      service.getTodayWeatherContext({
        userId: 'user-1',
        locale: 'zh',
        timezone: 'Asia/Shanghai',
        location,
        now,
      }),
    ).resolves.toEqual({
      impact: { status: 'unavailable' },
      attribution: null,
    });
    expect(weatherProvider.getRemainingDayWeather).not.toHaveBeenCalled();
  });

  it('does not call the provider when the runtime capability is disabled', async () => {
    const weatherProvider = provider();
    const service = new WeatherContextService(
      config(true) as never,
      weatherProvider,
      new WeatherImpactDeriver(),
      { isEnabled: jest.fn(() => false) } as never,
    );

    await expect(
      service.getTodayWeatherContext({
        userId: 'user-1',
        locale: 'zh',
        timezone: 'Asia/Shanghai',
        location,
        now,
      }),
    ).resolves.toEqual({
      impact: { status: 'unavailable' },
      attribution: null,
    });
    expect(weatherProvider.getRemainingDayWeather).not.toHaveBeenCalled();
  });

  it('rounds coordinates, caches the raw window, and only returns derived impact', async () => {
    const weatherProvider = provider();
    const service = new WeatherContextService(
      config(true) as never,
      weatherProvider,
      new WeatherImpactDeriver(),
    );
    const input = {
      userId: 'user-1',
      locale: 'zh',
      timezone: 'Asia/Shanghai',
      location,
      now,
    };
    const first = await service.getTodayWeatherContext(input);
    const second = await service.getTodayWeatherContext(input);

    expect(weatherProvider.getRemainingDayWeather).toHaveBeenCalledTimes(1);
    expect(weatherProvider.getRemainingDayWeather).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 31.23, longitude: 121.474 }),
    );
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      impact: { status: 'available', precipitationRisk: 'HIGH' },
      attribution: { serviceName: 'Weather', modified: true },
    });
    expect(JSON.stringify(first.impact)).not.toMatch(
      /31\.23|121\.474|temperatureApparent/,
    );
  });

  it('treats stale positions as unavailable without an upstream request', async () => {
    const weatherProvider = provider();
    const service = new WeatherContextService(
      config(true) as never,
      weatherProvider,
      new WeatherImpactDeriver(),
    );
    const result = await service.getTodayWeatherContext({
      userId: 'user-1',
      locale: 'zh',
      timezone: 'Asia/Shanghai',
      location: { ...location, capturedAt: '2026-08-15T05:00:00.000Z' },
      now,
    });
    expect(result.impact).toEqual({ status: 'unavailable' });
    expect(weatherProvider.getRemainingDayWeather).not.toHaveBeenCalled();
  });

  it('caps the forecast window at the user local midnight', async () => {
    const weatherProvider = provider();
    const service = new WeatherContextService(
      config(true) as never,
      weatherProvider,
      new WeatherImpactDeriver(),
    );
    const nearMidnight = new Date('2026-08-15T15:30:00.000Z');
    await service.getTodayWeatherContext({
      userId: 'user-1',
      locale: 'zh',
      timezone: 'Asia/Shanghai',
      location: { ...location, capturedAt: nearMidnight.toISOString() },
      now: nearMidnight,
    });
    expect(weatherProvider.getRemainingDayWeather).toHaveBeenCalledWith(
      expect.objectContaining({ end: new Date('2026-08-15T16:00:00.000Z') }),
    );
  });

  it('uses the legal attribution URL from weather metadata without another upstream request', async () => {
    const weatherProvider = provider();
    jest.mocked(weatherProvider.getRemainingDayWeather).mockResolvedValueOnce({
      current: null,
      expiresAt: '2026-08-15T06:30:00.000Z',
      attribution: {
        serviceName: 'Apple Weather',
        modified: true,
        legalPageUrl: 'https://weatherkit.apple.com/legal-attribution.html',
      },
      hours: [
        {
          forecastStart: '2026-08-15T06:00:00.000Z',
          conditionCode: 'Rain',
          precipitationChance: 0.65,
          precipitationType: 'rain',
          temperatureC: 28,
          temperatureApparentC: 30,
          dewPointC: 22,
          humidityRatio: 0.7,
          cloudCoverRatio: 0.8,
          pressureHpa: 1008,
          uvIndex: 2,
          daylight: true,
          windSpeedKph: 10,
          windGustKph: 15,
          windDirectionDeg: 90,
        },
      ],
    });
    const service = new WeatherContextService(
      config(true) as never,
      weatherProvider,
      new WeatherImpactDeriver(),
    );
    const result = await service.getTodayWeatherContext({
      userId: 'user-1',
      locale: 'zh',
      timezone: 'Asia/Shanghai',
      location,
      now,
    });

    expect(result.attribution).toMatchObject({
      serviceName: 'Apple Weather',
      legalPageUrl: 'https://weatherkit.apple.com/legal-attribution.html',
    });
    expect(weatherProvider.getAttribution).not.toHaveBeenCalled();
  });
});
