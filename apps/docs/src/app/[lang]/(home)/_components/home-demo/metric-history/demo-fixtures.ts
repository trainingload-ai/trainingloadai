import type { FitnessMetricKey } from "./types";

const DAY_LABELS = Array.from({ length: 30 }, (_, index) => {
  const day = 5 + index;
  return day <= 30 ? `5/${day}` : `6/${day - 30}`;
});

function buildTrend(base: number, drift: number, noise = 2) {
  return DAY_LABELS.map((_, index) => {
    const wave = Math.sin(index / 4) * noise;
    return Math.round(base + index * drift + wave);
  });
}

const METRIC_CHART_CONFIG: Record<
  FitnessMetricKey,
  { label: string; color: string; values: number[] }
> = {
  atl: {
    label: "ATL",
    color: "#8b5cf6",
    values: buildTrend(62, 0.45, 3),
  },
  ctl: {
    label: "CTL",
    color: "#0ea5e9",
    values: buildTrend(58, 0.35, 2),
  },
  tsb: {
    label: "TSB",
    color: "#94a3b8",
    values: DAY_LABELS.map((_, index) => Math.round(-8 + index * 0.15 + Math.cos(index / 3) * 2)),
  },
  vo2Max: {
    label: "VO2 Max",
    color: "#ef4444",
    values: buildTrend(51, 0.08, 0.6),
  },
  intensity: {
    label: "Training Strain",
    color: "#f43f5e",
    values: buildTrend(520, 4.5, 18),
  },
  restDays: {
    label: "Rest days",
    color: "#6366f1",
    values: DAY_LABELS.map((_, index) => Math.max(0, 3 - Math.floor(index / 8))),
  },
};

export function getMetricHistoryChartFixture(key: FitnessMetricKey) {
  const config = METRIC_CHART_CONFIG[key];
  return {
    labels: DAY_LABELS,
    series: [
      {
        key,
        label: config.label,
        color: config.color,
        values: config.values,
      },
    ],
  };
}

export function buildMetricDocsLink(
  key: FitnessMetricKey,
  title: string,
  lang: string,
  aboutMetricLabel: string,
): { label: string; href: string } {
  const docsLocale = lang.startsWith("zh") ? "zh" : "en";
  const href =
    key === "vo2Max"
      ? `https://www.trainingload.ai/${docsLocale}/docs/metrics/maximal-oxygen-uptake`
      : `https://www.trainingload.ai/${docsLocale}/docs/metrics`;

  return {
    label: aboutMetricLabel.replace("{title}", title),
    href,
  };
}
