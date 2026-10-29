import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import {
  ActivityWeatherStatus,
  ActivityWeatherUnavailableReason,
} from '@prisma/client';
import {
  ACTIVITY_WEATHER_CONDITION_CODES,
  type ActivityWeatherConditionCode,
  type ActivityWeatherSnapshot,
} from '@shared/activity-weather';
import type { ConfigType } from '@/config/config';
import { PrismaService } from '@/prisma/prisma.service';
import { SensorDataService } from '@/sensor/sensor-data.service';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import {
  ACTIVITY_WEATHER_NORMALIZATION_VERSION,
  normalizeActivityWeatherSample,
} from './activity-weather-normalizer';
import {
  WEATHER_PROVIDER,
  type WeatherProvider,
} from './providers/weather-provider';

export type ClaimedActivityWeatherJob = {
  id: string;
  activityId: number;
  userId: string;
  attemptCount: number;
  lockToken: string;
};

const INDOOR_SPORT_DENYLIST = new Set([
  'TREADMILL_RUNNING',
  'INDOOR_CYCLING',
  'POOL_SWIMMING',
  'STRENGTH_TRAINING',
  'STRETCHING',
  'YOGA',
  'HIIT',
  'ELLIPTICAL',
]);

function snapshotResetData() {
  return {
    status: ActivityWeatherStatus.PENDING,
    unavailableReason: null,
    sampleLatitudeE3: null,
    sampleLongitudeE3: null,
    queryRecordedAt: null,
    sampledAt: null,
    source: null,
    sourceModified: true,
    attributionServiceName: null,
    attributionLegalUrl: null,
    inputFingerprint: null,
    conditionCode: null,
    sourceConditionCode: null,
    temperatureC: null,
    apparentTemperatureC: null,
    dewPointC: null,
    windChillC: null,
    heatIndexC: null,
    windSpeedKph: null,
    windGustKph: null,
    windDirectionDeg: null,
    humidityPct: null,
    cloudCoverPct: null,
    pressureHpa: null,
    normalizationVersion: ACTIVITY_WEATHER_NORMALIZATION_VERSION,
    fetchedAt: null,
    lastAttemptAt: null,
    availableAt: new Date(),
    attemptCount: 0,
    lastErrorCode: null,
    leaseExpiresAt: null,
    lockToken: null,
  } as const;
}

