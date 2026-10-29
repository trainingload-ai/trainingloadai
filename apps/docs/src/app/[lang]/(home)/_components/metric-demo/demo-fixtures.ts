import dayjs from "dayjs";

import type {
  DemoTimeKey,
  HeartRateDurationRow,
  PaceDistanceRow,
  PmcDataPoint,
  PowerDurationRow,
  ZoneDistributionRow,
} from "./shared/demo-types";
import { HR_TABLE_DURATION_KEYS, PACE_DISTANCE_KEYS, POWER_DURATION_KEYS } from "./shared/demo-types";

export function buildPmcSeries(): PmcDataPoint[] {
  const ctlDecayFactor = Math.exp(-1 / 42);
  const atlDecayFactor = Math.exp(-1 / 7);
  let ctl = 38;
  let atl = 40;

  return Array.from({ length: 72 }, (_, index) => {
    const dayOfWeek = index % 7;
    const weeklyLoad = [42, 62, 32, 68, 38, 78, 0][dayOfWeek] ?? 0;
    const blockAdjustment =
      index < 21
        ? index * 0.32
        : index < 42
          ? 6.5 + (index - 21) * 0.42
          : index < 56
            ? -2 - (index - 42) * 0.25
            : 4 + (index - 56) * 0.45;
    const dailyLoad = Math.max(
      0,
      Math.round(
        weeklyLoad > 0
          ? weeklyLoad + blockAdjustment + Math.sin(index / 3.7) * 4
          : 0,
      ),
    );

    ctl = ctl * ctlDecayFactor + dailyLoad * (1 - ctlDecayFactor);
    atl = atl * atlDecayFactor + dailyLoad * (1 - atlDecayFactor);
    const tsb = ctl - atl;

    return {
      date: dayjs("2026-05-12").add(index, "day").format("YYYY-MM-DD"),
      fitness: Math.round(ctl * 10) / 10,
      fatigue: Math.round(atl * 10) / 10,
      form: Math.round(tsb * 10) / 10,
      value: dailyLoad,
    };
  });
}

export const DEMO_PMC_EXTREMES = { ctl: 60, atl: 80 };

const POWER_BASE: Record<(typeof POWER_DURATION_KEYS)[number], number> = {
  "5s": 892,
  "30s": 712,
  "1m": 548,
  "3m": 412,
  "5m": 368,
  "20m": 302,
  "60m": 286,
  "2h": 274,
  "3h": 268,
};

function scalePowerRow(
  timeKey: DemoTimeKey,
  factor: number,
): PowerDurationRow {
  const row = { timeKey } as PowerDurationRow;
  for (const key of POWER_DURATION_KEYS) {
    row[key] = Math.round(POWER_BASE[key] * factor);
  }
  return row;
}

export const DEMO_POWER_ROWS: PowerDurationRow[] = [
  scalePowerRow("thisYear", 1),
  scalePowerRow("last30", 0.98),
  scalePowerRow("last90", 0.95),
];

export const DEMO_POWER_PROFILE = {
  ftp: 286,
  cp: 302,
  wPrime: 18400,
  userWkg: { "5s": 11.8, "1m": 7.2, "5m": 4.8, FTP: 3.7 },
  riderType: "pursuiter" as const,
};

export const DEMO_POWER_ZONES: ZoneDistributionRow[] = [
  { zone: "Z1", color: "#94a3b8", values: { thisYear: 42, last30: 38, last90: 40 } },
  { zone: "Z2", color: "#38bdf8", values: { thisYear: 28, last30: 31, last90: 29 } },
  { zone: "Z3", color: "#22c55e", values: { thisYear: 16, last30: 15, last90: 14 } },
  { zone: "Z4", color: "#f59e0b", values: { thisYear: 9, last30: 10, last90: 11 } },
  { zone: "Z5", color: "#ef4444", values: { thisYear: 5, last30: 6, last90: 6 } },
];

export const DEMO_POWER_MAXIMUM = Array.from({ length: 24 }, (_, index) => ({
  time: dayjs("2024-01-01").add(index, "week").format("YYYY-MM-DD"),
  value: 520 + Math.sin(index / 2.4) * 36 + index * 1.2,
}));

