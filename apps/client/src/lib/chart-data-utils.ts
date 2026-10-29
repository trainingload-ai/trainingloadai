import uPlot from "uplot";

/**
 * Calculate dynamic interval based on total duration and target count.
 * Ensures the chart doesn't become too sparse or too crowded.
 *
 * @param totalDuration Total duration in seconds
 * @param targetCount Target number of bars/points (default: 60)
 * @returns Interval in seconds
 */
export const calculateDynamicInterval = (
  totalDuration: number,
  targetCount: number = 60,
): number => {
  if (totalDuration <= 0) return 60;
  // Calculate raw interval
  const rawInterval = totalDuration / targetCount;
  // Round to integer
  return Math.ceil(rawInterval);
};

/**
 * Aggregate metric data by time interval.
 * Calculates min, max, and average values for each interval.
 *
 * @param rows Array of data points containing time, distance, and metric info
 * @param interval Time interval in seconds
 * @param metric Metric key or extractor function
 * @returns Aggregated data points
 */
export const aggregateMetricData = (
  rows: Record<string, unknown>[],
  interval: number,
  metric: string | ((row: Record<string, unknown>) => number | null),
): {
  time: number;
  distance: number;
  min: number;
  max: number;
  avg: number;
}[] => {
  if (rows.length === 0) return [];

  const aggregated: {
    time: number;
    distance: number;
    min: number;
    max: number;
    avg: number;
  }[] = [];

  let currentBucketStart = 0;
  let minVal = Infinity;
  let maxVal = -Infinity;
  let sumVal = 0;
  let count = 0;
  let firstDistance = 0;
  let hasDataInBucket = false;

  const getValue = (row: Record<string, unknown>): number | null => {
    if (typeof metric === "function") {
      return metric(row);
    }
    const val = row[metric];
    if (val === null || val === undefined) return null;
    return Number(val);
  };

  rows.forEach((row, i) => {
    const t = Number(row.time || 0);
    const dist = Number(row.distance || 0);

    if (i === 0) {
      currentBucketStart = Math.floor(t / interval) * interval;
      firstDistance = dist;
    }

    const val = getValue(row);

    // If we moved to next bucket
    if (t >= currentBucketStart + interval) {
      if (hasDataInBucket) {
        aggregated.push({
          time: currentBucketStart,
          distance: firstDistance,
          min: minVal,
          max: maxVal,
          avg: sumVal / count,
        });
      }

      // Reset for new bucket
      currentBucketStart = Math.floor(t / interval) * interval;
      minVal = Infinity;
      maxVal = -Infinity;
      sumVal = 0;
      count = 0;
      firstDistance = dist;
      hasDataInBucket = false;
    }

    if (val !== null && !isNaN(val)) {
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
      sumVal += val;
      count++;
      hasDataInBucket = true;
    }
  });

  // Push last bucket
  if (hasDataInBucket) {
    aggregated.push({
      time: currentBucketStart,
      distance: firstDistance,
      min: minVal,
      max: maxVal,
      avg: sumVal / count,
    });
  }

  return aggregated;
};

/**
 * Draw bars for uPlot
 */
export const drawBars = (
  u: uPlot,
  seriesIdx: number,
  idx0: number,
  idx1: number,
  barColor: string,
) => {
  const { ctx } = u;
  const xData = u.data[0];
  const yMaxData = u.data[1];
  const yMinData = u.data[2];

  const valToPosY = (val: number, scaleKey: string) => {
    return u.valToPos(val, scaleKey, true);
  };

  const valToPosX = (val: number, scaleKey: string) => {
    return u.valToPos(val, scaleKey, true);
  };

  ctx.save();
  ctx.fillStyle = barColor;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1;

  // Determine bar width based on interval (approximate)
  // We can use the distance between first two points
  let barWidth = 5; // default
  if (xData.length > 1) {
    const x0 = valToPosX(xData[0], "x");
    const x1 = valToPosX(xData[1], "x");
    barWidth = Math.max(2, (x1 - x0) * 0.6); // 60% of interval width
  }

  for (let i = idx0; i <= idx1; i++) {
    const xVal = xData[i];
    const maxVal = yMaxData[i];
    const minVal = yMinData[i];

    if (
      maxVal === null ||
      minVal === null ||
      maxVal === undefined ||
      minVal === undefined
    )
      continue;

    const xPos = valToPosX(xVal, "x");
    const yPosMax = valToPosY(maxVal, "y");
    const yPosMin = valToPosY(minVal, "y");

    // Draw bar from min to max
    // If min == max, draw a small line or min height
    let height = yPosMin - yPosMax;
    if (height < 1) height = 1;

    // Rounded corners
    const radius = 2;
    ctx.beginPath();
    ctx.roundRect(xPos - barWidth / 2, yPosMax, barWidth, height, radius);
    ctx.fill();
  }

  ctx.restore();
  return null;
};

export type MetricColorGroup =
  | "volume"
  | "duration"
  | "locomotion"
  | "power"
  | "cardio"
  | "terrain"
  | "energy"
  | "load"
  | "fitness"
  | "recovery"
  | "efficiency"
  | "consistency"
  | "mechanics"
  | "environment"
  | "neutral";

type MetricColorRule = {
  color: string;
  comparisonColor: string;
};

