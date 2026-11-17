import { healthProjectionFingerprint } from './health-projection-fingerprint';
import { consolidateHealthCandidates } from './health-data-ingest.service';
import { coachingHealthReadiness } from './health-coaching-readiness';
/**
 * 健康数据面板的读取模型。
 *
 * 每日响应来自已经完成 provider 选优的 `UserDailyHealthMetric`。日内响应沿用相同
 * 的已选 provider，并且只读取有效时序行；如果某个 provider 只提供每日事实，
 * 则返回一个每日点，而不是伪造日内曲线。
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ExternalHealthSessionType,
  HealthMetricType,
  type HealthDataProvider,
} from '@prisma/client';
import { HealthSeriesStorageService } from './health-series-storage.service';
import { HealthDataRepository } from './persistence/health-data.repository';
import { AthleteClockService } from '@/timezone/athlete-clock.service';

const OVERVIEW_METRIC_TYPES = [
  'RESTING_HEART_RATE_BPM',
  'HRV_SDNN_MS',
  'HRV_RMSSD_MS',
  'SLEEP_IN_BED_SECONDS',
  'SLEEP_ASLEEP_SECONDS',
  'SLEEP_AWAKE_SECONDS',
  'SLEEP_CORE_SECONDS',
  'SLEEP_DEEP_SECONDS',
  'SLEEP_REM_SECONDS',
  'SLEEP_SCORE',
  'SLEEP_AVG_HEART_RATE_BPM',
  'STEP_COUNT',
  'DIETARY_ENERGY_KCAL',
  'DIETARY_CARBOHYDRATE_G',
  'DIETARY_FAT_G',
  'DIETARY_PROTEIN_G',
  'HYDRATION_ML',
  'SKIN_TEMPERATURE_DELTA_C',
  'ACTIVE_ENERGY_KCAL',
  'ACTIVE_DURATION_SECONDS',
  'STRESS_LEVEL_AVG',
  'STRESS_LEVEL_MAX',
  'SPO2_AVG_PERCENT',
  'SPO2_MIN_PERCENT',
  'BODY_BATTERY_LATEST',
  'BODY_BATTERY_MIN',
  'BODY_BATTERY_MAX',
] as const;

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

const INTRADAY_METRICS = {
  hrv: {
    metricCode: 'hrv_rmssd_ms',
    dailyTypes: [HealthMetricType.HRV_RMSSD_MS, HealthMetricType.HRV_SDNN_MS],
  },
  restingHeartRate: {
    metricCode: 'resting_heart_rate_bpm',
    dailyTypes: [HealthMetricType.RESTING_HEART_RATE_BPM],
  },
  stress: {
    metricCode: 'stress_level',
    dailyTypes: [
      HealthMetricType.STRESS_LEVEL_AVG,
      HealthMetricType.STRESS_LEVEL_MAX,
    ],
  },
  bodyBattery: {
    metricCode: 'body_battery_level',
    dailyTypes: [
      HealthMetricType.BODY_BATTERY_LATEST,
      HealthMetricType.BODY_BATTERY_MAX,
    ],
  },
} as const;

/** 支持的日内 API 指标键；`sleep` 会解析规范 session 和 segment。 */
export type HealthIntradayMetricKey = 'sleep' | keyof typeof INTRADAY_METRICS;

function requestedDate(value: string) {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
  throw new BadRequestException('endDate must be YYYY-MM-DD');
}

/** 基于规范读取模型构建有界的每日及日内健康响应。 */
@Injectable()
export class HealthDataQueryService {
  constructor(
    private readonly seriesStorage: HealthSeriesStorageService,
    private readonly health: HealthDataRepository,
    private readonly athleteClock: AthleteClockService,
  ) {}

