import { describe, expect, it } from '@jest/globals';
import { WeatherImpactDeriver } from '../weather-impact.deriver';
import type { RawWeatherWindow, TodayWeatherLocation } from '../weather.types';

const location: TodayWeatherLocation = {
  latitude: 31.23,
  longitude: 121.474,
  accuracyMeters: 300,
  capturedAt: '2026-08-15T06:00:00.000Z',
};

function windowWith(
  overrides: Partial<RawWeatherWindow['hours'][number]>,
): RawWeatherWindow {
  return {
    current: null,
    expiresAt: '2026-08-15T06:30:00.000Z',
    hours: [
      {
        forecastStart: '2026-08-15T06:00:00.000Z',
        conditionCode: 'Clear',
        precipitationChance: 0.1,
        precipitationType: 'clear',
        temperatureC: 21,
        temperatureApparentC: 22,
        dewPointC: 12,
        humidityRatio: 0.5,
        cloudCoverRatio: 0.1,
        pressureHpa: 1013,
        uvIndex: 2,
        daylight: true,
        windSpeedKph: 10,
        windGustKph: 15,
        windDirectionDeg: 180,
        ...overrides,
      },
    ],
  };
}

describe('WeatherImpactDeriver', () => {
  const deriver = new WeatherImpactDeriver();
  const now = new Date('2026-08-15T06:05:00.000Z');

  it('derives heat, rain, wind, and UV into categorical values only', () => {
    const impact = deriver.derive({
      window: windowWith({
        conditionCode: 'Thunderstorms',
        precipitationChance: 0.7,
        temperatureApparentC: 33,
        uvIndex: 7,
        windGustKph: 48,
      }),
      location,
      now,
      expectedHourCount: 1,
    });

    expect(impact).toMatchObject({
      status: 'available',
      conditionFamily: 'STORM',
      thermalDirection: 'HEAT',
      thermalImpact: 'HIGH',
      precipitationRisk: 'HIGH',
      windImpact: 'HIGH',
      uvRisk: 'HIGH',
      overallImpact: 'HIGH',
      confidence: 'HIGH',
    });
    expect(JSON.stringify(impact)).not.toMatch(
      /temperature|humidity|windSpeed|latitude|longitude|precipitationChance/i,
    );
  });

  it.each([
    [-11, 'COLD', 'EXTREME'],
    [-1, 'COLD', 'HIGH'],
    [2, 'COLD', 'MODERATE'],
    [20, 'NEUTRAL', 'LOW'],
    [29, 'HEAT', 'MODERATE'],
    [34, 'HEAT', 'HIGH'],
    [39, 'HEAT', 'EXTREME'],
  ])('classifies apparent temperature %s', (value, direction, level) => {
    const impact = deriver.derive({
      window: windowWith({ temperatureApparentC: value }),
      location,
      now,
      expectedHourCount: 1,
    });
    expect(impact).toMatchObject({
      status: 'available',
      thermalDirection: direction,
      thermalImpact: level,
    });
  });

  it('returns unavailable when no usable samples exist', () => {
    expect(
      deriver.derive({
        window: { current: null, hours: [], expiresAt: null },
        location,
        now,
        expectedHourCount: 1,
      }),
    ).toEqual({ status: 'unavailable' });
  });
});
