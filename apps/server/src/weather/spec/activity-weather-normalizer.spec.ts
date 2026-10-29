import { describe, expect, it } from '@jest/globals';
import {
  calculateHeatIndexC,
  calculateWindChillC,
  mapWeatherCondition,
  normalizeActivityWeatherSample,
  normalizeWindDirection,
} from '../activity-weather-normalizer';

describe('activity weather normalizer', () => {
  it('normalizes scalar values and derives thermal indices', () => {
    const result = normalizeActivityWeatherSample({
      forecastStart: '2026-08-27T02:00:00.000Z',
      conditionCode: 'HeavyRain',
      precipitationChance: 0.8,
      precipitationType: 'rain',
      temperatureC: 32.04,
      temperatureApparentC: 38.16,
      dewPointC: 24.66,
      humidityRatio: 0.72,
      cloudCoverRatio: 0.86,
      pressureHpa: 1008.36,
      uvIndex: 5,
      daylight: true,
      windSpeedKph: 11.26,
      windGustKph: 19.94,
      windDirectionDeg: 361.2,
    });

    expect(result).toMatchObject({
      conditionCode: 'HEAVY_RAIN',
      temperatureC: 32,
      apparentTemperatureC: 38.2,
      dewPointC: 24.7,
      humidityPct: 72,
      cloudCoverPct: 86,
      pressureHpa: 1008.4,
      windSpeedKph: 11.3,
      windGustKph: 19.9,
      windDirectionDeg: 1,
    });
    expect(result?.heatIndexC).not.toBeNull();
    expect(result?.windChillC).toBeNull();
  });

  it('handles condition, wind chill and applicability boundaries', () => {
    expect(mapWeatherCondition('ScatteredThunderstorms')).toBe('THUNDERSTORM');
    expect(normalizeWindDirection(-1)).toBe(359);
    expect(calculateWindChillC(5, 20)).toBeCloseTo(1.1, 1);
    expect(calculateWindChillC(11, 20)).toBeNull();
    expect(calculateHeatIndexC(25, 80)).toBeNull();
  });
});