  /** A bounded coaching view of current selected observations and their use limits. */
  async getCoachingFacts(userId: string, endDate: string, asOf = new Date()) {
    const end = requestedDate(endDate);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    const [rows, sessions, unprojected] = await Promise.all([
      this.health.dailyMetrics().findMany({
        where: {
          userId,
          date: { gte: start, lte: end },
          value: { not: null },
          selectedProvider: { in: ['GARMIN', 'INTERVALS_ICU'] },
          metricType: { in: [...OVERVIEW_METRIC_TYPES] },
        },
        orderBy: [{ date: 'desc' }, { metricType: 'asc' }],
        select: {
          id: true,
          date: true,
          metricType: true,
          value: true,
          unit: true,
          selectedProvider: true,
          sourceBreakdown: true,
          sources: {
            where: { deletedAt: null, projectToDaily: true },
            select: {
              id: true,
              provider: true,
              externalId: true,
              value: true,
              unit: true,
              timezone: true,
              sourceName: true,
              sourcePriority: true,
              sourceUpdatedAt: true,
              sourceNamespace: true,
              aggregation: true,
              metadata: true,
              startTime: true,
              endTime: true,
              snapshotId: true,
              snapshot: { select: { manifest: true } },
            },
          },
        },
      }),
      this.health.sessions().findMany({
        where: {
          userId,
          deletedAt: null,
          sessionType: { in: ['SLEEP', 'NAP'] },
          calendarDate: { gte: start, lte: end },
          selectedProvider: { in: ['GARMIN', 'INTERVALS_ICU'] },
          selectedSource: { deletedAt: null },
        },
        orderBy: [{ startTime: 'desc' }, { id: 'asc' }],
        take: 40,
        select: {
          id: true,
          calendarDate: true,
          startTime: true,
          endTime: true,
          durationSeconds: true,
          summary: true,
          selectedProvider: true,
          selectedSource: {
            select: {
              summary: true,
              metadata: true,
              startTime: true,
              endTime: true,
              durationSeconds: true,
              snapshotId: true,
              snapshot: { select: { manifest: true } },
            },
          },
        },
      }),
      this.health.samples().findMany({
        where: {
          userId,
          localDate: { gte: start, lte: end },
          dailyMetricId: null,
          deletedAt: null,
          projectToDaily: true,
          provider: { in: ['GARMIN', 'INTERVALS_ICU'] },
          metricType: { in: [...OVERVIEW_METRIC_TYPES] },
          value: { not: null },
        },
        select: { id: true, localDate: true, metricType: true },
        take: 501,
      }),
    ]);
    const pending: Array<{
      key: string;
      date: string;
      metric: string;
      reason: string;
    }> = unprojected.map((sample) => ({
      key: sample.id,
      date: dateKey(sample.localDate),
      metric: sample.metricType,
      reason: 'DAILY_PROJECTION_PENDING',
    }));
    const unprojectedKeys = new Set(
      unprojected.map(
        (sample) => `${dateKey(sample.localDate)}:${sample.metricType}`,
      ),
    );
    const normalized = (source: {
      snapshotId?: string | null;
      snapshot?: { manifest: unknown } | null;
    }) => {
      const manifest = source.snapshot?.manifest;
      const ready =
        !source.snapshotId ||
        (manifest &&
          typeof manifest === 'object' &&
          !Array.isArray(manifest) &&
          'status' in manifest &&
          manifest.status === 'READY');
      return ready;
    };
    const observations = rows.flatMap((row) => {
      if (
        row.value == null ||
        !Number.isFinite(row.value) ||
        unprojected.length > 500 ||
        unprojectedKeys.has(`${dateKey(row.date)}:${row.metricType}`)
      )
        return [];
      // A stale selected projection must not resurrect withdrawn source samples.
      const sources = row.sources.filter(
        (source) => source.provider === row.selectedProvider,
      );
      if (!sources.length) return [];
      const breakdown = row.sourceBreakdown as Record<
        string,
        { inputFingerprint?: string }
      > | null;
      const proof = breakdown?.[String(row.selectedProvider)]?.inputFingerprint;
      const legacy = proof ? null : consolidateHealthCandidates(sources);
      const matches = proof
        ? proof === healthProjectionFingerprint(sources)
        : legacy?.value === row.value && legacy?.unit === row.unit;
      if (!matches || sources.some((source) => !normalized(source))) {
        pending.push({
          key: row.id,
          date: dateKey(row.date),
          metric: row.metricType,
          reason: 'NORMALIZATION_OR_DAILY_PROJECTION_PENDING',
        });
        return [];
      }
      return [
        coachingHealthReadiness(
          {
            key: row.id,
            date: dateKey(row.date),
            metric: row.metricType,
            value: row.value,
            unit: row.unit,
            provider: String(row.selectedProvider),
          },
          asOf,
        ),
      ];
    });
    const sleepSessions = sessions.flatMap((row) => {
      if (
        !row.selectedSource ||
        !normalized(row.selectedSource) ||
        row.durationSeconds !== row.selectedSource.durationSeconds ||
        row.startTime.getTime() !== row.selectedSource.startTime.getTime() ||
        row.endTime.getTime() !== row.selectedSource.endTime.getTime() ||
        JSON.stringify(row.summary ?? null) !==
          JSON.stringify(row.selectedSource.summary ?? null)
      ) {
        pending.push({
          key: row.id,
          date: dateKey(row.calendarDate ?? row.endTime),
          metric: 'SLEEP_SESSION_SECONDS',
          reason: 'NORMALIZATION_OR_SESSION_PROJECTION_PENDING',
        });
        return [];
      }
      const summary = row.selectedSource?.summary;
      const validation =
        summary && typeof summary === 'object' && !Array.isArray(summary)
          ? summary.validation
          : null;
      return [
        coachingHealthReadiness(
          {
            key: row.id,
            date: dateKey(row.calendarDate ?? row.endTime),
            provider: String(row.selectedProvider),
            metric: 'SLEEP_SESSION_SECONDS',
            value: row.durationSeconds,
            unit: 's',
            range: {
              start: row.startTime.toISOString(),
              end: row.endTime.toISOString(),
            },
            sourceStatus: typeof validation === 'string' ? validation : null,
          },
          asOf,
        ),
      ];
    });
    return {
      policy: 'health-coaching-observation-v1',
      window: { from: dateKey(start), to: endDate },
      observations,
      sleepSessions,
      pending,
      truncated: sessions.length === 40 || unprojected.length > 500,
      limitations: [
        'Sleep totals, stages and scores are independent reported observations; source completion is unverified.',
        'Missing data is unknown. Daily cumulative values are partial observations, not full-day totals.',
      ],
    };
  }

