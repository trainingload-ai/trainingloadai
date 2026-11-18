import { palette as tokenPalette } from '@trainingloadai/design-tokens/colors';
import { formatValue } from "@/hooks/useFormatterBySettings";
import type { SummaryMetricKey } from "@/api/charts";
import type { MetricKey, RangeDays } from "./metric-history-chart-types";

type TranslateFn = (key: string) => string;

export type MetricZone = {
  y1: number;
  y2: number;
  fill: string;
  fillOpacity: number;
  label: string;
  labelFill: string;
  labelPosition: "insideTopRight" | "insideBottomRight";
};

export function getWeeklySummaryMetricKey(metricKey: MetricKey): SummaryMetricKey {
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

export function formatWeeklyMetricValue(args: {
  integerFormatter: Intl.NumberFormat;
  metricKey: MetricKey;
  systemUnit: "metric" | "imperial";
  value: number;
}) {
  if (!Number.isFinite(args.value)) return "--";
  if (args.metricKey === "weekPressure") {
    return args.integerFormatter.format(Math.round(args.value));
  }
  return formatValue(
    args.value,
    getWeeklySummaryMetricKey(args.metricKey),
    args.systemUnit,
  );
}

export function formatMetricRangeLabel(args: {
  days: RangeDays;
  isWeeklyMetric: boolean;
  locale: string;
  t: TranslateFn;
}) {
  if (args.isWeeklyMetric) {
    if (args.locale.startsWith("zh")) return `${args.days}周`;
    return `${args.days} wk`;
  }

  const unit = args.t("restDays.unit");
  if (args.locale.startsWith("zh")) return `${args.days}${unit}`;
  return `${args.days} ${unit}`;
}

export function buildMetricZones(args: {
  dataMax: number;
  dataMin: number;
  metricKey: MetricKey;
  t: TranslateFn;
}): MetricZone[] {
  const { dataMax, dataMin, metricKey, t } = args;

  if (metricKey === "acRatio") {
    return [
      {
        y1: 0,
        y2: 0.8,
        fill: tokenPalette["sky-500"],
        fillOpacity: 0.1,
        label: t("acRatio.status.low"),
        labelFill: tokenPalette["sky-500"],
        labelPosition: "insideBottomRight",
      },
      {
        y1: 0.8,
        y2: 1.3,
        fill: tokenPalette["emerald-500"],
        fillOpacity: 0.1,
        label: t("acRatio.status.optimal"),
        labelFill: tokenPalette["emerald-500"],
        labelPosition: "insideTopRight",
      },
      {
        y1: 1.3,
        y2: 1.5,
        fill: tokenPalette["amber-500"],
        fillOpacity: 0.1,
        label: t("acRatio.status.high"),
        labelFill: tokenPalette["amber-500"],
        labelPosition: "insideTopRight",
      },
      {
        y1: 1.5,
        y2: Math.max(dataMax * 1.1, 2.0),
        fill: tokenPalette["red-500"],
        fillOpacity: 0.1,
        label: t("acRatio.status.danger"),
        labelFill: tokenPalette["red-500"],
        labelPosition: "insideTopRight",
      },
    ];
  }

  if (metricKey === "tsb") {
    return [
      {
        y1: 25,
        y2: Math.max(dataMax * 1.1, 40),
        fill: tokenPalette["amber-500"],
        fillOpacity: 0.1,
        label: t("tsb.status.transition"),
        labelFill: tokenPalette["amber-500"],
        labelPosition: "insideTopRight",
      },
      {
        y1: 15,
        y2: 25,
        fill: tokenPalette["violet-500"],
        fillOpacity: 0.1,
        label: t("tsb.status.peak"),
        labelFill: tokenPalette["violet-500"],
        labelPosition: "insideTopRight",
      },
      {
        y1: 5,
        y2: 15,
        fill: tokenPalette["sky-500"],
        fillOpacity: 0.1,
        label: t("tsb.status.fresh"),
        labelFill: tokenPalette["sky-500"],
        labelPosition: "insideTopRight",
      },
      {
        y1: -10,
        y2: 5,
        fill: tokenPalette["slate-300"],
        fillOpacity: 0.1,
        label: t("tsb.status.neutral"),
        labelFill: tokenPalette["slate-400"],
        labelPosition: "insideTopRight",
      },
      {
        y1: -30,
        y2: -10,
        fill: tokenPalette["emerald-500"],
        fillOpacity: 0.1,
        label: t("tsb.status.optimal"),
        labelFill: tokenPalette["emerald-500"],
        labelPosition: "insideBottomRight",
      },
      {
        y1: Math.min(dataMin * 1.1, -50),
        y2: -30,
        fill: tokenPalette["red-500"],
        fillOpacity: 0.1,
        label: t("tsb.status.highRisk"),
        labelFill: tokenPalette["red-500"],
        labelPosition: "insideBottomRight",
      },
    ];
  }

  if (metricKey === "monotony") {
    return [
      {
        y1: 0,
        y2: 0.6,
        fill: tokenPalette["emerald-500"],
        fillOpacity: 0.1,
        label: t("monotony.status.low"),
        labelFill: tokenPalette["emerald-500"],
        labelPosition: "insideBottomRight",
      },
      {
        y1: 0.6,
        y2: 0.8,
        fill: tokenPalette["amber-500"],
        fillOpacity: 0.1,
        label: t("monotony.status.moderate"),
        labelFill: tokenPalette["amber-500"],
        labelPosition: "insideTopRight",
      },
      {
        y1: 0.8,
        y2: Math.max(dataMax * 1.1, 1.2),
        fill: tokenPalette["red-500"],
        fillOpacity: 0.1,
        label: t("monotony.status.high"),
        labelFill: tokenPalette["red-500"],
        labelPosition: "insideTopRight",
      },
    ];
  }

  if (metricKey === "intensity") {
    return [
      {
        y1: 0,
        y2: 600,
        fill: tokenPalette["sky-500"],
        fillOpacity: 0.1,
        label: t("intensity.status.low"),
        labelFill: tokenPalette["sky-500"],
        labelPosition: "insideBottomRight",
      },
      {
        y1: 600,
        y2: 1000,
        fill: tokenPalette["emerald-500"],
        fillOpacity: 0.1,
        label: t("intensity.status.optimal"),
        labelFill: tokenPalette["emerald-500"],
        labelPosition: "insideTopRight",
      },
      {
        y1: 1000,
        y2: Math.max(dataMax * 1.1, 1500),
        fill: tokenPalette["red-500"],
        fillOpacity: 0.1,
        label: t("intensity.status.high"),
        labelFill: tokenPalette["red-500"],
        labelPosition: "insideTopRight",
      },
    ];
  }

  return [];
}

export function getMetricYRange(args: {
  max: number;
  metricKey: MetricKey;
  min: number;
}): [number, number] {
  const { max, metricKey, min } = args;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];

  const span = Math.max(1e-6, max - min);
  switch (metricKey) {
    case "tsb":
      return [Math.min(-30, min - 5), Math.max(25, max + 5)];
    case "monotony":
    case "acRatio":
      return [Math.min(0, min), Math.max(max + span * 0.1, 2.0)];
    case "intensity":
      return [0, Math.max(max + span * 0.1, 1500)];
    case "tp":
    case "cs":
      return [Math.max(0, min - 30), max + 30];
    case "maxHr":
    case "restingHr":
    case "lthr":
      return [Math.max(0, Math.floor(min) - 5), Math.ceil(max) + 5];
    case "weekPressure":
    case "weekCount":
    case "weekDuration":
    case "weekDistance":
    case "weekSpeed":
    case "weekPower":
    case "weekHeartRate":
    case "weekClimb":
    case "weekCalories":
      return [0, max + span * 0.1];
    default:
      return [Math.max(0, min - span * 0.1), max + span * 0.1];
  }
}
