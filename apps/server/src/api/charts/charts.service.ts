import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SensorDataService } from 'src/sensor/sensor-data.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityQueryService } from '../activity/activity-query.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserService } from '../user/user.service';
import { calculateTimedWPrimeBalance } from '@/algorithm/wprime';
import { $Enums, Prisma } from '@prisma/client';
import dayjs = require('dayjs');
import isoWeek = require('dayjs/plugin/isoWeek');
import { round, mean } from 'lodash';
import { I18nService } from 'nestjs-i18n';
import { PMCService } from '@/training-load/pmc.service';
import { ActivityReadService } from '../activity/activity-read.service';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import {
  READY_ACTIVITY_SQL_PREDICATE,
  readyActivityWhere,
} from '@/utils/activity-ready-where';
import {
  CALCULATED_POWER_MODEL_VERSION,
  CYCLING_CALCULATED_POWER_MODEL,
  isMeasuredPowerSample,
  RUNNING_CALCULATED_POWER_MODEL,
} from '@/algorithm/power';

dayjs.extend(isoWeek['default'] || isoWeek);

type ChartSqlParam = string | Date | $Enums.SportType;
type ActivitySummarySqlRow = {
  period?: Date | string | null;
  activities?: unknown;
  duration?: unknown;
  distance?: unknown;
  totalAscent?: unknown;
  totalCalories?: unknown;
  averageSpeed?: unknown;
  averageWatts?: unknown;
  averageHeartrate?: unknown;
  avgCadence?: unknown;
  maxSpeed?: unknown;
  maxPower?: unknown;
  maxHeartRate?: unknown;
  maxCadence?: unknown;
  minSpeed?: unknown;
  minPower?: unknown;
  minHeartRate?: unknown;
  minCadence?: unknown;
  maxDuration?: unknown;
  minDuration?: unknown;
  maxDistance?: unknown;
  minDistance?: unknown;
  maxAscent?: unknown;
  minAscent?: unknown;
  maxCalories?: unknown;
  minCalories?: unknown;
};
type ActivitySummaryRow = {
  startTime: Date | string;
  activities: number;
  duration: number;
  distance: number;
  totalAscent: number;
  totalCalories: number;
  averageSpeed: number;
  averageWatts: number;
  averageHeartrate: number;
  averageCadence: number;
  maxSpeed?: number;
  maxPower?: number;
  maxHeartRate?: number;
  maxCadence?: number;
  minSpeed?: number;
  minPower?: number;
  minHeartRate?: number;
  minCadence?: number;
  maxDuration?: number;
  minDuration?: number;
  maxDistance?: number;
  minDistance?: number;
  maxAscent?: number;
  minAscent?: number;
  maxCalories?: number;
  minCalories?: number;
};

export interface MultiMetricChartResult {
  rows: Array<{ time?: string; distance?: string } & Record<string, number>>;
  metadata: {
    avg?: number;
    max?: number;
    min?: number;
    sum?: number;
    count?: string;
    [key: string]: string | number | undefined;
  };
}

const RUNNING_DYNAMICS_DERIVED_METRICS = new Set([
  'stepLength',
  'verticalRatio',
  'flightTime',
  'flightRatio',
  'totalSteps',
]);

type RunningDynamicsSourceRow = {
  time?: string;
  distance?: string;
  cadence?: number;
  speed?: number;
  totalCycles?: number;
  stanceTime?: number;
  stanceTimePercent?: number;
  verticalOscillation?: number;
  verticalRatio?: number;
  stepLength?: number;
};

const positiveMetric = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/** FIT 跑步 cadence 以 strides/min 表示，返回每一步长度（毫米）。 */
function deriveStepLengthMm(row: RunningDynamicsSourceRow): number | null {
  const speed = positiveMetric(row.speed);
  const cadence = positiveMetric(row.cadence);
  if (speed === null || cadence === null) return null;
  return (speed * 60 * 1000) / (cadence * 2);
}

function summarizeDerivedRows(
  rows: MultiMetricChartResult['rows'],
  metric: string,
): MultiMetricChartResult {
  const values = rows
    .map((row) => positiveMetric(row[metric]))
    .filter((value): value is number => value !== null);
  const sum = values.reduce((total, value) => total + value, 0);

  return {
    rows,
    metadata: {
      avg: round(values.length > 0 ? sum / values.length : 0, 2),
      min: round(values.length > 0 ? Math.min(...values) : 0, 2),
      max: round(values.length > 0 ? Math.max(...values) : 0, 2),
      sum: round(sum, 2),
      count: values.length.toString(),
      derived: 1,
    },
  };
}

function parseChartTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(
    value.includes('T') ? value : value.replace(' ', 'T'),
  );
  return Number.isFinite(parsed) ? parsed : null;
}

@Injectable()
export class ChartsService {
  private readonly logger = new Logger(ChartsService.name);
  constructor(
    private sensorDataService: SensorDataService,
    private activityService: ActivityService,
    private readonly activityQuery: ActivityQueryService,
    private prisma: PrismaService,
    private userService: UserService,
    private readonly i18n: I18nService,
    private readonly pmc: PMCService,
    private readonly activityRead: ActivityReadService,
  ) {}