const PACE_BASE: Record<(typeof PACE_DISTANCE_KEYS)[number], PaceDistanceRow[(typeof PACE_DISTANCE_KEYS)[number]]> = {
  "400m": { paceSec: 78, timeSec: 78 },
  "800m": { paceSec: 83, timeSec: 166 },
  "1500m": { paceSec: 88, timeSec: 328 },
  "1mi": { paceSec: 90, timeSec: 362 },
  "3k": { paceSec: 94, timeSec: 712 },
  "5k": { paceSec: 98, timeSec: 1248 },
  "10k": { paceSec: 102, timeSec: 2620 },
  "20k": { paceSec: 106, timeSec: 5820 },
  "42.2k": { paceSec: 110, timeSec: 12480 },
};

function scalePaceRow(timeKey: DemoTimeKey, offset: number): PaceDistanceRow {
  const row: PaceDistanceRow = { timeKey };
  for (const key of PACE_DISTANCE_KEYS) {
    const base = PACE_BASE[key]!;
    row[key] = {
      paceSec: base.paceSec + offset,
      timeSec: base.timeSec + offset * (key === "42.2k" ? 120 : 12),
    };
  }
  return row;
}

export const DEMO_PACE_ROWS: PaceDistanceRow[] = [
  scalePaceRow("thisYear", 0),
  scalePaceRow("last30", 2),
  scalePaceRow("last90", 4),
];

export const DEMO_PACE_CS = 3.72;

export const DEMO_PACE_ZONES: ZoneDistributionRow[] = [
  { zone: "Z1", color: "#94a3b8", values: { thisYear: 36, last30: 34, last90: 35 } },
  { zone: "Z2", color: "#38bdf8", values: { thisYear: 31, last30: 33, last90: 32 } },
  { zone: "Z3", color: "#22c55e", values: { thisYear: 18, last30: 17, last90: 16 } },
  { zone: "Z4", color: "#f59e0b", values: { thisYear: 10, last30: 10, last90: 11 } },
  { zone: "Z5", color: "#ef4444", values: { thisYear: 5, last30: 6, last90: 6 } },
];

const HR_BASE: Record<(typeof HR_TABLE_DURATION_KEYS)[number], number> = {
  "5s": 188,
  "30s": 182,
  "1m": 176,
  "3m": 170,
  "5m": 166,
  "10m": 162,
  "20m": 158,
  "60m": 152,
  "2h": 148,
  "3h": 145,
  "6h": 142,
};

function scaleHrRow(timeKey: DemoTimeKey, offset: number): HeartRateDurationRow {
  const row = { timeKey } as HeartRateDurationRow;
  for (const key of HR_TABLE_DURATION_KEYS) {
    row[key] = HR_BASE[key] - offset;
  }
  return row;
}

export const DEMO_HEART_RATE_ROWS: HeartRateDurationRow[] = [
  scaleHrRow("thisYear", 0),
  scaleHrRow("last30", 2),
  scaleHrRow("last90", 4),
];

export const DEMO_HEART_RATE_THRESHOLDS = {
  lthr: 168,
  maxHeartRate: 192,
};

export const DEMO_HEART_RATE_ZONES: ZoneDistributionRow[] = [
  { zone: "Z1", color: "#94a3b8", values: { thisYear: 44, last30: 42, last90: 43 } },
  { zone: "Z2", color: "#38bdf8", values: { thisYear: 27, last30: 28, last90: 27 } },
  { zone: "Z3", color: "#22c55e", values: { thisYear: 15, last30: 14, last90: 15 } },
  { zone: "Z4", color: "#f59e0b", values: { thisYear: 9, last30: 10, last90: 9 } },
  { zone: "Z5", color: "#ef4444", values: { thisYear: 5, last30: 6, last90: 6 } },
];

export function formatPaceSec(paceSec: number) {
  const minutes = Math.floor(paceSec / 60);
  const seconds = Math.round(paceSec % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatDurationSec(totalSec: number) {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = Math.round(totalSec % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
