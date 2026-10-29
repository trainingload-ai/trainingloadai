import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { ConfigType } from '@/config/config';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import type {
  RawWeatherWindow,
  TodayWeatherContextResult,
  TodayWeatherLocation,
  WeatherAttribution,
} from './weather.types';
import { WeatherImpactDeriver } from './weather-impact.deriver';
import {
  WEATHER_PROVIDER,
  type WeatherProvider,
} from './providers/weather-provider';

type CacheEntry<T> = { expiresAt: number; value: T };

class BoundedTtlCache<T> {
  private readonly values = new Map<string, CacheEntry<T>>();

  constructor(private readonly max: number) {}

  get(key: string): { found: boolean; value?: T } {
    const entry = this.values.get(key);
    if (!entry) return { found: false };
    if (entry.expiresAt <= Date.now()) {
      this.values.delete(key);
      return { found: false };
    }
    this.values.delete(key);
    this.values.set(key, entry);
    return { found: true, value: entry.value };
  }

  set(key: string, value: T, ttlMs: number) {
    this.values.delete(key);
    this.values.set(key, { value, expiresAt: Date.now() + Math.max(1, ttlMs) });
    while (this.values.size > this.max) {
      const oldest = this.values.keys().next().value;
      if (oldest === undefined) break;
      this.values.delete(oldest);
    }
  }
}