  /**
   * 活动执行图表查询 (单指标，返回详细序列与统计元数据)
   */
  async executeChartForActivity(
    hashId: string,
    metric: string,
    userId?: string,
  ): Promise<MultiMetricChartResult> {
    // 单活动图表优先走传感器时序；少数派生指标在这里即时计算并返回同一 rows/metadata 形态。
    const activity = await this.activityQuery.getActivityByHashId(
      hashId,
      userId,
    );
    if (!activity) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.ACTIVITY_NOT_FOUND,
        message: this.i18n?.t('common.error.activity_not_found'),
      });
    }

    // Special handling for W' Balance
    if (metric === 'w_prime_balance') {
      // W' Balance 优先复用分析时绑定的 CP/W'，旧活动无快照时回退到当前生效值。
      // 1. Get Power Data
      const powerRows = await this.sensorDataService.getRecordSeriesMulti(
        activity.id,
        ['power'],
        activity.timezone,
      );

      const [userProfile, fitnessSnapshot] = await Promise.all([
        this.userService.getComposedUserProfile(
          activity.userId,
          activity.sportType,
          activity.startTime ?? undefined,
        ),
        this.prisma.activityFitnessMetricsSnapshot.findUnique({
          where: { activityId: activity.id },
          select: { cpValue: true, cpValue2: true },
        }),
      ]);
      const cp = fitnessSnapshot?.cpValue ?? userProfile?.cp;
      const wPrime = fitnessSnapshot?.cpValue2 ?? userProfile?.wPrime;

      if (!cp || !wPrime) {
        // Return empty if no settings
        return {
          rows: [],
          metadata: {
            avg: 0,
            max: 0,
            min: 0,
            count: '0',
            error: "No effective CP/W' setting found for this analysis",
          },
        };
      }

      // 3. Calculate
      const balanceResult = calculateTimedWPrimeBalance(
        powerRows.map((row) => ({
          tMs: new Date(row.time).getTime(),
          power:
            row.power != null && Number.isFinite(row.power) ? row.power : null,
        })),
        cp,
        wPrime,
      );
      const balance = balanceResult.values;

      // 4. Merge back to rows
      const rows = powerRows.map((r, i) => ({
        time: r.time,
        w_prime_balance:
          balance[i] == null ? null : Math.round(balance[i] as number),
        // Optional: return power as well? Usually charts request one metric or multiple.
        // But for visualization, usually we just need time + value.
      })) as unknown as MultiMetricChartResult['rows'];

      // 5. Calculate stats
      const knownBalance = balance.filter(
        (value): value is number => value != null && Number.isFinite(value),
      );
      const min = knownBalance.length ? Math.min(...knownBalance) : 0;
      const max = knownBalance.length ? Math.max(...knownBalance) : 0;
      const avg = knownBalance.length ? mean(knownBalance) : 0;

      return {
        rows,
        metadata: {
          avg: round(avg, 0),
          min: round(min, 0),
          max: round(max, 0), // This should ideally be close to wPrime
          count: rows.length.toString(),
          cp,
          w_prime: wPrime,
          covered_seconds: balanceResult.coveredSeconds,
          unknown_seconds: balanceResult.unknownSeconds,
          tau_seconds: round(balanceResult.tau, 2),
        },
      };
    }

    if (metric === 'power') {
      const [rawRows, calculatedSummary] = await Promise.all([
        this.sensorDataService.getRecordSeriesMulti(
          activity.id,
          ['power', 'calculatedPower'],
          activity.timezone,
        ),
        this.prisma.activityCalculatedPower.findUnique({
          where: { activityId: activity.id },
        }),
      ]);
      const measuredValues = rawRows
        .map((row) => row.power)
        .filter(isMeasuredPowerSample);
      const calculatedValues = rawRows
        .map((row) => Number(row.calculatedPower))
        .filter((value) => Number.isFinite(value) && value > 0);
      const measuredCoverage =
        rawRows.length > 0 ? measuredValues.length / rawRows.length : 0;
      // 当前原始序列是实测来源的最终依据；摘要仅描述估算模型，不能压过实测功率。
      const useCalculated =
        calculatedValues.length > 0 && measuredCoverage < 0.5;
      const values = useCalculated ? calculatedValues : measuredValues;
      const source = useCalculated ? 'CALCULATED' : 'MEASURED';
      const model = useCalculated
        ? (calculatedSummary?.model ??
          (activity.sportType === $Enums.SportType.RUN
            ? RUNNING_CALCULATED_POWER_MODEL
            : CYCLING_CALCULATED_POWER_MODEL))
        : undefined;
      const avg =
        values.length > 0
          ? values.reduce((sum, value) => sum + value, 0) / values.length
          : 0;

      return {
        rows: rawRows,
        metadata: {
          avg: round(avg, 2),
          min: round(values.length > 0 ? Math.min(...values) : 0, 2),
          max: round(values.length > 0 ? Math.max(...values) : 0, 2),
          sum: round(
            values.reduce((sum, value) => sum + value, 0),
            2,
          ),
          count: values.length.toString(),
          powerSource: source,
          measuredCoverage: round(measuredCoverage, 4),
          ...(model
            ? {
                calculatedPowerModel: model,
                calculatedPowerModelVersion:
                  calculatedSummary?.modelVersion ??
                  CALCULATED_POWER_MODEL_VERSION,
              }
            : {}),
        },
      };
    }

    if (metric === 'aePower') {
      const rawRows = await this.sensorDataService.getRecordSeriesMulti(
        activity.id,
        ['power', 'heartRate'],
        activity.timezone,
      );

      const rows = rawRows.map((r) => {
        const p = Number(r.power ?? 0);
        const hr = Number(r.heartRate ?? 0);
        const value =
          Number.isFinite(p) && Number.isFinite(hr) && p > 0 && hr > 0
            ? round(p / hr, 2)
            : 0;
        return {
          time: r.time,
          distance: r.distance,
          aePower: value,
        };
      }) as unknown as MultiMetricChartResult['rows'];

      const values = rows
        .map((r) => Number(r.aePower))
        .filter((v) => Number.isFinite(v) && v > 0);

      let avg = 0;
      let max = 0;
      let min = 0;
      let sum = 0;

      if (values.length > 0) {
        sum = values.reduce((acc, v) => acc + v, 0);
        avg = sum / values.length;
        max = Math.max(...values);
        min = Math.min(...values);
      }

      const metadata: MultiMetricChartResult['metadata'] = {
        avg: round(avg, 2),
        max: round(max, 2),
        min: round(min, 2),
        sum: round(sum, 2),
        count: rows.length.toString(),
      };

      return { rows, metadata };
    }

    if (metric === 're') {
      const rawRows = await this.sensorDataService.getRecordSeriesMulti(
        activity.id,
        ['speed', 'power'],
        activity.timezone,
      );

      // Fetch user weight (kg) for this activity date
      const profile =
        activity.userId && activity.sportType
          ? await this.userService.getComposedUserProfile(
              activity.userId,
              activity.sportType,
              activity.startTime ?? undefined,
            )
          : undefined;
      const userWeight =
        profile?.weight && profile.weight > 0 ? profile.weight : undefined;

      const rows = rawRows.map((r) => {
        const speed = Number(r.speed ?? 0);
        const power = Number(r.power ?? 0);
        let value = 0;
        if (
          Number.isFinite(speed) &&
          Number.isFinite(power) &&
          speed > 0 &&
          power > 0 &&
          userWeight &&
          userWeight > 0
        ) {
          value = round(speed / (power / userWeight), 2);
        }
        return {
          time: r.time,
          distance: r.distance,
          re: value,
        };
      }) as unknown as MultiMetricChartResult['rows'];

      const values = rows
        .map((r) => Number(r.re))
        .filter((v) => Number.isFinite(v) && v > 0);

      let avg = 0;
      let max = 0;
      let min = 0;
      let sum = 0;

      if (values.length > 0) {
        sum = values.reduce((acc, v) => acc + v, 0);
        avg = sum / values.length;
        max = Math.max(...values);
        min = Math.min(...values);
      }

      const metadata: MultiMetricChartResult['metadata'] = {
        avg: round(avg, 2),
        max: round(max, 2),
        min: round(min, 2),
        sum: round(sum, 2),
        count: rows.length.toString(),
        weightKg: userWeight,
      };

      return { rows, metadata };
    }

    if (metric === 'ei') {
      const rawRows = await this.sensorDataService.getRecordSeriesMulti(
        activity.id,
        ['speed', 'power'],
        activity.timezone,
      );

      const rows = rawRows.map((r) => {
        const speed = Number(r.speed ?? 0);
        const power = Number(r.power ?? 0);
        const speedMPerMin = speed * 60;
        const value =
          Number.isFinite(speedMPerMin) &&
          Number.isFinite(power) &&
          speedMPerMin > 0 &&
          power > 0
            ? round(speedMPerMin / power, 2)
            : 0;
        return {
          time: r.time,
          distance: r.distance,
          ei: value,
        };
      }) as unknown as MultiMetricChartResult['rows'];

      const values = rows
        .map((r) => Number(r.ei))
        .filter((v) => Number.isFinite(v) && v > 0);

      let avg = 0;
      let max = 0;
      let min = 0;
      let sum = 0;

      if (values.length > 0) {
        sum = values.reduce((acc, v) => acc + v, 0);
        avg = sum / values.length;
        max = Math.max(...values);
        min = Math.min(...values);
      }

      const metadata: MultiMetricChartResult['metadata'] = {
        avg: round(avg, 2),
        max: round(max, 2),
        min: round(min, 2),
        sum: round(sum, 2),
        count: rows.length.toString(),
      };

      return { rows, metadata };
    }

    if (RUNNING_DYNAMICS_DERIVED_METRICS.has(metric)) {
      const sourceMetrics =
        metric === 'stepLength'
          ? ['stepLength', 'speed', 'cadence']
          : metric === 'verticalRatio'
            ? [
                'verticalRatio',
                'verticalOscillation',
                'stepLength',
                'speed',
                'cadence',
              ]
            : metric === 'totalSteps'
              ? ['totalCycles', 'cadence']
              : ['cadence', 'stanceTime', 'stanceTimePercent'];
      const sourceRows = (await this.sensorDataService.getRecordSeriesMulti(
        activity.id,
        sourceMetrics,
        activity.timezone,
      )) as RunningDynamicsSourceRow[];

      if (metric === 'stepLength') {
        const rows = sourceRows.flatMap((row) => {
          const value =
            positiveMetric(row.stepLength) ?? deriveStepLengthMm(row);
          return value === null
            ? []
            : [
                {
                  time: row.time,
                  distance: row.distance,
                  stepLength: round(value, 2),
                },
              ];
        }) as unknown as MultiMetricChartResult['rows'];
        return summarizeDerivedRows(rows, metric);
      }

      if (metric === 'verticalRatio') {
        const rows = sourceRows.flatMap((row) => {
          const recorded = positiveMetric(row.verticalRatio);
          const oscillation = positiveMetric(row.verticalOscillation);
          const stepLength =
            positiveMetric(row.stepLength) ?? deriveStepLengthMm(row);
          const value =
            recorded ??
            (oscillation !== null && stepLength !== null
              ? round((oscillation / stepLength) * 100, 2)
              : null);
          return value === null
            ? []
            : [
                {
                  time: row.time,
                  distance: row.distance,
                  verticalRatio: value,
                },
              ];
        }) as unknown as MultiMetricChartResult['rows'];
        return summarizeDerivedRows(rows, metric);
      }

      if (metric === 'totalSteps') {
        const recordedCycles = sourceRows
          .map((row) => positiveMetric(row.totalCycles))
          .filter((value): value is number => value !== null);
        if (recordedCycles.length > 0) {
          const rows = sourceRows.flatMap((row) => {
            const cycles = positiveMetric(row.totalCycles);
            return cycles === null
              ? []
              : [
                  {
                    time: row.time,
                    distance: row.distance,
                    totalSteps: round(cycles * 2, 0),
                  },
                ];
          }) as unknown as MultiMetricChartResult['rows'];
          const totalSteps = Math.max(...recordedCycles) * 2;
          return {
            rows,
            metadata: {
              avg: round(totalSteps, 0),
              min: 0,
              max: round(totalSteps, 0),
              sum: round(totalSteps, 0),
              count: rows.length.toString(),
              derived: 1,
              source: 'RECORDED_CYCLES',
            },
          };
        }

        let totalSteps = 0;
        const rows = sourceRows.flatMap((row, index) => {
          const cadence = positiveMetric(row.cadence);
          const currentTime = parseChartTimestamp(row.time);
          const nextTime = parseChartTimestamp(sourceRows[index + 1]?.time);
          if (cadence === null || currentTime === null || nextTime === null) {
            return [];
          }
          const intervalSeconds = (nextTime - currentTime) / 1000;
          // FIT 常见为 1 秒记录；最多接受 30 秒 smart recording 间隔。
          if (intervalSeconds <= 0 || intervalSeconds > 30) return [];
          totalSteps += ((cadence * 2) / 60) * intervalSeconds;
          return [
            {
              time: row.time,
              distance: row.distance,
              totalSteps: round(totalSteps, 2),
            },
          ];
        }) as unknown as MultiMetricChartResult['rows'];
        return {
          rows,
          metadata: {
            avg: round(totalSteps, 0),
            min: 0,
            max: round(totalSteps, 0),
            sum: round(totalSteps, 0),
            count: rows.length.toString(),
            derived: 1,
            source: 'CADENCE_INTEGRATION',
          },
        };
      }

      const rows = sourceRows.flatMap((row) => {
        const cadence = positiveMetric(row.cadence);
        const stanceTime = positiveMetric(row.stanceTime);
        const stanceTimePercent = positiveMetric(row.stanceTimePercent);
        if (
          cadence === null ||
          (stanceTime === null && stanceTimePercent === null)
        ) {
          return [];
        }
        // FIT 跑步 cadence 是 strides/min；展示步频时按 steps/min 计算。
        const stepDurationMs = 60_000 / (cadence * 2);
        const flightTime =
          stanceTime !== null
            ? Math.max(0, stepDurationMs - stanceTime)
            : stepDurationMs * (1 - Math.min(stanceTimePercent!, 100) / 100);
        const value =
          metric === 'flightTime'
            ? round(flightTime, 2)
            : stanceTimePercent !== null
              ? round(Math.max(0, 100 - stanceTimePercent), 2)
              : round((flightTime / stepDurationMs) * 100, 2);
        return [
          {
            time: row.time,
            distance: row.distance,
            [metric]: value,
          },
        ];
      }) as unknown as MultiMetricChartResult['rows'];
      return summarizeDerivedRows(rows, metric);
    }

    const rows = await this.sensorDataService.getRecordSeriesMulti(
      activity.id,
      [metric],
      activity.timezone,
    );

    // 2. 获取统计数据 (avg, max, min, sum)
    const stats = await this.sensorDataService.getRecordSeriesStats(
      activity.id,
      metric,
    );
    const metadata: MultiMetricChartResult['metadata'] = {
      avg: round(stats.avgValue, 2),
      max: round(stats.maxValue, 2),
      min: round(stats.minValue, 2),
      sum: round(stats.sumValue, 2),
      count: rows.length.toString(),
    };

    return { rows, metadata };
  }

  /**
   * 按单一 key（字段）返回 Activity 列表 + 元信息（avg/max/min/sum）
   * 支持时间范围与活动类型筛选
   */
  async getActivityMetricSummary(
    userId: string,
    key:
      | 'count'
      | 'distance'
      | 'speed'
      | 'duration'
      | 'power'
      | 'heartRate'
      | 'cadence'
      | 'time'
      | 'climb'
      | 'elevation'
      | 'energy'
      | 'calories'
      | 'hr',
    opts?: {
      timeRange?: { start: string; end: string };
      sportType?: 'all' | 'Cycling' | 'Run';
      agg?: 'avg' | 'max' | 'min';
    },
  ): Promise<{
    rows: Array<{ time: string; value: number }>;
    metadata: { avg?: string; max?: string; min?: string; sum?: string };
  }> {
    // 首页/统计页的 summary 图表用 activity 表聚合，不读取传感器明细，避免大范围时序扫描。
    const normalizedKey = (key || '').toLowerCase();

    const where: Prisma.ActivityWhereInput = {
      ...readyActivityWhere({ userId }),
    };
    const mappedSport = this.mapSportType(opts?.sportType);
    if (mappedSport) {
      where.sportType = mappedSport;
    }
    if (opts?.timeRange?.start && opts?.timeRange?.end) {
      where.startTime = {
        gte: new Date(opts.timeRange.start),
        lte: new Date(opts.timeRange.end),
      };
    }

    let baseRows: ActivitySummaryRow[] = [];
    // 统一使用 SQL 聚合，按天聚合
    const gran = 'day';
    const conds: string[] = ['"user_id" = $1', READY_ACTIVITY_SQL_PREDICATE];
    const params: ChartSqlParam[] = [userId];
    let p = 2;
    if (where.sportType) {
      conds.push('"sport_type" = $' + p++ + '::"enum_sport_type"');
      params.push(where.sportType as $Enums.SportType);
    }
    const startTimeFilter = where.startTime as
      | { gte?: Date; lte?: Date }
      | undefined;
    if (startTimeFilter?.gte && startTimeFilter?.lte) {
      conds.push('"start_time" BETWEEN $' + p + ' AND $' + (p + 1));
      params.push(startTimeFilter.gte, startTimeFilter.lte);
      p += 2;
    }

    const sql = `
        SELECT
          date_trunc('${gran}', "start_time") AS period,
          COUNT(*) AS activities,
          SUM("elapsed_time") AS duration,
          SUM("distance") AS distance,
          SUM("ascent") AS "totalAscent",
          SUM("calories") AS "totalCalories",
          AVG("avg_speed") AS "averageSpeed",
          AVG("avg_power") AS "averageWatts",
          AVG("avg_heart_rate") AS "averageHeartrate",
          AVG("avg_cadence") AS "avgCadence",
          MAX("max_speed") AS "maxSpeed",
          MAX("max_power") AS "maxPower",
          MAX("max_heart_rate") AS "maxHeartRate",
          MAX("max_cadence") AS "maxCadence",
          MIN("avg_speed") AS "minSpeed",
          MIN("avg_power") AS "minPower",
          MIN("avg_heart_rate") AS "minHeartRate",
          MIN("avg_cadence") AS "minCadence",
          MAX("elapsed_time") AS "maxDuration",
          MIN("elapsed_time") AS "minDuration",
          MAX("distance") AS "maxDistance",
          MIN("distance") AS "minDistance",
          MAX("ascent") AS "maxAscent",
          MIN("ascent") AS "minAscent",
          MAX("calories") AS "maxCalories",
          MIN("calories") AS "minCalories"
        FROM "t_activity"
        WHERE ${conds.join(' AND ')}
        GROUP BY 1
        ORDER BY 1 ASC
      `;
    // gran 和字段名来自受控枚举/常量；动态部分不要直接接收用户输入。
    // 打印 SQL 语句用于调试
    this.logger.debug(`执行 SQL 查询：${sql}，参数：${params}`);
    const sqlRows = (await this.prisma.$queryRawUnsafe(
      sql,
      ...params,
    )) as ActivitySummarySqlRow[];
    baseRows = sqlRows.map((r) => ({
      startTime: r.period ?? new Date(0),
      activities: Number(r.activities || 0),
      duration: Number(r.duration || 0),
      distance: Number(r.distance || 0),
      totalAscent: Number(r.totalAscent || 0),
      totalCalories: Number(r.totalCalories || 0),
      averageSpeed: Number(r.averageSpeed || 0),
      averageWatts: Number(r.averageWatts || 0),
      averageHeartrate: Number(r.averageHeartrate || 0),
      averageCadence: Number(r.avgCadence || 0),
      maxSpeed: Number(r.maxSpeed || 0),
      maxPower: Number(r.maxPower || 0),
      maxHeartRate: Number(r.maxHeartRate || 0),
      maxCadence: Number(r.maxCadence || 0),
      minSpeed: Number(r.minSpeed || 0),
      minPower: Number(r.minPower || 0),
      minHeartRate: Number(r.minHeartRate || 0),
      minCadence: Number(r.minCadence || 0),
      maxDuration: Number(r.maxDuration || 0),
      minDuration: Number(r.minDuration || 0),
      maxDistance: Number(r.maxDistance || 0),
      minDistance: Number(r.minDistance || 0),
      maxAscent: Number(r.maxAscent || 0),
      minAscent: Number(r.minAscent || 0),
      maxCalories: Number(r.maxCalories || 0),
      minCalories: Number(r.minCalories || 0),
    }));

    // 组装 { time, value }
    let rows = this.buildSummaryPoints(baseRows, normalizedKey);

    // 填充缺失的日期，为没有活动的日期生成值为0的数据点
    if (opts?.timeRange?.start && opts?.timeRange?.end) {
      rows = this.fillMissingDates(
        rows,
        opts.timeRange.start,
        opts.timeRange.end,
      );
    }

    // 取聚合（一次性拉齐所需字段）
    const agg = await this.activityRead.aggregate({
      _count: { _all: true },
      _sum: {
        elapsedTime: true,
        distance: true,
        ascent: true,
        calories: true,
        avgSpeed: true,
        avgPower: true,
        avgHeartRate: true,
        avgCadence: true,
      },
      _max: {
        maxSpeed: true,
        maxPower: true,
        maxHeartRate: true,
        maxCadence: true,
        elapsedTime: true,
        distance: true,
        ascent: true,
        calories: true,
      },
      _min: {
        maxSpeed: true,
        maxPower: true,
        maxHeartRate: true,
        maxCadence: true,
        elapsedTime: true,
        distance: true,
        ascent: true,
        calories: true,
      },
      where,
    });

    const count = Number(agg._count?._all || 0);
    const sumDuration = Number(agg._sum?.elapsedTime || 0);
    const sumDistance = Number(agg._sum?.distance || 0);
    const sumAscent = Number(agg._sum?.ascent || 0);
    const sumCalories = Number(agg._sum?.calories || 0);
    const sumAvgSpeed = Number(agg._sum?.avgSpeed || 0);
    const sumAvgPower = Number(agg._sum?.avgPower || 0);
    const sumAvgHR = Number(agg._sum?.avgHeartRate || 0);
    const sumAvgCadence = Number(agg._sum?.avgCadence || 0);

    const maxSpeed = Number(agg._max?.maxSpeed || 0);
    const minSpeed = Number(agg._min?.maxSpeed || 0);
    const maxPower = Number(agg._max?.maxPower || 0);
    const minPower = Number(agg._min?.maxPower || 0);
    const maxHR = Number(agg._max?.maxHeartRate || 0);
    const minHR = Number(agg._min?.maxHeartRate || 0);
    const maxCadence = Number(agg._max?.maxCadence || 0);
    const minCadence = Number(agg._min?.maxCadence || 0);
    const maxDuration = Number(agg._max?.elapsedTime || 0);
    const minDuration = Number(agg._min?.elapsedTime || 0);
    const maxDistance = Number(agg._max?.distance || 0);
    const minDistance = Number(agg._min?.distance || 0);
    const maxAscent = Number(agg._max?.ascent || 0);
    const minAscent = Number(agg._min?.ascent || 0);
    const maxCalories = Number(agg._max?.calories || 0);
    const minCalories = Number(agg._min?.calories || 0);

    const fmt3 = (v: unknown) =>
      v == null || Number.isNaN(Number(v)) ? '' : Number(v).toFixed(2);

    let metadata: { avg?: string; max?: string; min?: string; sum?: string } =
      {};
    switch (normalizedKey) {
      case 'count': {
        const c = count;
        metadata = { avg: fmt3(c), max: fmt3(c), min: fmt3(c), sum: fmt3(c) };
        break;
      }
      case 'duration':
      case 'time': {
        const avg = count > 0 ? sumDuration / count : 0;
        metadata = {
          avg: fmt3(avg),
          max: fmt3(maxDuration),
          min: fmt3(minDuration),
          sum: fmt3(sumDuration),
        };
        break;
      }
      case 'distance': {
        const avg = count > 0 ? sumDistance / count : 0;
        metadata = {
          avg: fmt3(avg),
          max: fmt3(maxDistance),
          min: fmt3(minDistance),
          sum: fmt3(sumDistance),
        };
        break;
      }
      case 'climb':
      case 'elevation': {
        const avg = count > 0 ? sumAscent / count : 0;
        metadata = {
          avg: fmt3(avg),
          max: fmt3(maxAscent),
          min: fmt3(minAscent),
          sum: fmt3(sumAscent),
        };
        break;
      }
      case 'energy':
      case 'calories': {
        const avg = count > 0 ? sumCalories / count : 0;
        metadata = {
          avg: fmt3(avg),
          max: fmt3(maxCalories),
          min: fmt3(minCalories),
          sum: fmt3(sumCalories),
        };
        break;
      }
      case 'speed': {
        const avg = count > 0 ? sumAvgSpeed / count : 0;
        metadata = {
          avg: fmt3(avg),
          max: fmt3(maxSpeed),
          min: fmt3(minSpeed),
          sum: fmt3(sumAvgSpeed),
        };
        break;
      }
      case 'power': {
        const avg = count > 0 ? sumAvgPower / count : 0;
        metadata = {
          avg: fmt3(avg),
          max: fmt3(maxPower),
          min: fmt3(minPower),
          sum: fmt3(sumAvgPower),
        };
        break;
      }
      case 'heartrate':
      case 'hr': {
        const avg = count > 0 ? sumAvgHR / count : 0;
        metadata = {
          avg: fmt3(avg),
          max: fmt3(maxHR),
          min: fmt3(minHR),
          sum: fmt3(sumAvgHR),
        };
        break;
      }
      case 'cadence': {
        const avg = count > 0 ? sumAvgCadence / count : 0;
        metadata = {
          avg: fmt3(avg),
          max: fmt3(maxCadence),
          min: fmt3(minCadence),
          sum: fmt3(sumAvgCadence),
        };
        break;
      }
      default:
        throw new BadRequestException(`Unsupported key: ${key}`);
    }

    return { rows, metadata };
  }

  /**
   * 按模式（day/week/month/year）返回聚合数据行
   */
  async getChartRowsByMode(
    userId: string,
    key:
      | 'count'
      | 'distance'
      | 'speed'
      | 'duration'
      | 'power'
      | 'heartRate'
      | 'cadence'
      | 'time'
      | 'climb'
      | 'elevation'
      | 'energy'
      | 'calories'
      | 'hr',
    opts: {
      mode: 'day' | 'week' | 'month' | 'year';
      end: string;
      days?: number;
      sportType?: 'all' | 'Cycling' | 'Run';
    },
  ): Promise<Array<{ time: string; value: number }>> {
    // 日粒度允许调用方选择窗口；其余粒度沿用固定窗口。
    const normalizedKey = (key || '').toLowerCase();
    const { mode, end } = opts;
    const endDate = dayjs(end);
    let startDate = endDate;
    const gran = mode;

    switch (mode) {
      case 'day':
        startDate = endDate
          .subtract(
            Math.min(90, Math.max(1, Math.round(opts.days ?? 30))) - 1,
            'day',
          )
          .startOf('day');
        break;
      case 'week':
        startDate = endDate.subtract(7, 'week').startOf('isoWeek');
        break;
      case 'month':
        startDate = endDate.subtract(11, 'month').startOf('month');
        break;
      case 'year':
        startDate = endDate.subtract(4, 'year').startOf('year');
        break;
    }

    const where: Prisma.ActivityWhereInput = { userId };
    const mappedSport = this.mapSportType(opts?.sportType);
    if (mappedSport) {
      where.sportType = mappedSport;
    }

    where.startTime = {
      gte: startDate.startOf('day').toDate(),
      lte: endDate.endOf('day').toDate(),
    };

    const conds: string[] = ['"user_id" = $1', READY_ACTIVITY_SQL_PREDICATE];
    const params: ChartSqlParam[] = [userId];
    let p = 2;
    if (where.sportType) {
      conds.push('"sport_type" = $' + p++ + '::"enum_sport_type"');
      params.push(where.sportType as $Enums.SportType);
    }
    const range = where.startTime as { gte: Date; lte: Date };
    conds.push('"start_time" BETWEEN $' + p + ' AND $' + (p + 1));
    params.push(range.gte, range.lte);
    p += 2;

    // 虽然 aggType 确定了，但 SQL 查询还是查出所有聚合字段，后续 map 时再取
    const sql = `
      SELECT
        date_trunc('${gran}', "start_time") AS period,
        COUNT(*) AS activities,
        SUM("elapsed_time") AS duration,
        SUM("distance") AS distance,
        SUM("ascent") AS "totalAscent",
        SUM("calories") AS "totalCalories",
        AVG("avg_speed") AS "averageSpeed",
        AVG("avg_power") AS "averageWatts",
        AVG("avg_heart_rate") AS "averageHeartrate",
        AVG("avg_cadence") AS "avgCadence"
      FROM "t_activity"
      WHERE ${conds.join(' AND ')}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    this.logger.debug(`执行图表行 SQL 查询：${sql}，参数：${params}`);
    const sqlRows = (await this.prisma.$queryRawUnsafe(
      sql,
      ...params,
    )) as ActivitySummarySqlRow[];

    const baseRows: ActivitySummaryRow[] = sqlRows.map((r) => ({
      startTime: r.period ?? new Date(0),
      activities: Number(r.activities || 0),
      duration: Number(r.duration || 0),
      distance: Number(r.distance || 0),
      totalAscent: Number(r.totalAscent || 0),
      totalCalories: Number(r.totalCalories || 0),
      averageSpeed: Number(r.averageSpeed || 0),
      averageWatts: Number(r.averageWatts || 0),
      averageHeartrate: Number(r.averageHeartrate || 0),
      averageCadence: Number(r.avgCadence || 0),
    }));

    let rows = this.buildSummaryPoints(baseRows, normalizedKey);

    rows = this.fillMissingTimePoints(
      rows,
      startDate.toISOString(),
      endDate.toISOString(),
      gran,
    );

    return rows;
  }

  /**
   * 按模式（day/week/month/year）返回聚合元数据
   */
  async getChartMetadataByMode(
    userId: string,
    key:
      | 'count'
      | 'distance'
      | 'speed'
      | 'duration'
      | 'power'
      | 'heartRate'
      | 'cadence'
      | 'time'
      | 'climb'
      | 'elevation'
      | 'energy'
      | 'calories'
      | 'hr',
    opts: {
      mode: 'day' | 'week' | 'month' | 'year';
      end: string;
      sportType?: 'all' | 'Cycling' | 'Run';
    },
  ): Promise<{ avg?: string; max?: string; min?: string; sum?: string }> {
    const { mode, end } = opts;
    const endDate = dayjs(end);
    let startDate = endDate;

    // 根据模式确定统计的起始时间（只统计最新的一个周期）
    switch (mode) {
      case 'day':
        startDate = endDate.startOf('day');
        break;
      case 'week':
        startDate = endDate.startOf('isoWeek');
        break;
      case 'month':
        startDate = endDate.startOf('month');
        break;
      case 'year':
        startDate = endDate.startOf('year');
        break;
    }

    const where: Prisma.ActivityWhereInput = {
      ...readyActivityWhere({ userId }),
    };
    const mappedSport = this.mapSportType(opts?.sportType);
    if (mappedSport) {
      where.sportType = mappedSport;
    }

    where.startTime = {
      gte: startDate.startOf('day').toDate(),
      lte: endDate.endOf('day').toDate(),
    };

    const aggResult = await this.activityRead.aggregate({
      _count: { _all: true },
      _sum: {
        elapsedTime: true,
        distance: true,
        ascent: true,
        calories: true,
      },
      _avg: {
        avgSpeed: true,
        avgPower: true,
        avgHeartRate: true,
        avgCadence: true,
      },
      where,
    });

    const count = Number(aggResult._count?._all || 0);
    const sumDuration = Number(aggResult._sum?.elapsedTime || 0);
    const sumDistance = Number(aggResult._sum?.distance || 0);
    const sumAscent = Number(aggResult._sum?.ascent || 0);
    const sumCalories = Number(aggResult._sum?.calories || 0);

    // 使用 _avg 获取平均值（Activity 级别的平均）
    const avgSpeed = Number(aggResult._avg?.avgSpeed || 0);
    const avgPower = Number(aggResult._avg?.avgPower || 0);
    const avgHR = Number(aggResult._avg?.avgHeartRate || 0);
    const avgCadence = Number(aggResult._avg?.avgCadence || 0);

    const fmt3 = (v: unknown) =>
      v == null || Number.isNaN(Number(v)) ? '' : Number(v).toFixed(2);

    const normalizedKey = (key || '').toLowerCase();
    let metadata: { avg?: string; max?: string; min?: string; sum?: string } =
      {};

    switch (normalizedKey) {
      case 'count': {
        metadata = {
          sum: fmt3(count),
        };
        break;
      }
      case 'duration':
      case 'time': {
        metadata = {
          sum: fmt3(sumDuration),
        };
        break;
      }
      case 'distance': {
        metadata = {
          sum: fmt3(sumDistance),
        };
        break;
      }
      case 'climb':
      case 'elevation': {
        metadata = {
          sum: fmt3(sumAscent),
        };
        break;
      }
      case 'energy':
      case 'calories': {
        metadata = {
          sum: fmt3(sumCalories),
        };
        break;
      }
      case 'speed': {
        metadata = {
          avg: fmt3(avgSpeed),
        };
        break;
      }
      case 'power': {
        metadata = {
          avg: fmt3(avgPower),
        };
        break;
      }
      case 'heartrate':
      case 'hr': {
        metadata = {
          avg: fmt3(avgHR),
        };
        break;
      }
      case 'cadence': {
        metadata = {
          avg: fmt3(avgCadence),
        };
        break;
      }
      default:
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: this.i18n.t('common.error.unsupported_key'),
        });
    }

    return metadata;
  }
  /**
   * 获取周摘要对
   * @param userId
   * @param opts
   * @returns
   */
  async getWeeklySummaryPair(
    userId: string,
    opts: { end: string; sportType?: string },
  ): Promise<
    Record<
      | 'weekPressure'
      | 'weekCount'
      | 'weekDuration'
      | 'weekDistance'
      | 'weekSpeed'
      | 'weekPower'
      | 'weekHeartRate'
      | 'weekClimb'
      | 'weekCalories',
      { current: number; previous: number }
    >
  > {
    const end = dayjs(opts.end);
    const safeEnd = end.isValid() ? end : dayjs();
    const currentEnd = safeEnd.endOf('isoWeek');
    const prevEnd = currentEnd.subtract(1, 'week').endOf('isoWeek');

    type WeeklyPairKey =
      | 'weekPressure'
      | 'weekCount'
      | 'weekDuration'
      | 'weekDistance'
      | 'weekSpeed'
      | 'weekPower'
      | 'weekHeartRate'
      | 'weekClimb'
      | 'weekCalories';
    const result: Record<WeeklyPairKey, { current: number; previous: number }> =
      {
        weekPressure: { current: 0, previous: 0 },
        weekCount: { current: 0, previous: 0 },
        weekDuration: { current: 0, previous: 0 },
        weekDistance: { current: 0, previous: 0 },
        weekSpeed: { current: 0, previous: 0 },
        weekPower: { current: 0, previous: 0 },
        weekHeartRate: { current: 0, previous: 0 },
        weekClimb: { current: 0, previous: 0 },
        weekCalories: { current: 0, previous: 0 },
      };

    const mappedSport = this.mapSportType(opts?.sportType);
    const summarizeWeek = async (weekEnd: dayjs.Dayjs) => {
      const where: Prisma.ActivityWhereInput = {
        ...readyActivityWhere({ userId }),
        startTime: {
          gte: weekEnd.startOf('isoWeek').startOf('day').toDate(),
          lte: weekEnd.endOf('day').toDate(),
        },
      };
      if (mappedSport) where.sportType = mappedSport;

      const aggregate = await this.activityRead.aggregate({
        _count: { _all: true },
        _sum: {
          elapsedTime: true,
          distance: true,
          ascent: true,
          calories: true,
        },
        _avg: {
          avgSpeed: true,
          avgPower: true,
          avgHeartRate: true,
        },
        where,
      });

      return {
        weekCount: Number(aggregate._count?._all ?? 0),
        weekDuration: Number(aggregate._sum?.elapsedTime ?? 0),
        weekDistance: Number(aggregate._sum?.distance ?? 0),
        weekSpeed: Number(aggregate._avg?.avgSpeed ?? 0),
        weekPower: Number(aggregate._avg?.avgPower ?? 0),
        weekHeartRate: Number(aggregate._avg?.avgHeartRate ?? 0),
        weekClimb: Number(aggregate._sum?.ascent ?? 0),
        weekCalories: Number(aggregate._sum?.calories ?? 0),
      };
    };

    // weekPressure 来自 PMC 的聚合字段（按运动类型选 running/cycling/swimming/daily）
    const pickPressureField = () => {
      if (mappedSport === $Enums.SportType.RUN) return 'runningValue' as const;
      if (mappedSport === $Enums.SportType.CYCLING)
        return 'cyclingValue' as const;
      if (mappedSport === $Enums.SportType.SWIM)
        return 'swimmingValue' as const;
      return 'dailyValue' as const;
    };
    const field = pickPressureField();

    const sumWeekPressure = async (start: dayjs.Dayjs, end: dayjs.Dayjs) => {
      const sums = await this.pmc.sumLoadBySport(
        userId,
        start.startOf('day').toDate(),
        end.endOf('day').toDate(),
      );
      const raw = sums[field];
      const v = Number(raw ?? 0);
      return Number.isFinite(v) ? v : 0;
    };

    const [current, previous, currentPressure, prevPressure] =
      await Promise.all([
        summarizeWeek(currentEnd),
        summarizeWeek(prevEnd),
        sumWeekPressure(currentEnd.startOf('isoWeek'), currentEnd),
        sumWeekPressure(prevEnd.startOf('isoWeek'), prevEnd),
      ]);

    for (const key of Object.keys(current) as Array<keyof typeof current>) {
      const currentValue = current[key];
      const previousValue = previous[key];
      result[key] = {
        current: Number.isFinite(currentValue) ? currentValue : 0,
        previous: Number.isFinite(previousValue) ? previousValue : 0,
      };
    }

    result.weekPressure = { current: currentPressure, previous: prevPressure };

    return result;
  }

  /**
   * 填补缺失的时间点
   */
  private fillMissingTimePoints(
    rows: Array<{ time: string; value: number }>,
    startDate: string,
    endDate: string,
    granularity: 'day' | 'week' | 'month' | 'year',
  ): Array<{ time: string; value: number }> {
    const start = dayjs(startDate);
    const end = dayjs(endDate);

    // Normalize existing rows to start of granularity
    const existingDates = new Map<string, { time: string; value: number }>();
    rows.forEach((row) => {
      let t = dayjs(row.time);
      if (granularity === 'week') t = t.startOf('isoWeek');
      else t = t.startOf(granularity);
      existingDates.set(t.toISOString(), row);
    });

    const filledRows: Array<{ time: string; value: number }> = [];
    let current = start;
    if (granularity === 'week') current = current.startOf('isoWeek');
    else current = current.startOf(granularity);

    while (current.isBefore(end) || current.isSame(end)) {
      const key = current.toISOString();
      const existingRow = existingDates.get(key);

      if (existingRow) {
        filledRows.push(existingRow);
      } else {
        filledRows.push({
          time: key,
          value: 0,
        });
      }

      current = current.add(1, granularity);
    }

    return filledRows;
  }

  /**
   * 填补缺失的日期
   * @param rows
   * @param startDate
   * @param endDate
   * @returns
   */
  private fillMissingDates(
    rows: Array<{ time: string; value: number }>,
    startDate: string,
    endDate: string,
  ): Array<{ time: string; value: number }> {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const existingDates = new Map(
      rows.map((row) => [row.time.split('T')[0], row]),
    );
    const filledRows: Array<{ time: string; value: number }> = [];

    // 生成完整的日期序列
    const currentDate = new Date(start);
    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const existingRow = existingDates.get(dateStr);

      if (existingRow) {
        filledRows.push(existingRow);
      } else {
        // 为缺失的日期生成值为0的数据点
        filledRows.push({
          time: new Date(
            currentDate.getFullYear(),
            currentDate.getMonth(),
            currentDate.getDate(),
          ).toISOString(),
          value: 0,
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return filledRows;
  }

  private buildSummaryPoints(
    baseRows: ActivitySummaryRow[],
    normalizedKey: string,
  ): Array<{ time: string; value: number }> {
    const mapValue = (row: ActivitySummaryRow): number | undefined => {
      // 根据key和聚合类型选择对应的字段
      switch (normalizedKey) {
        case 'count': {
          const c = Number(row?.activities ?? 1);
          return Number.isFinite(c) ? c : 1;
        }
        case 'duration':
          return Number(row?.duration);
        case 'time':
          return Number(row?.duration);
        case 'distance':
          return Number(row?.distance);
        case 'climb':
        case 'elevation':
          return Number(row?.totalAscent);
        case 'energy':
        case 'calories':
          return Number(row?.totalCalories);
        case 'speed':
          return Number(row?.averageSpeed);
        case 'power':
          return Number(row?.averageWatts);
        case 'heartrate':
        case 'hr':
          return Number(row?.averageHeartrate);
        case 'cadence':
          return Number(row?.averageCadence);
        default:
          return undefined;
      }
    };

    return (baseRows || [])
      .map((r) => {
        const iso =
          r?.startTime instanceof Date
            ? r.startTime.toISOString()
            : new Date(r?.startTime).toISOString();
        const val = mapValue(r);
        if (val == null || Number.isNaN(Number(val))) return undefined;
        const value = Number(Number(val).toFixed(2));
        return { time: iso, value } as { time: string; value: number };
      })
      .filter(Boolean) as Array<{ time: string; value: number }>;
  }

  private mapSportType(
    val?: string | $Enums.SportType,
  ): $Enums.SportType | undefined {
    if (!val || val === 'all') return undefined;
    const raw = typeof val === 'string' ? val : val;
    const normalized =
      typeof raw === 'string' ? raw.toUpperCase().replace(/[\s-]/g, '_') : raw;
    if (typeof normalized !== 'string') return normalized;

    if (
      Object.values($Enums.SportType).includes(normalized as $Enums.SportType)
    ) {
      return normalized as $Enums.SportType;
    }

    const mappings: Record<string, $Enums.SportType> = {
      CYCLING: $Enums.SportType.CYCLING,
      RIDE: $Enums.SportType.CYCLING,
      BIKE: $Enums.SportType.CYCLING,
      BIKING: $Enums.SportType.CYCLING,
      RUN: $Enums.SportType.RUN,
      RUNNING: $Enums.SportType.RUN,
      WALK: $Enums.SportType.RUN,
      WALKING: $Enums.SportType.RUN,
      HIKE: $Enums.SportType.RUN,
      SWIM: $Enums.SportType.SWIM,
      SWIMMING: $Enums.SportType.SWIM,
    };

    return mappings[normalized] ?? $Enums.SportType.UNKNOWN;
  }
}