const METRIC_COLOR_RULES: Record<MetricColorGroup, MetricColorRule> = {
  volume: { color: "#2563eb", comparisonColor: "#93c5fd" },
  duration: { color: "#0f766e", comparisonColor: "#99f6e4" },
  locomotion: { color: "#d97706", comparisonColor: "#fcd34d" },
  power: { color: "#dc2626", comparisonColor: "#fca5a5" },
  cardio: { color: "#e11d48", comparisonColor: "#fda4af" },
  terrain: { color: "#57534e", comparisonColor: "#d6d3d1" },
  energy: { color: "#ea580c", comparisonColor: "#fdba74" },
  load: { color: "#7c3aed", comparisonColor: "#c4b5fd" },
  fitness: { color: "#0284c7", comparisonColor: "#7dd3fc" },
  recovery: { color: "#64748b", comparisonColor: "#cbd5e1" },
  efficiency: { color: "#059669", comparisonColor: "#6ee7b7" },
  consistency: { color: "#c2410c", comparisonColor: "#fed7aa" },
  mechanics: { color: "#0891b2", comparisonColor: "#67e8f9" },
  environment: { color: "#ca8a04", comparisonColor: "#fde68a" },
  neutral: { color: "#64748b", comparisonColor: "#cbd5e1" },
};

// 跑步动态各曲线需要一眼可区分，同时保持整套图表的低饱和度。
const METRIC_COLOR_OVERRIDES: Record<string, MetricColorRule> = {
  cadence: { color: "#0891b2", comparisonColor: "#67e8f9" },
  stepLength: { color: "#2563eb", comparisonColor: "#93c5fd" },
  strideLength: { color: "#2563eb", comparisonColor: "#93c5fd" },
  verticalOscillation: { color: "#7c3aed", comparisonColor: "#c4b5fd" },
  verticalRatio: { color: "#db2777", comparisonColor: "#f9a8d4" },
  stanceTime: { color: "#ea580c", comparisonColor: "#fdba74" },
  flightTime: { color: "#059669", comparisonColor: "#6ee7b7" },
  flightRatio: { color: "#65a30d", comparisonColor: "#bef264" },
};

const METRIC_COLOR_GROUPS: Record<string, MetricColorGroup> = {
  count: "volume",
  weekCount: "volume",
  distance: "volume",
  weekDistance: "volume",
  strideLength: "volume",
  duration: "duration",
  weekDuration: "duration",
  speed: "locomotion",
  weekSpeed: "locomotion",
  pace: "locomotion",
  tp: "locomotion",
  cs: "locomotion",
  power: "power",
  weekPower: "power",
  ftp: "power",
  cp: "power",
  pMax: "power",
  intensity: "power",
  heartRate: "cardio",
  weekHeartRate: "cardio",
  maxHr: "cardio",
  restingHr: "cardio",
  lthr: "cardio",
  vo2Max: "cardio",
  climb: "terrain",
  weekClimb: "terrain",
  elevation: "terrain",
  altitude: "terrain",
  enhancedAltitude: "terrain",
  calories: "energy",
  weekCalories: "energy",
  atl: "load",
  weekPressure: "load",
  weightedTokens: "load",
  ctl: "fitness",
  tsb: "recovery",
  restDays: "recovery",
  acRatio: "efficiency",
  monotony: "consistency",
  sleep: "recovery",
  hrv: "recovery",
  restingHeartRate: "cardio",
  stress: "load",
  bodyBattery: "energy",
  spo2: "cardio",
  steps: "volume",
  cadence: "mechanics",
  stepLength: "mechanics",
  stanceTime: "mechanics",
  verticalOscillation: "mechanics",
  verticalRatio: "mechanics",
  flightTime: "mechanics",
  flightRatio: "mechanics",
  temperature: "environment",
};

export const getMetricColorGroup = (metric: string): MetricColorGroup => {
  return METRIC_COLOR_GROUPS[metric] || "neutral";
};

export const getMetricColorRule = (metric: string): MetricColorRule => {
  return (
    METRIC_COLOR_OVERRIDES[metric] ??
    METRIC_COLOR_RULES[getMetricColorGroup(metric)]
  );
};

/**
 * Get color for a specific metric based on a shared semantic color rule.
 *
 * @param metric Metric name (e.g., 'speed', 'heartRate', 'power')
 * @returns Hex color string
 */
export const getMetricColor = (metric: string): string => {
  return getMetricColorRule(metric).color;
};

export const getMetricComparisonColor = (metric: string): string => {
  return getMetricColorRule(metric).comparisonColor;
};

/**
 * Calculate Y-axis range (min/max) based on data range and metric type.
 *
 * @param min Minimum data value
 * @param max Maximum data value
 * @param metric Metric type (e.g., 'pace', 'heartRate', 'altitude', 'speed')
 * @returns Object containing min and max for the axis
 */
export const calculateYAxisRange = (
  min: number | null | undefined,
  max: number | null | undefined,
  metric: string,
): { min: number; max: number } => {
  // Handle invalid inputs
  if (min === null || min === undefined || max === null || max === undefined) {
    if (metric === "pace") {
      return { min: 0, max: 40 };
    }
    return { min: 0, max: 100 }; // Default range
  }

  // Default logic: add padding of 1 unit
  // This works well for altitude to avoid bars touching the edges exactly
  // Can be customized per metric in the future

  let newMin = min - 1;
  let newMax = max + 1;

  if (metric === "pace") {
    newMin = Math.max(0, newMin);
    // Ensure we don't show ridiculous pace values if data is sparse
    if (newMax > 40) newMax = 40;
  } else if (metric === "strideLength") {
    newMin = Math.max(0, min - 0.2);
    newMax = max + 0.2;
  }

  return {
    min: newMin,
    max: newMax,
  };
};
