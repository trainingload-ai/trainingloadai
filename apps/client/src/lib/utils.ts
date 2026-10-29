import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import { round } from "lodash";
import { formatValue, getUnit } from "@/hooks/useFormatterBySettings";

dayjs.extend(duration);

const mergeTailwindClasses = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "mobile-micro",
        "mobile-unit",
        "mobile-caption",
        "mobile-control",
        "mobile-body",
        "mobile-subtitle",
        "mobile-headline",
        "mobile-title",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return mergeTailwindClasses(clsx(inputs));
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function calcClampedPercent(
  value: number | undefined,
  maxValue: number | undefined,
  options?: { min?: number; max?: number; decimals?: 0 | 1 | 2 },
): number {
  const min = options?.min ?? 0;
  const max = options?.max ?? 100;
  const decimals = options?.decimals ?? 0;

  if (
    value === undefined ||
    maxValue === undefined ||
    !Number.isFinite(value) ||
    !Number.isFinite(maxValue) ||
    maxValue <= 0
  ) {
    return min;
  }

  const raw = (value / maxValue) * 100;
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(raw * factor) / factor;
  return clamp(rounded, min, max);
}

export function calcTsbSignedPercent(tsb: number | undefined, atl: number | undefined) {
  if (
    tsb === undefined ||
    atl === undefined ||
    !Number.isFinite(tsb) ||
    !Number.isFinite(atl) ||
    atl <= 0
  ) {
    return 0;
  }
  return clamp(Math.round((tsb / atl) * 100), -100, 100);
}

export const formatter = (
  type: string,
  value: string | number | undefined | null,
) => {
  switch (type) {
    case "time":
      return dayjs(value).format("HH:mm:ss");
    case "timeByDay":
      return dayjs(value).format("YYYY-MM-DD");
    // Milliseconds
    case "elTime":
      return dayjs.duration((value as number) / 1000, "s").format("mm:ss");
    // Seconds
    case "elTimeS":
      return dayjs.duration(value as number, "s").format("mm:ss");
    case "pace": {
      const seconds = value as number;
      if (
        seconds === undefined ||
        seconds === null ||
        !Number.isFinite(seconds)
      )
        return "";
      const m = Math.floor(seconds / 60);
      const s = Math.round(seconds % 60);
      return `${m}:${s.toString().padStart(2, "0")}`;
    }
    default:
      return `${round(Number(value) / 1000, 2)} km`;
  }
};

export function formatBySettings(
  value: number,
  metricType:
    | "count"
    | "duration"
    | "speed"
    | "distance"
    | "heartRate"
    | "power"
    | "cadence"
    | "elevation" = "count",
  options?: {
    systemUnit?: "metric" | "imperial";
  },
): string {
  const { systemUnit = "metric" } = options || {};

  const formattedValue = formatValue(value, metricType, systemUnit);
  const unit = getUnit(metricType, systemUnit);

  return `${formattedValue} ${unit}`.trim();
}

export const parsePace = (str: string): number | undefined => {
  if (!str) return undefined;
  // Support mm:ss or mm.ss or just mm (treated as minutes)
  const parts = str.trim().split(/[:.]/);
  if (parts.length === 2) {
    const m = parseInt(parts[0]);
    const s = parseInt(parts[1]);
    if (!isNaN(m) && !isNaN(s)) return m * 60 + s;
  } else if (parts.length === 1) {
    // If just a number, assume it's minutes if < 60, or maybe user typing seconds?
    // Safe bet for pace: usually input as minutes if single number.
    // E.g. "5" -> 5:00/km
    const val = parseFloat(parts[0]);
    if (!isNaN(val)) return Math.round(val * 60);
  }
  return undefined;
};
