"use client";

import { useStore } from "@/lib/store";
import { formatSecondsToTime } from "@/utils/timeFormatter";
// no need to fetch user weight for formatting

/**
 * Core function for formatting values
 * @param value Value to format
 * @param metricType Data type
 * @param systemUnit System unit
 * @returns Formatted string
 */
export function formatDuration(seconds: number): string {
  if (!seconds && seconds !== 0) return "--";

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}h ${m}m`;
  } else if (m > 0) {
    return `${m}m ${s}s`;
  } else {
    return `${s}s`;
  }
}

export function formatValue(
  value: number | string = "",
  metricType:
    | "count"
    | "duration"
    | "speed"
    | "distance"
    | "heartRate"
    | "power"
    | "cadence"
    | "elevation"
    | "pace"
    | "paceSeconds"
    | string = "count",
  systemUnit: "metric" | "imperial" = "metric",
): string {
  const valueNum = Number.isFinite(Number(value)) ? Number(value) : 0;
  if (valueNum === null || valueNum === undefined) return "";
  switch (metricType) {
    case "count":
      return valueNum.toFixed(0);

    case "duration":
      // Convert seconds to a more friendly time format
      const hours = Math.floor(valueNum / 3600);
      const minutes = Math.floor((valueNum % 3600) / 60);
      const seconds = Math.floor(valueNum % 60);

      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
      } else if (minutes > 0) {
        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
      } else {
        return seconds.toString();
      }

    case "speed":
      // Input assumed to be m/s
      if (systemUnit === "imperial") {
        // m/s -> mph
        return (valueNum * 2.236936).toFixed(1);
      }
      // m/s -> km/h
      return (valueNum * 3.6).toFixed(1);

    case "distance":
      // Input assumed to be meters
      if (systemUnit === "imperial") {
        // m -> miles
        return (valueNum / 1609.34).toFixed(2);
      }
      // m -> km
      return (valueNum / 1000).toFixed(2);

    case "heartRate":
      return Math.round(valueNum).toString();

    case "power":
      // Power is not affected by systemUnit, always displayed as W
      return Math.round(valueNum).toString();

    case "pace":
      const distance = systemUnit === "imperial" ? 1609.344 : 1000;
      const totalSeconds = distance / valueNum;

      // 检查计算结果有效性
      if (!isFinite(totalSeconds) || totalSeconds < 0) {
        return "--:--";
      }

      const pMin = Math.floor(totalSeconds / 60);
      // 用 Math.floor 处理秒数，避免负数，再处理进位
      let pSec = Math.round(totalSeconds - pMin * 60);

      // 处理秒数进位和借位
      if (pSec >= 60) {
        return `${pMin + 1}:00`;
      } else if (pSec < 0) {
        pSec = 0; // 或处理为 `${pMin - 1}:59` 如果需要借位
      }

      return `${pMin}:${pSec.toString().padStart(2, "0")}`;

    case "paceSeconds": {
      const sec =
        systemUnit === "imperial" ? valueNum * 1.609344 : valueNum * 1;
      return formatSecondsToTime(sec, { showHours: false, roundSeconds: true });
    }

    case "cadence":
      return Math.round(valueNum).toString();

    case "length":
      if (systemUnit === "imperial") {
        return (valueNum * 3.28084).toFixed(2);
      }
      return valueNum.toFixed(2);

    case "milliseconds":
      return Math.round(valueNum).toString();

    case "temperature":
      return valueNum.toFixed(1);

    case "elevation":
      if (systemUnit === "imperial") {
        // m -> ft
        return (valueNum * 3.28084).toFixed(0);
      }
      return valueNum.toFixed(0);

    case "calories":
      return Math.round(valueNum).toString();

    default:
      return valueNum.toString();
  }
}

/**
 * Core function for getting units
 * @param metricType Data type
 * @returns Corresponding unit string
 */
export function getUnit(
  metricType: string,
  systemUnit: "metric" | "imperial" = "metric",
  // powerUnit: "watts" | "watts_per_kg" = "watts"
): string {
  switch (metricType) {
    case "count":
      return "";

    case "duration":
      return "";

    case "speed":
      return systemUnit === "imperial" ? "mi/h" : "km/h";

    case "distance":
      if (systemUnit === "imperial") {
        return "mi";
      } else {
        return "km";
      }

    case "heartRate":
      return "bpm";

    case "power":
      return "W";

    case "cadence":
      return "rpm";

    case "length":
      return systemUnit === "imperial" ? "ft" : "m";

    case "milliseconds":
      return "ms";

    case "temperature":
      return "°C";

    case "pace":
      return systemUnit === "imperial" ? "min/mi" : "min/km";
    case "paceSeconds":
      return systemUnit === "imperial" ? "min/mi" : "min/km";

    case "elevation":
    case "climb":
      return systemUnit === "imperial" ? "ft" : "m";

    case "slope":
      return "%";
    case "calories":
      return "kcal";
    default:
      return "";
  }
}

/**
 * Custom Hook for formatting values based on user settings
 * Automatically retrieves user preferences for distance unit, speed unit, and power unit
 */
export function useFormatterBySettings() {
  const { systemUnit } = useStore();

  const formatValueWithSettings = (
    value: number | string = "",
    metricType:
      | "count"
      | "duration"
      | "speed"
      | "distance"
      | "heartRate"
      | "power"
      | "cadence"
      | "elevation" = "count",
  ): string => {
    return formatValue(value, metricType, systemUnit);
  };

  const getUnitWithSettings = (metricType: string): string => {
    return getUnit(metricType, systemUnit);
  };

  return {
    formatValue: formatValueWithSettings,
    getUnit: getUnitWithSettings,
  };
}