function isValidLocation(
  location: TodayWeatherLocation | null | undefined,
  now: Date,
) {
  if (!location) return false;
  const capturedAt = new Date(location.capturedAt).getTime();
  return (
    Number.isFinite(location.latitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    Number.isFinite(location.longitude) &&
    location.longitude >= -180 &&
    location.longitude <= 180 &&
    Number.isFinite(location.accuracyMeters) &&
    location.accuracyMeters >= 0 &&
    location.accuracyMeters <= 20_000 &&
    Number.isFinite(capturedAt) &&
    capturedAt >= now.getTime() - 30 * 60_000 &&
    capturedAt <= now.getTime() + 2 * 60_000
  );
}

@Injectable()
export class WeatherContextService {
  private readonly logger = new Logger(WeatherContextService.name);
  private readonly rawCache = new BoundedTtlCache<RawWeatherWindow | null>(
    2_000,
  );
  private readonly attributionCache = new BoundedTtlCache<WeatherAttribution>(
    20,
  );
  private readonly inFlight = new Map<string, Promise<RawWeatherWindow>>();

  constructor(
    private readonly config: ConfigService<ConfigType, true>,
    @Inject(WEATHER_PROVIDER) private readonly provider: WeatherProvider,
    private readonly deriver: WeatherImpactDeriver,
    @Optional() private readonly capabilities?: RuntimeCapabilityService,
  ) {}

  async getTodayWeatherContext(args: {
    userId: string;
    locale: string;
    timezone: string;
    location?: TodayWeatherLocation | null;
    now?: Date;
  }): Promise<TodayWeatherContextResult> {
    const now = args.now ?? new Date();
    if (!this.isTodayWeatherEnabledForUser(args.userId)) {
      this.logger.debug('WeatherKit skipped reason=capability_disabled');
      return { impact: { status: 'unavailable' }, attribution: null };
    }
    if (!isValidLocation(args.location, now)) {
      this.logger.debug(
        `WeatherKit skipped reason=${args.location ? 'location_invalid' : 'location_missing'}`,
      );
      return { impact: { status: 'unavailable' }, attribution: null };
    }
    const location = args.location as TodayWeatherLocation;
    const latitude = Math.round(location.latitude * 1_000) / 1_000;
    const longitude = Math.round(location.longitude * 1_000) / 1_000;
    const end = this.windowEnd(now, args.timezone);
    const expectedHourCount = Math.max(
      1,
      Math.ceil((end.getTime() - now.getTime()) / 3_600_000),
    );
    const cacheKey = createHash('sha256')
      .update(
        `${latitude}|${longitude}|${args.timezone}|${now.toISOString().slice(0, 13)}|${args.locale}|currentWeather,forecastHourly`,
      )
      .digest('hex');

    try {
      const window = await this.getWeatherWindow({
        cacheKey,
        latitude,
        longitude,
        timezone: args.timezone,
        locale: args.locale,
        start: now,
        end,
      });
      if (!window)
        return { impact: { status: 'unavailable' }, attribution: null };
      const impact = this.deriver.derive({
        window,
        location,
        now,
        expectedHourCount,
      });
      if (impact.status !== 'available') return { impact, attribution: null };
      return {
        impact,
        attribution:
          window.attribution ?? (await this.getAttribution(args.locale)),
      };
    } catch (error) {
      this.rawCache.set(cacheKey, null, 2 * 60_000);
      this.logger.warn(
        `WeatherKit unavailable; continuing without weather (${String(
          error instanceof Error ? error.message : error,
        ).slice(0, 100)})`,
      );
      return { impact: { status: 'unavailable' }, attribution: null };
    }
  }

  isTodayWeatherEnabledForUser(userId: string) {
    if (this.capabilities?.isEnabled('weather') === false) return false;
    const todayWeather = this.config.get('aiTodayWeather', { infer: true });
    if (!todayWeather.enabled) return false;
    const provider = this.provider as WeatherProvider & {
      isConfigured?: () => boolean;
    };
    if (provider.isConfigured && !provider.isConfigured()) return false;
    if (todayWeather.rolloutPercent >= 100) return true;
    if (todayWeather.rolloutPercent <= 0) return false;
    const bucket =
      Number.parseInt(
        createHash('sha256').update(userId).digest('hex').slice(0, 8),
        16,
      ) % 100;
    return bucket < todayWeather.rolloutPercent;
  }

  /** 已持久化的派生天气仍参与建议时，为无定位客户端补齐法定归因。 */
  async getWeatherAttribution(locale: string) {
    return this.getAttribution(locale);
  }

  private async getWeatherWindow(args: {
    cacheKey: string;
    latitude: number;
    longitude: number;
    timezone: string;
    locale: string;
    start: Date;
    end: Date;
  }) {
    const cached = this.rawCache.get(args.cacheKey);
    if (cached.found) return cached.value ?? null;
    const existing = this.inFlight.get(args.cacheKey);
    if (existing) return existing;
    const request = this.provider.getRemainingDayWeather(args);
    this.inFlight.set(args.cacheKey, request);
    try {
      const value = await request;
      const configuredTtlMs =
        this.config.get<number>('weather.rawCacheMaxTtlSeconds', 1_800) *
        1_000;
      const upstreamExpiry = value.expiresAt
        ? new Date(value.expiresAt).getTime() - Date.now()
        : configuredTtlMs;
      const ttlMs = Math.max(1_000, Math.min(configuredTtlMs, upstreamExpiry));
      this.rawCache.set(args.cacheKey, value, ttlMs);
      return value;
    } finally {
      this.inFlight.delete(args.cacheKey);
    }
  }

  private async getAttribution(locale: string) {
    const cached = this.attributionCache.get(locale);
    if (cached.found && cached.value) return cached.value;
    try {
      const value = await this.provider.getAttribution(locale);
      this.attributionCache.set(locale, value, 30 * 60_000);
      return value;
    } catch {
      return { serviceName: 'Weather', modified: true as const };
    }
  }

  private windowEnd(now: Date, timezone: string) {
    const maxEnd = new Date(now.getTime() + 8 * 3_600_000);
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const parts = Object.fromEntries(
        formatter.formatToParts(now).map((part) => [part.type, part.value]),
      );
      const utcGuess = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day) + 1,
      );
      const offsetFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      });
      const guessParts = Object.fromEntries(
        offsetFormatter
          .formatToParts(new Date(utcGuess))
          .map((part) => [part.type, part.value]),
      );
      const representedUtc = Date.UTC(
        Number(guessParts.year),
        Number(guessParts.month) - 1,
        Number(guessParts.day),
        Number(guessParts.hour),
        Number(guessParts.minute),
        Number(guessParts.second),
      );
      const nextLocalMidnight = new Date(
        utcGuess - (representedUtc - utcGuess),
      );
      return nextLocalMidnight.getTime() < maxEnd.getTime()
        ? nextLocalMidnight
        : maxEnd;
    } catch {
      return maxEnd;
    }
  }
}