  /** 解析首个已配置每日指标及其已选 provider。 */
  private async selectedDailyMetric(
    userId: string,
    date: Date,
    metricTypes: readonly HealthMetricType[],
  ): Promise<
    | {
        metricType: HealthMetricType;
        selectedProvider: HealthDataProvider | null;
        value: number | null;
        unit: string | null;
      }
    | undefined
  > {
    const rows = (await this.health.dailyMetrics().findMany({
      where: {
        userId,
        date,
        metricType: { in: [...metricTypes] },
        value: { not: null },
        selectedProvider: { not: null },
      },
      select: {
        metricType: true,
        selectedProvider: true,
        value: true,
        unit: true,
      },
    })) as Array<{
      metricType: HealthMetricType;
      selectedProvider: HealthDataProvider | null;
      value: number | null;
      unit: string | null;
    }>;
    const byType = new Map(rows.map((row) => [row.metricType, row]));
    return metricTypes
      .map((metricType) => byType.get(metricType))
      .find((row): row is NonNullable<typeof row> => Boolean(row));
  }

  /** 为未提供时序存储的 provider 读取每日来源事实。 */
  private async selectedCandidatePoints(args: {
    userId: string;
    date: Date;
    metricType: HealthMetricType;
    provider: HealthDataProvider;
  }) {
    const samples = await this.health.samples().findMany({
      where: {
        userId: args.userId,
        localDate: args.date,
        metricType: args.metricType,
        provider: args.provider,
        deletedAt: null,
        projectToDaily: true,
        OR: [
          { snapshotId: null },
          {
            snapshot: {
              manifest: { path: ['status'], equals: 'READY' },
            },
          },
        ],
        value: { not: null },
      },
      orderBy: [{ sourcePriority: 'desc' }, { startTime: 'asc' }],
      select: {
        startTime: true,
        endTime: true,
        value: true,
        provider: true,
      },
    });
    return samples
      .filter(
        (sample): sample is typeof sample & { value: number } =>
          sample.value != null && Number.isFinite(sample.value),
      )
      .map((sample) => ({
        time: sample.startTime.toISOString(),
        endTime: sample.endTime.toISOString(),
        value: sample.value,
        provider: sample.provider,
      }));
  }

