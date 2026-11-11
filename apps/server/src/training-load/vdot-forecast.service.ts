import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import timezone = require('dayjs/plugin/timezone');
import { BodyMetricType, SportType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type {
  VdotForecastArtifact,
  VdotForecastResult,
} from '@shared/vdot-forecast';
import { ActivityReadService } from '@/api/activity/activity-read.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { UserAnalysisConfigService } from '@/api/user/user-analysis-config.service';
import { PrismaService } from '@/prisma/prisma.service';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import { resolveEffectiveActivityVo2Max } from '@/algorithm/vo2max-source';
import {
  calculateVdotForecast,
  isValidatedVdotArtifact,
  shiftVdotDate,
  VDOT_FORECAST_VERSION,
  type VdotObservation,
} from '@/algorithm/vdot-forecast';
import { resolveActivityAnalysisTimezone } from './activity-local-date';

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class VdotForecastService {
  private readonly logger = new Logger(VdotForecastService.name);
  private artifactCache: {
    modified: number;
    path: string;
    value: VdotForecastArtifact | null;
  } | null = null;

  constructor(
    private readonly activities: ActivityReadService,
    private readonly users: UserQueryService,
    private readonly configs: UserAnalysisConfigService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async artifact(): Promise<VdotForecastArtifact | null> {
    const path = this.config.get<string>('VDOT_FORECAST_MODEL_PATH')?.trim();
    if (!path) return null;
    try {
      const info = await stat(path);
      if (
        this.artifactCache?.path === path &&
        this.artifactCache.modified === info.mtimeMs
      ) {
        return this.artifactCache.value;
      }
      if (!info.isFile() || info.size > 1_000_000)
        throw new Error('INVALID_MODEL_FILE');
      const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
      const value = isValidatedVdotArtifact(parsed) ? parsed : null;
      this.artifactCache = { path, modified: info.mtimeMs, value };
      if (!value) this.logger.warn('VDOT_FORECAST_MODEL_NOT_VALIDATED');
      return value;
    } catch {
      this.logger.warn('VDOT_FORECAST_MODEL_UNAVAILABLE');
      return null;
    }
  }

  async readObservations(
    userId: string,
    startDate: string,
    cutoffDate: string,
    zone: string,
  ) {
    const start = dayjs.tz(startDate, zone).startOf('day').toDate();
    const end = dayjs.tz(cutoffDate, zone).endOf('day').toDate();
    const [rows, versions] = await Promise.all([
      this.activities.findMany({
        where: readyActivityWhere({
          userId,
          sportType: SportType.RUN,
          startTime: { gte: start, lte: end },
          vo2max: { isNot: null },
        }),
        orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          startTime: true,
          endTime: true,
          elapsedTime: true,
          vo2max: true,
          fitnessMetricsSnapshot: {
            select: {
              resolutionVersion: true,
              resolvedVo2maxValue: true,
              resolvedVo2maxSource: true,
            },
          },
        },
      }),
      this.configs.listVersions(userId, end),
    ]);
    const observations: VdotObservation[] = [];
    for (const row of rows) {
      const activityEnd =
        row.endTime ??
        new Date(row.startTime.getTime() + (row.elapsedTime ?? 0) * 1000);
      if (activityEnd > end) continue;
      const config = this.configs.resolveFromVersionsOrDefault(
        versions,
        row.startTime,
      );
      const snapshot = row.fitnessMetricsSnapshot;
      const resolved =
        (snapshot?.resolutionVersion ?? 0) >= 4
          ? {
              value: snapshot.resolvedVo2maxValue,
              source: snapshot.resolvedVo2maxSource,
            }
          : resolveEffectiveActivityVo2Max(
              row.vo2max,
              config.defaultVdotSource,
              config.vo2maxCorrectionFactor,
            );
      if (
        !resolved ||
        resolved.value == null ||
        !['FACTOR', 'RACE'].includes(resolved.source ?? '')
      )
        continue;
      const source = resolved.source as VdotObservation['source'];
      observations.push({
        date: dayjs(row.startTime).tz(zone).format('YYYY-MM-DD'),
        value: Number(resolved.value),
        source,
        seriesKey: JSON.stringify([
          source,
          config.defaultVdotSource,
          source === 'FACTOR' ? config.vo2maxCorrectionFactor : null,
          snapshot?.resolutionVersion ?? 'legacy',
        ]),
      });
    }
    return observations;
  }

  async userTimezone(userId: string, now = new Date()) {
    const timezoneMetric = await this.users.bodyMetrics().findFirst({
      where: {
        userId,
        type: BodyMetricType.TIMEZONE,
        effectiveDate: { lte: now },
      },
      orderBy: { effectiveDate: 'desc' },
      select: { type: true, value: true },
    });
    return resolveActivityAnalysisTimezone({
      bodyMetrics: timezoneMetric ? [timezoneMetric] : [],
    });
  }

  async getForecast(
    userId: string,
    now = new Date(),
  ): Promise<VdotForecastResult> {
    const zone = await this.userTimezone(userId, now);
    const cutoffDate = shiftVdotDate(
      dayjs(now).tz(zone).format('YYYY-MM-DD'),
      -1,
    );
    const [observations, artifact] = await Promise.all([
      this.readObservations(
        userId,
        shiftVdotDate(cutoffDate, -83),
        cutoffDate,
        zone,
      ),
      this.artifact(),
    ]);
    const activeArtifact =
      artifact && artifact.trainedThrough <= cutoffDate ? artifact : null;
    const calculated = calculateVdotForecast(
      observations,
      cutoffDate,
      activeArtifact,
    );
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          userId,
          cutoffDate,
          zone,
          algorithm: VDOT_FORECAST_VERSION,
          artifact,
          observations,
        }),
      )
      .digest('hex');
    const result: VdotForecastResult = {
      forecastId: fingerprint,
      status: calculated.status,
      asOf: now.toISOString(),
      cutoffDate,
      timezone: zone,
      source: calculated.latest?.source ?? null,
      modelVersion: activeArtifact?.modelVersion ?? null,
      lastObservationAt: calculated.latest?.date ?? null,
      history: calculated.weeks,
      estimatedCurrentLevel: calculated.currentLevel,
      forecasts: calculated.forecasts,
    };
    if (result.status !== 'READY') return result;
    const row = await this.prisma.vdotForecastSnapshot.upsert({
      where: { userId_fingerprint: { userId, fingerprint } },
      update: {},
      create: {
        userId,
        fingerprint,
        input: {
          observations,
          artifact,
          cutoffDate,
          timezone: zone,
        } as Prisma.InputJsonValue,
        result: result as unknown as Prisma.InputJsonValue,
      },
      select: { result: true },
    });
    return row.result as unknown as VdotForecastResult;
  }
}
