import dayjs from "dayjs";
import type { SummaryMetricKey } from "@/api/charts";
import { SportType as ApiSportType } from "@/api/activities";
import type { UserFitnessMetricType } from "@/api/settings";
import { getMetricColor } from "@/lib/chart-data-utils";
import type {
  HistoryItem,
  ManualMetricSegment,
  MetricKey,
} from "./metric-history-chart-types";

// MetricKey 到数据字段和颜色的唯一映射，图表层只按 dataKey 取值。
export const METRIC_HISTORY_CONFIG: Record<
  MetricKey,
  { color: string; dataKey: keyof HistoryItem }
> = {
  atl: { color: getMetricColor("atl"), dataKey: "fatigue" },
  ctl: { color: getMetricColor("ctl"), dataKey: "fitness" },
  tsb: { color: getMetricColor("tsb"), dataKey: "form" },
  vo2Max: { color: getMetricColor("vo2Max"), dataKey: "value" },
  paceZones: { color: getMetricColor("tp"), dataKey: "value" },
  acRatio: { color: getMetricColor("acRatio"), dataKey: "acRatio" },
  monotony: { color: getMetricColor("monotony"), dataKey: "monotony" },
  intensity: { color: getMetricColor("intensity"), dataKey: "intensity" },
  ftp: { color: getMetricColor("ftp"), dataKey: "value" },
  cp: { color: getMetricColor("cp"), dataKey: "value" },
  pMax: { color: getMetricColor("pMax"), dataKey: "value" },
  tp: { color: getMetricColor("tp"), dataKey: "value" },
  cs: { color: getMetricColor("cs"), dataKey: "value" },
  maxHr: { color: getMetricColor("maxHr"), dataKey: "value" },
  restingHr: { color: getMetricColor("restingHr"), dataKey: "value" },
  lthr: { color: getMetricColor("lthr"), dataKey: "value" },
  weekPressure: { color: getMetricColor("weekPressure"), dataKey: "value" },
  weekCount: { color: getMetricColor("weekCount"), dataKey: "value" },
  weekDuration: { color: getMetricColor("weekDuration"), dataKey: "value" },
  weekDistance: { color: getMetricColor("weekDistance"), dataKey: "value" },
  weekSpeed: { color: getMetricColor("weekSpeed"), dataKey: "value" },
  weekPower: { color: getMetricColor("weekPower"), dataKey: "value" },
  weekHeartRate: { color: getMetricColor("weekHeartRate"), dataKey: "value" },
  weekClimb: { color: getMetricColor("weekClimb"), dataKey: "value" },
  weekCalories: { color: getMetricColor("weekCalories"), dataKey: "value" },
};

export function isFitnessMetricKey(metricKey: MetricKey) {
  // 这些指标来自用户手工维护的体能记录，不走 PMC/周汇总历史接口。
  return (
    metricKey === "ftp" ||
    metricKey === "cp" ||
    metricKey === "pMax" ||
    metricKey === "tp" ||
    metricKey === "cs" ||
    metricKey === "maxHr" ||
    metricKey === "restingHr" ||
    metricKey === "lthr"
  );
}

export function getFitnessMetricType(
  metricKey: MetricKey,
): UserFitnessMetricType {
  // 前端展示 key 与后端枚举名大小写不同，统一在模型层转换。
  switch (metricKey) {
    case "ftp":
      return "FTP";
    case "cp":
      return "CP";
    case "pMax":
      return "P_MAX";
    case "tp":
      return "TP";
    case "cs":
      return "CS";
    case "maxHr":
      return "MAX_HR";
    case "restingHr":
      return "RESTING_HR";
    default:
      return "LTHR";
  }
}

export function getWeeklySummaryQueryKey(
  metricKey: MetricKey,
): SummaryMetricKey {
  // 周汇总指标名和后端 summary key 不完全一致，在这里统一转换。
  switch (metricKey) {
    case "weekCount":
      return "count";
    case "weekDuration":
      return "duration";
    case "weekDistance":
      return "distance";
    case "weekSpeed":
      return "speed";
    case "weekPower":
      return "power";
    case "weekHeartRate":
      return "heartRate";
    case "weekClimb":
      return "climb";
    default:
      return "calories";
  }
}

export function getPmcSportValue(
  row: {
    value: number;
    running?: number;
    cycling?: number;
    swimming?: number;
  },
  sportType: ApiSportType,
) {
  // PMC 行既有总值也有分运动值；按当前 sportType 决定展示哪条序列。
  if (sportType === ApiSportType.RUN) return Number(row.running || 0);
  if (sportType === ApiSportType.CYCLING) return Number(row.cycling || 0);
  if (sportType === ApiSportType.SWIM) return Number(row.swimming || 0);
  return Number(row.value || 0);
}

export function buildManualMetricSegments(args: {
  endDate: dayjs.Dayjs;
  manualRows:
    | Array<{
        recordedAt: string;
        value: number;
      }>
    | undefined;
  startDate: dayjs.Dayjs;
}) {
  // 手工体能指标是阶梯线：某次记录值一直延续到下一次记录或窗口结束。
  const { endDate, manualRows, startDate } = args;
  if (!manualRows || manualRows.length === 0) return undefined;

  const startSec = startDate.valueOf() / 1000;
  const endSec = endDate.valueOf() / 1000;
  const points = manualRows
    .map((row) => ({
      t: dayjs(row.recordedAt).valueOf() / 1000,
      v: row.value,
    }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v))
    .sort((a, b) => a.t - b.t);
  if (points.length === 0) return undefined;

  const segments: ManualMetricSegment[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    const segmentStart = Math.max(current.t, startSec);
    const segmentEnd = Math.min(next ? next.t : endSec, endSec);
    if (segmentEnd <= startSec) continue;
    if (segmentStart >= endSec) continue;
    if (segmentEnd <= segmentStart) continue;
    segments.push({
      start: segmentStart,
      end: segmentEnd,
      value: current.v,
    });
  }

  return segments.length > 0 ? segments : undefined;
}