  /**
   * 返回以 `requestedEndDate` 结束、包含首尾的 7–90 个本地日期键。
   * 缺失日期使用空指标数组表示，以保持图表横轴稳定。
   */
  async getOverview(
    userId: string,
    requestedDays = 30,
    requestedEndDate?: string,
  ) {
    const days = Math.min(90, Math.max(7, Math.round(requestedDays || 30)));
    const end = requestedDate(
      requestedEndDate ?? (await this.athleteClock.todayYmd(userId)),
    );
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days + 1);

    const rows = await this.health.dailyMetrics().findMany({
      where: {
        userId,
        date: { gte: start, lte: end },
        metricType: { in: [...OVERVIEW_METRIC_TYPES] },
        value: { not: null },
      },
      orderBy: [{ date: 'asc' }, { metricType: 'asc' }],
      select: {
        date: true,
        timezone: true,
        metricType: true,
        value: true,
        unit: true,
        selectedProvider: true,
      },
    });

    const grouped = new Map<
      string,
      {
        date: string;
        timezone: string | null;
        metrics: Array<{
          type: string;
          value: number;
          unit: string | null;
          provider: string | null;
        }>;
      }
    >();

    for (const row of rows) {
      if (row.value == null || !Number.isFinite(row.value)) continue;
      const key = dateKey(row.date);
      const day = grouped.get(key) ?? {
        date: key,
        timezone: row.timezone,
        metrics: [],
      };
      day.metrics.push({
        type: row.metricType,
        value: row.value,
        unit: row.unit,
        provider: row.selectedProvider,
      });
      grouped.set(key, day);
    }

