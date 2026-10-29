import { HeartRateZoneValue } from "@/api/use-heart-rate";
import { ChartValue } from "@/api/useActivityMetric";
import dayjs from "dayjs";
import { maxBy, meanBy, minBy, round } from "lodash";

export interface SpeedChartValue extends ChartValue {
  speed: string;
}

export interface PaceChartValue extends ChartValue {
  pace: number;
}

interface PaceResult {
  chart: PaceChartValue[];
  list: { pace: number; index: number }[];
  max?: number;
  min?: number;
  avg?: number;
}

// Analyze activity data by specified distance segments
export function getPaceBySpeed(
  data?: SpeedChartValue[],
  split: number = 1, // Split distance (km), default 1000m
): PaceResult {
  if (!data || data.length === 0) {
    return {
      chart: [],
      list: [],
    };
  }

  const segmentDistanceMeters = split * 1000; // Convert to meters

  // Group by distance: one bucket per 1000 meters
  const buckets: SpeedChartValue[][] = [];

  for (const record of data) {
    const distance = Number((record as SpeedChartValue).distance ?? 0);

    // Calculate which bucket this point belongs to
    const bucketIndex = Math.floor(distance / segmentDistanceMeters);

    if (bucketIndex >= buckets.length) {
      // Create new bucket
      buckets.push([record]);
    } else {
      // Add to existing bucket
      buckets[bucketIndex].push(record);
    }
  }

  const paces: PaceResult["list"] = [];

  // Process each bucket
  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i];
    if (bucket.length === 0) continue;

    const firstPoint = bucket[0] as ChartValue;
    const lastPoint = bucket[bucket.length - 1] as ChartValue;

    // Calculate data for this bucket
    const distance =
      Number(lastPoint.distance ?? 0) - Number(firstPoint.distance ?? 0);
    const time = dayjs(lastPoint.time).diff(dayjs(firstPoint.time), "second");

    const avgSpeed = time > 0 ? round(distance / time, 2) : 0; // m/s
    const pace = avgSpeed > 0 ? round(1000 / avgSpeed, 2) : 0; // seconds/km

    paces.push({
      pace: round(pace, 2),
      index: i + 1,
    });
  }
  const startTime = dayjs(data?.[0].time).toDate();
  const paceChart = data.map((item) => ({
    ...item,
    time: dayjs(item.time).diff(dayjs(startTime), "second").toString(),
    pace: item.speed ? round(1000 / Number(item.speed), 2) : 0,
  }));

  return {
    chart: paceChart,
    max: maxBy(paces, "pace")?.pace ?? 0,
    min: minBy(paces, "pace")?.pace ?? 0,
    avg: round(meanBy(paces, "pace"), 2) ?? 0,
    list: paces,
  };
}

// Helper: Return color based on zone
export const getHeartRateZoneColor = (
  heartRate: number,
  zones: HeartRateZoneValue[],
  palette = POWER_ZONE_PALETTE,
  fallback = "#ef4444",
) => {
  const idx = zones.findIndex(
    (z) =>
      z.min !== undefined &&
      z.max !== undefined &&
      heartRate >= z.min &&
      heartRate <= z.max,
  );
  return idx >= 0 && palette[idx] ? palette[idx] : fallback;
};

export const getHeartRateZoneColorByZone = (
  zone?: number,
  palette = POWER_ZONE_PALETTE,
  fallback = "#ef4444",
) => {
  if (!zone) return fallback;
  return palette[zone] ?? fallback;
};

// Power zone color helper - default supports Z1~Z7
export const POWER_ZONE_PALETTE = [
  "#94a3b8", // Z1
  "#3b82f6", // Z2
  "#10b981", // Z3
  "#f59e0b", // Z4
  "#ef4444", // Z5
  "#9333ea", // Z6
  "#ec4899", // Z7
];

// Return color based on power value and zone
export const getPowerZoneColor = (
  power: number,
  zones: Array<{ min?: number; max?: number }>,
  palette: string[] = POWER_ZONE_PALETTE,
  fallback = "#ef4444",
) => {
  const idx = zones.findIndex(
    (z) =>
      z.min !== undefined &&
      z.max !== undefined &&
      power >= z.min &&
      power <= z.max,
  );
  return idx >= 0 && palette[idx] ? palette[idx] : fallback;
};

// Return color based on zone label (z1...z7)
export const getPowerZoneColorByZone = (
  color?: string,
  order?: number,
  palette: string[] = POWER_ZONE_PALETTE,
  fallback = "#ef4444",
) => {
  if (color) {
    return color;
  }
  return order ? palette[order - 1] : fallback;
};

export const getPaceZoneColorByZone = (
  zone?: string,
  palette = [
    "#94a3b8",
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#9333ea",
    "#ec4899",
  ],
  fallback = "#ef4444",
) => {
  if (!zone) return fallback;
  const index = Number(zone.toLowerCase().replace("z", "")) - 1;
  return palette[index] ?? fallback;
};
