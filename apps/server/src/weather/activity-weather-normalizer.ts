import type { ActivityWeatherConditionCode } from '@shared/activity-weather';
import type { RawWeatherSample } from './weather.types';

export const ACTIVITY_WEATHER_NORMALIZATION_VERSION = 1;

export type NormalizedActivityWeather = {
  sampledAt: Date;
  conditionCode: ActivityWeatherConditionCode;
  sourceConditionCode: string | null;
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  dewPointC: number | null;
  windChillC: number | null;
  heatIndexC: number | null;
  windSpeedKph: number | null;
  windGustKph: number | null;
  windDirectionDeg: number | null;
  humidityPct: number | null;
  cloudCoverPct: number | null;
  pressureHpa: number | null;
};

function finite(value: number | null): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

function round1(value: number | null): number | null {
  const numeric = finite(value);
  return numeric == null ? null : Math.round(numeric * 10) / 10;
}

function percent(value: number | null): number | null {
  const numeric = finite(value);
  if (numeric == null) return null;
  const asPercent = numeric <= 1 ? numeric * 100 : numeric;
  return Math.max(0, Math.min(100, Math.round(asPercent)));
}

export function normalizeWindDirection(value: number | null): number | null {
  const numeric = finite(value);
  if (numeric == null) return null;
  return ((Math.round(numeric) % 360) + 360) % 360;
}

export function mapWeatherCondition(
  sourceCode: string | null,
): ActivityWeatherConditionCode {
  const code = String(sourceCode ?? '')
    .replace(/[^a-z]/gi, '')
    .toLowerCase();
  if (!code) return 'OTHER';
  if (code.includes('thunder') || code.includes('storm')) return 'THUNDERSTORM';
  if (code.includes('hail')) return 'HAIL';
  if (code.includes('sleet') || code.includes('freezing')) return 'SLEET';
  if (code.includes('heavysnow') || code.includes('blowingsnow')) return 'SNOW';
  if (code.includes('snow') || code.includes('flurr')) return 'SNOW';
  if (code.includes('heavyrain')) return 'HEAVY_RAIN';
  if (code.includes('drizzle')) return 'DRIZZLE';
  if (code.includes('rain') || code.includes('shower')) return 'RAIN';
  if (code.includes('fog') || code.includes('haze') || code.includes('smok'))
    return 'FOG';
  if (code.includes('wind') || code.includes('breez')) return 'WINDY';
  if (code.includes('partly') || code.includes('mostlyclear'))
    return 'PARTLY_CLOUDY';
  if (code.includes('cloud')) return 'CLOUDY';
  if (code.includes('clear') || code.includes('sun')) return 'CLEAR';
  return 'OTHER';
}

export function calculateWindChillC(
  temperatureC: number | null,
  windSpeedKph: number | null,
): number | null {
  const temperature = finite(temperatureC);
  const wind = finite(windSpeedKph);
  if (temperature == null || wind == null || temperature > 10 || wind <= 4.8)
    return null;
  const windFactor = Math.pow(wind, 0.16);
  return round1(
    13.12 +
      0.6215 * temperature -
      11.37 * windFactor +
      0.3965 * temperature * windFactor,
  );
}

export function calculateHeatIndexC(
  temperatureC: number | null,
  humidityPct: number | null,
): number | null {
  const temperature = finite(temperatureC);
  const humidity = finite(humidityPct);
  if (
    temperature == null ||
    humidity == null ||
    temperature < 26.7 ||
    humidity < 40
  )
    return null;
  const t = (temperature * 9) / 5 + 32;
  let heatIndex =
    -42.379 +
    2.04901523 * t +
    10.14333127 * humidity -
    0.22475541 * t * humidity -
    0.00683783 * t * t -
    0.05481717 * humidity * humidity +
    0.00122874 * t * t * humidity +
    0.00085282 * t * humidity * humidity -
    0.00000199 * t * t * humidity * humidity;
  if (humidity < 13 && t >= 80 && t <= 112) {
    heatIndex -=
      ((13 - humidity) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17);
  } else if (humidity > 85 && t >= 80 && t <= 87) {
    heatIndex += ((humidity - 85) / 10) * ((87 - t) / 5);
  }
  return round1(((heatIndex - 32) * 5) / 9);
}

export function normalizeActivityWeatherSample(
  sample: RawWeatherSample,
): NormalizedActivityWeather | null {
  if (!sample.forecastStart) return null;
  const sampledAt = new Date(sample.forecastStart);
  if (!Number.isFinite(sampledAt.getTime())) return null;
  const temperatureC = round1(sample.temperatureC);
  const humidityPct = percent(sample.humidityRatio);
  const windSpeedKph = round1(sample.windSpeedKph);
  return {
    sampledAt,
    conditionCode: mapWeatherCondition(sample.conditionCode),
    sourceConditionCode: sample.conditionCode,
    temperatureC,
    apparentTemperatureC: round1(sample.temperatureApparentC),
    dewPointC: round1(sample.dewPointC),
    windChillC: calculateWindChillC(temperatureC, windSpeedKph),
    heatIndexC: calculateHeatIndexC(temperatureC, humidityPct),
    windSpeedKph,
    windGustKph: round1(sample.windGustKph),
    windDirectionDeg: normalizeWindDirection(sample.windDirectionDeg),
    humidityPct,
    cloudCoverPct: percent(sample.cloudCoverRatio),
    pressureHpa: round1(sample.pressureHpa),
  };
}