    const overviewDays: Array<{
      date: string;
      timezone: string | null;
      metrics: Array<{
        type: string;
        value: number;
        unit: string | null;
        provider: string | null;
      }>;
    }> = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = dateKey(cursor);
      overviewDays.push(
        grouped.get(key) ?? {
          date: key,
          timezone: null,
          metrics: [],
        },
      );
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return {
      startDate: dateKey(start),
      endDate: dateKey(end),
      days: overviewDays,
    };
  }

  /**
   * 返回已选 provider 的有效日内序列；`sleep` 则返回规范睡眠 session。
   * `requestedEndDate` 是日期键，不是绝对时刻。
   */
  async getIntraday(
    userId: string,
    key: HealthIntradayMetricKey,
    requestedEndDate?: string,
  ) {
    if (key !== 'sleep' && !(key in INTRADAY_METRICS)) {
      throw new BadRequestException(`Unsupported health metric: ${key}`);
    }

    const currentDate = requestedDate(
      requestedEndDate ?? (await this.athleteClock.todayYmd(userId)),
    );
    const previousDate = new Date(currentDate);
    previousDate.setUTCDate(previousDate.getUTCDate() - 1);

    if (key === 'sleep') {
      const sleepMetricTypes = [
        HealthMetricType.SLEEP_ASLEEP_SECONDS,
        HealthMetricType.SLEEP_IN_BED_SECONDS,
      ] as const;
      const [previousSelection, currentSelection] = await Promise.all([
        this.selectedDailyMetric(userId, previousDate, sleepMetricTypes),
        this.selectedDailyMetric(userId, currentDate, sleepMetricTypes),
      ]);
      const selectionByDate = new Map(
        [
          [dateKey(previousDate), previousSelection],
          [dateKey(currentDate), currentSelection],
        ].filter(
          (entry): entry is [string, NonNullable<typeof previousSelection>] =>
            Boolean(entry[1]),
        ),
      );
      const sessions = await this.health.sessions().findMany({
        where: {
          userId,
          sessionType: ExternalHealthSessionType.SLEEP,
          deletedAt: null,
          calendarDate: { in: [previousDate, currentDate] },
        },
        orderBy: [{ calendarDate: 'asc' }, { startTime: 'asc' }],
        select: {
          calendarDate: true,
          startTime: true,
          endTime: true,
          durationSeconds: true,
          score: true,
          selectedProvider: true,
          selectedSourceId: true,
          sources: {
            where: {
              deletedAt: null,
              OR: [
                { snapshotId: null },
                {
                  snapshot: {
                    manifest: { path: ['status'], equals: 'READY' },
                  },
                },
              ],
            },
            select: {
              id: true,
              provider: true,
              startTime: true,
              endTime: true,
              durationSeconds: true,
              score: true,
              segments: {
                where: { status: 'valid' },
                orderBy: { position: 'asc' },
                select: {
                  segmentType: true,
                  startTime: true,
                  endTime: true,
                  durationSeconds: true,
                },
              },
            },
          },
        },
      });
      const pointsFor = async (date: Date) => {
        const selected = selectionByDate.get(dateKey(date));
        if (!selected?.selectedProvider) return [];
        const selectedSessions = sessions
          .filter(
            (session) =>
              session.calendarDate &&
              dateKey(session.calendarDate) === dateKey(date),
          )
          .flatMap((session) => {
            const source = session.sources.find(
              (entry) =>
                entry.provider === selected.selectedProvider &&
                (session.selectedProvider !== selected.selectedProvider ||
                  session.selectedSourceId == null ||
                  entry.id === session.selectedSourceId),
            );
            if (!source) return [];
            return source.segments.length > 0
              ? source.segments.map((segment) => ({
                  time: segment.startTime.toISOString(),
                  endTime: segment.endTime.toISOString(),
                  value: segment.durationSeconds,
                  stage: segment.segmentType,
                  provider: source.provider,
                }))
              : [
                  {
                    time: source.startTime.toISOString(),
                    endTime: source.endTime.toISOString(),
                    value: source.durationSeconds,
                    stage: 'sleep',
                    provider: source.provider,
                  },
                ];
          });
        if (selectedSessions.length > 0) return selectedSessions;
        const fallback = await this.selectedCandidatePoints({
          userId,
          date,
          metricType: selected.metricType,
          provider: selected.selectedProvider,
        });
        return fallback.map((point) => ({ ...point, stage: 'sleep' }));
      };
      const [current, previous] = await Promise.all([
        pointsFor(currentDate),
        pointsFor(previousDate),
      ]);
      return {
        key,
        granularity: 'intraday' as const,
        currentDate: dateKey(currentDate),
        previousDate: dateKey(previousDate),
        current,
        previous,
      };
    }

    const config = INTRADAY_METRICS[key];
    const readSeries = async (date: Date) => {
      const selected = await this.selectedDailyMetric(
        userId,
        date,
        config.dailyTypes,
      );
      if (!selected?.selectedProvider) return [];
      const rows = await this.seriesStorage.readMetricRows({
        userId,
        metricCode: config.metricCode,
        localDates: [date],
        provider: selected.selectedProvider,
      });
      if (rows.length > 0) {
        return rows
          .filter((row) => row.value != null && Number.isFinite(row.value))
          .map((row) => ({
            time: new Date(row.timestampUtcMs).toISOString(),
            endTime:
              row.endTimestampUtcMs == null
                ? undefined
                : new Date(row.endTimestampUtcMs).toISOString(),
            value: row.value!,
            provider: selected.selectedProvider,
          }));
      }

      // 某些 provider 只提供每日候选，此时保留为单个点，不伪造日内曲线。
      return this.selectedCandidatePoints({
        userId,
        date,
        metricType: selected.metricType,
        provider: selected.selectedProvider,
      });
    };

    const [current, previous] = await Promise.all([
      readSeries(currentDate),
      readSeries(previousDate),
    ]);
    return {
      key,
      granularity: 'intraday' as const,
      currentDate: dateKey(currentDate),
      previousDate: dateKey(previousDate),
      current,
      previous,
    };
  }
}
