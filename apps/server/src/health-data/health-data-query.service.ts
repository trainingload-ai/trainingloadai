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
