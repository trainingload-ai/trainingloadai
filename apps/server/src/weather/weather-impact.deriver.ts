import { Injectable } from '@nestjs/common';
import type {
  RawWeatherSample,
  RawWeatherWindow,
  ThermalImpactLevel,
  TodayWeatherImpact,
  TodayWeatherLocation,
  WeatherImpactLevel,
} from './weather.types';

const LEVEL_RANK: Record<ThermalImpactLevel, number> = {
  LOW: 0,
  MODERATE: 1,
  HIGH: 2,
  EXTREME: 3,
};

function finiteNumbers(values: Array<number | null>) {
  return values.filter(
    (value): value is number =>
      typeof value === 'number' && Number.isFinite(value),
  );
}

function maxLevel<T extends ThermalImpactLevel>(levels: T[]): T {
  return levels.reduce((highest, current) =>
    LEVEL_RANK[current] > LEVEL_RANK[highest] ? current : highest,
  );
}

function heatImpact(value: number): ThermalImpactLevel {
  if (value >= 38) return 'EXTREME';
  if (value >= 32) return 'HIGH';
  if (value >= 28) return 'MODERATE';
  return 'LOW';
}

function coldImpact(value: number): ThermalImpactLevel {
  if (value < -10) return 'EXTREME';
  if (value < 0) return 'HIGH';
  if (value < 5) return 'MODERATE';
  return 'LOW';
}

function precipitationImpact(samples: RawWeatherSample[]): WeatherImpactLevel {
  const chance = Math.max(
    0,
    ...finiteNumbers(samples.map((item) => item.precipitationChance)),
  );
  const severeType = samples.some((item) => {
    const type = String(item.precipitationType ?? '').toLowerCase();
    const condition = String(item.conditionCode ?? '').toLowerCase();
    return (
      type.includes('snow') ||
      condition.includes('snow') ||
      condition.includes('thunder') ||
      condition.includes('storm')
    );
  });
  if (severeType || chance >= 0.6) return 'HIGH';
  if (chance >= 0.3) return 'MODERATE';
  return 'LOW';
}

function windImpact(samples: RawWeatherSample[]): WeatherImpactLevel {
  const sustained = Math.max(
    0,
    ...finiteNumbers(samples.map((item) => item.windSpeedKph)),
  );
  const gust = Math.max(
    0,
    ...finiteNumbers(samples.map((item) => item.windGustKph)),
  );
  if (sustained >= 35 || gust >= 45) return 'HIGH';
  if (sustained >= 20 || gust >= 30) return 'MODERATE';
  return 'LOW';
}

function uvImpact(samples: RawWeatherSample[]): WeatherImpactLevel {
  const daylightSamples = samples.filter((item) => item.daylight !== false);
  const uv = Math.max(
    0,
    ...finiteNumbers(daylightSamples.map((item) => item.uvIndex)),
  );
  if (uv >= 6) return 'HIGH';
  if (uv >= 3) return 'MODERATE';
  return 'LOW';
}

function conditionFamily(
  samples: RawWeatherSample[],
): Extract<TodayWeatherImpact, { status: 'available' }>['conditionFamily'] {
  const codes = samples.map((item) =>
    String(item.conditionCode ?? '').toLowerCase(),
  );
  if (
    codes.some((code) => code.includes('thunder') || code.includes('storm'))
  ) {
    return 'STORM';
  }
  if (codes.some((code) => code.includes('snow') || code.includes('sleet'))) {
    return 'SNOW';
  }
  if (codes.some((code) => code.includes('rain') || code.includes('drizzle'))) {
    return 'RAIN';
  }
  if (
    codes.some((code) => code.includes('cloud') || code.includes('overcast'))
  ) {
    return 'CLOUDY';
  }
  if (codes.some((code) => code.includes('clear') || code.includes('sun'))) {
    return 'CLEAR';
  }
  return 'OTHER';
}

function confidence(args: {
  location: TodayWeatherLocation;
  sampleCount: number;
  expectedHourCount: number;
  now: Date;
}): 'LOW' | 'MEDIUM' | 'HIGH' {
  const capturedAt = new Date(args.location.capturedAt).getTime();
  const ageMs = Math.max(0, args.now.getTime() - capturedAt);
  const coverage =
    args.expectedHourCount > 0
      ? args.sampleCount / args.expectedHourCount
      : args.sampleCount > 0
        ? 1
        : 0;
  if (
    ageMs <= 15 * 60_000 &&
    args.location.accuracyMeters <= 2_000 &&
    coverage >= 0.8
  ) {
    return 'HIGH';
  }
  if (
    ageMs <= 30 * 60_000 &&
    args.location.accuracyMeters <= 10_000 &&
    coverage >= 0.5
  ) {
    return 'MEDIUM';
  }
  return 'LOW';
}

@Injectable()
export class WeatherImpactDeriver {
  derive(args: {
    window: RawWeatherWindow;
    location: TodayWeatherLocation;
    now?: Date;
    expectedHourCount: number;
  }): TodayWeatherImpact {
    const samples = [args.window.current, ...args.window.hours].filter(
      (sample): sample is RawWeatherSample => Boolean(sample),
    );
    if (samples.length === 0) return { status: 'unavailable' };

    const apparent = finiteNumbers(
      samples.map((item) => item.temperatureApparentC),
    );
    const hottest = apparent.length > 0 ? Math.max(...apparent) : 20;
    const coldest = apparent.length > 0 ? Math.min(...apparent) : 20;
    const heat = heatImpact(hottest);
    const cold = coldImpact(coldest);
    const thermalImpact = maxLevel([heat, cold]);
    const thermalDirection =
      thermalImpact === 'LOW'
        ? 'NEUTRAL'
        : LEVEL_RANK[heat] > LEVEL_RANK[cold]
          ? 'HEAT'
          : LEVEL_RANK[cold] > LEVEL_RANK[heat]
            ? 'COLD'
            : hottest - 28 >= 5 - coldest
              ? 'HEAT'
              : 'COLD';
    const precipitationRisk = precipitationImpact(samples);
    const wind = windImpact(samples);
    const uvRisk = uvImpact(samples);
    const componentLevels: ThermalImpactLevel[] = [
      thermalImpact,
      precipitationRisk,
      wind,
      uvRisk,
    ];
    let overallImpact = maxLevel(componentLevels);
    if (
      overallImpact === 'MODERATE' &&
      componentLevels.filter((level) => level === 'MODERATE').length >= 2
    ) {
      overallImpact = 'HIGH';
    }

    return {
      status: 'available',
      windowBasis: 'REMAINING_DAY_UP_TO_8H',
      conditionFamily: conditionFamily(samples),
      thermalDirection,
      thermalImpact,
      precipitationRisk,
      windImpact: wind,
      uvRisk,
      overallImpact,
      confidence: confidence({
        location: args.location,
        sampleCount: args.window.hours.length,
        expectedHourCount: args.expectedHourCount,
        now: args.now ?? new Date(),
      }),
      algorithmVersion: 'today-weather-impact-v1',
    };
  }
}