function fingerprint(value: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function terminalFingerprint(args: {
  activityId: number;
  sportDefinitionCode: string | null;
  timezone: string | null;
  reason: ActivityWeatherUnavailableReason;
}) {
  return fingerprint({
    version: ACTIVITY_WEATHER_NORMALIZATION_VERSION,
    activityId: args.activityId,
    sportDefinitionCode: args.sportDefinitionCode,
    timezone: args.timezone,
    reason: args.reason,
  });
}

function hasWeatherScalar(value: {
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  dewPointC: number | null;
  windSpeedKph: number | null;
  humidityPct: number | null;
  cloudCoverPct: number | null;
  pressureHpa: number | null;
}) {
  return Object.values(value).some((item) => item != null);
}

@Injectable()
export class ActivityWeatherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<ConfigType, true>,
    private readonly sensorData: SensorDataService,
    @Inject(WEATHER_PROVIDER) private readonly provider: WeatherProvider,
    @Optional() private readonly capabilities?: RuntimeCapabilityService,
  ) {}

  isEnabled() {
    return (
      (this.capabilities?.isEnabled('weather') ?? true) &&
      this.config.get('activityWeather', { infer: true }).enabled
    );
  }

  async schedule(args: {
    activityId: number;
    userId: string;
    force?: boolean;
  }): Promise<boolean> {
    if (!this.isEnabled()) return false;
    const activity = await this.prisma.activity.findFirst({
      where: { id: args.activityId, userId: args.userId, state: 1 },
      select: { id: true },
    });
    if (!activity) return false;

    await this.prisma.activityWeatherSnapshot.upsert({
      where: { activityId: args.activityId },
      create: {
        activityId: args.activityId,
        userId: args.userId,
        normalizationVersion: ACTIVITY_WEATHER_NORMALIZATION_VERSION,
      },
      update: args.force ? snapshotResetData() : {},
    });
    return true;
  }

  async read(
    activityId: number,
    userId: string,
  ): Promise<ActivityWeatherSnapshot | null> {
    if (!this.isEnabled()) return null;
    const row = await this.prisma.activityWeatherSnapshot.findFirst({
      where: { activityId, userId },
    });
    if (!row) return null;
    if (
      row.status === ActivityWeatherStatus.PENDING ||
      row.status === ActivityWeatherStatus.PROCESSING
    ) {
      return { status: 'PENDING' };
    }
    if (row.status === ActivityWeatherStatus.NOT_APPLICABLE) {
      return { status: 'NOT_APPLICABLE' };
    }
    if (row.status === ActivityWeatherStatus.UNAVAILABLE) {
      return { status: 'UNAVAILABLE' };
    }
    if (
      !row.queryRecordedAt ||
      !row.sampledAt ||
      !row.source ||
      !row.attributionServiceName ||
      !row.attributionLegalUrl
    )
      return null;
    const conditionCode = ACTIVITY_WEATHER_CONDITION_CODES.includes(
      row.conditionCode as ActivityWeatherConditionCode,
    )
      ? (row.conditionCode as ActivityWeatherConditionCode)
      : null;
    return {
      status: 'AVAILABLE',
      sampleBasis: 'MIDPOINT_TRACK_RECORD',
      queryRecordedAt: row.queryRecordedAt.toISOString(),
      sampledAt: row.sampledAt.toISOString(),
      conditionCode,
      temperatureC: row.temperatureC,
      apparentTemperatureC: row.apparentTemperatureC,
      dewPointC: row.dewPointC,
      windChillC: row.windChillC,
      heatIndexC: row.heatIndexC,
      windSpeedKph: row.windSpeedKph,
      windGustKph: row.windGustKph,
      windDirectionDeg: row.windDirectionDeg,
      humidityPct: row.humidityPct,
      cloudCoverPct: row.cloudCoverPct,
      pressureHpa: row.pressureHpa,
      source: 'APPLE_WEATHERKIT',
      attribution: {
        serviceName: row.attributionServiceName,
        modified: true,
        legalPageUrl: row.attributionLegalUrl,
      },
    };
  }

  async processClaimed(job: ClaimedActivityWeatherJob): Promise<void> {
    const activity = await this.prisma.activity.findFirst({
      where: { id: job.activityId, userId: job.userId, state: 1 },
      select: {
        id: true,
        sportDefinitionCode: true,
        timezone: true,
      },
    });
    if (!activity) {
      await this.finishUnavailable(job, {
        reason: ActivityWeatherUnavailableReason.MISSING_TRACK_TIME,
      });
      return;
    }

    const sportDefinitionCode = activity.sportDefinitionCode?.toUpperCase();
    if (sportDefinitionCode && INDOOR_SPORT_DENYLIST.has(sportDefinitionCode)) {
      await this.finishUnavailable(job, {
        reason: ActivityWeatherUnavailableReason.INDOOR_ACTIVITY,
        inputFingerprint: terminalFingerprint({
          activityId: activity.id,
          sportDefinitionCode: activity.sportDefinitionCode,
          timezone: activity.timezone,
          reason: ActivityWeatherUnavailableReason.INDOOR_ACTIVITY,
        }),
      });
      return;
    }

    const midpoint = await this.sensorData.getActivityMidpointTrackRecord(
      activity.id,
    );
    if (midpoint.status === 'unavailable') {
      const reason = ActivityWeatherUnavailableReason[midpoint.reason];
      await this.finishUnavailable(job, {
        reason,
        inputFingerprint: terminalFingerprint({
          activityId: activity.id,
          sportDefinitionCode: activity.sportDefinitionCode,
          timezone: activity.timezone,
          reason,
        }),
      });
      return;
    }

    const latitudeE3 = Math.round(midpoint.latitude * 1_000);
    const longitudeE3 = Math.round(midpoint.longitude * 1_000);
    const inputFingerprint = fingerprint({
      version: ACTIVITY_WEATHER_NORMALIZATION_VERSION,
      source: 'APPLE_WEATHERKIT',
      recordedAt: midpoint.recordedAt.toISOString(),
      latitudeE3,
      longitudeE3,
      timezone: activity.timezone ?? 'UTC',
      sportDefinitionCode: activity.sportDefinitionCode,
    });
    const accepted = await this.prisma.activityWeatherSnapshot.updateMany({
      where: {
        id: job.id,
        status: ActivityWeatherStatus.PROCESSING,
        lockToken: job.lockToken,
      },
      data: {
        inputFingerprint,
        sampleLatitudeE3: latitudeE3,
        sampleLongitudeE3: longitudeE3,
        queryRecordedAt: midpoint.recordedAt,
      },
    });
    if (accepted.count !== 1) return;

    if (!this.provider.isConfigured()) {
      await this.finishUnavailable(job, {
        reason: ActivityWeatherUnavailableReason.PROVIDER_REJECTED,
        inputFingerprint,
      });
      return;
    }

    const raw = await this.provider.getHourAt({
      latitude: latitudeE3 / 1_000,
      longitude: longitudeE3 / 1_000,
      timezone: activity.timezone ?? 'UTC',
      at: midpoint.recordedAt,
    });
    if (!raw.sample) {
      await this.finishUnavailable(job, {
        reason: ActivityWeatherUnavailableReason.PROVIDER_NO_MATCHING_SAMPLE,
        inputFingerprint,
      });
      return;
    }
    if (!raw.attribution?.serviceName || !raw.attribution.legalPageUrl) {
      await this.finishUnavailable(job, {
        reason: ActivityWeatherUnavailableReason.PROVIDER_REJECTED,
        inputFingerprint,
        errorCode: 'PROVIDER_ATTRIBUTION_MISSING',
      });
      return;
    }
    const normalized = normalizeActivityWeatherSample(raw.sample);
    if (!normalized || !hasWeatherScalar(normalized)) {
      await this.finishUnavailable(job, {
        reason: ActivityWeatherUnavailableReason.PROVIDER_NO_MATCHING_SAMPLE,
        inputFingerprint,
      });
      return;
    }

    await this.prisma.activityWeatherSnapshot.updateMany({
      where: {
        id: job.id,
        status: ActivityWeatherStatus.PROCESSING,
        lockToken: job.lockToken,
        inputFingerprint,
      },
      data: {
        status: ActivityWeatherStatus.AVAILABLE,
        unavailableReason: null,
        sampledAt: normalized.sampledAt,
        source: 'APPLE_WEATHERKIT',
        sourceModified: true,
        attributionServiceName: raw.attribution.serviceName,
        attributionLegalUrl: raw.attribution.legalPageUrl,
        conditionCode: normalized.conditionCode,
        sourceConditionCode: normalized.sourceConditionCode,
        temperatureC: normalized.temperatureC,
        apparentTemperatureC: normalized.apparentTemperatureC,
        dewPointC: normalized.dewPointC,
        windChillC: normalized.windChillC,
        heatIndexC: normalized.heatIndexC,
        windSpeedKph: normalized.windSpeedKph,
        windGustKph: normalized.windGustKph,
        windDirectionDeg: normalized.windDirectionDeg,
        humidityPct: normalized.humidityPct,
        cloudCoverPct: normalized.cloudCoverPct,
        pressureHpa: normalized.pressureHpa,
        normalizationVersion: ACTIVITY_WEATHER_NORMALIZATION_VERSION,
        fetchedAt: new Date(),
        lastErrorCode: null,
        leaseExpiresAt: null,
        lockToken: null,
      },
    });
  }

  async handleFailure(
    job: ClaimedActivityWeatherJob,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    if (/weatherkit_http_(400|404)/.test(message)) {
      await this.finishUnavailable(job, {
        reason: ActivityWeatherUnavailableReason.PROVIDER_HISTORY_UNAVAILABLE,
        errorCode: 'PROVIDER_HISTORY_UNAVAILABLE',
      });
      return;
    }
    if (/weatherkit_http_4\d\d/.test(message) && !message.includes('429')) {
      await this.finishUnavailable(job, {
        reason: ActivityWeatherUnavailableReason.PROVIDER_REJECTED,
        errorCode: 'PROVIDER_REJECTED',
      });
      return;
    }
    const maxAttempts = this.config.get('activityWeather', {
      infer: true,
    }).maxAttempts;
    if (job.attemptCount >= maxAttempts) {
      await this.finishUnavailable(job, {
        reason: ActivityWeatherUnavailableReason.RETRY_EXHAUSTED,
        errorCode: 'RETRY_EXHAUSTED',
      });
      return;
    }
    const delayMs = [5 * 60_000, 60 * 60_000, 24 * 60 * 60_000][
      Math.min(2, Math.max(0, job.attemptCount - 1))
    ]!;
    const errorCode = message.includes('429')
      ? 'PROVIDER_RATE_LIMITED'
      : message.toLowerCase().includes('timeout') ||
          message.toLowerCase().includes('abort')
        ? 'PROVIDER_TIMEOUT'
        : 'PROVIDER_TRANSIENT_ERROR';
    await this.prisma.activityWeatherSnapshot.updateMany({
      where: {
        id: job.id,
        status: ActivityWeatherStatus.PROCESSING,
        lockToken: job.lockToken,
      },
      data: {
        status: ActivityWeatherStatus.PENDING,
        availableAt: new Date(Date.now() + delayMs),
        lastErrorCode: errorCode,
        leaseExpiresAt: null,
        lockToken: null,
      },
    });
  }

  private async finishUnavailable(
    job: ClaimedActivityWeatherJob,
    args: {
      reason: ActivityWeatherUnavailableReason;
      inputFingerprint?: string;
      errorCode?: string;
    },
  ) {
    await this.prisma.activityWeatherSnapshot.updateMany({
      where: {
        id: job.id,
        status: ActivityWeatherStatus.PROCESSING,
        lockToken: job.lockToken,
      },
      data: {
        status:
          args.reason === ActivityWeatherUnavailableReason.INDOOR_ACTIVITY
            ? ActivityWeatherStatus.NOT_APPLICABLE
            : ActivityWeatherStatus.UNAVAILABLE,
        unavailableReason: args.reason,
        inputFingerprint:
          args.inputFingerprint ??
          fingerprint({
            version: ACTIVITY_WEATHER_NORMALIZATION_VERSION,
            activityId: job.activityId,
            reason: args.reason,
          }),
        lastErrorCode: args.errorCode ?? null,
        fetchedAt: new Date(),
        leaseExpiresAt: null,
        lockToken: null,
      },
    });
  }
}
