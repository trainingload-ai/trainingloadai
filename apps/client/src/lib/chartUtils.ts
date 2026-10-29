import dayjs from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear";
import isoWeek from "dayjs/plugin/isoWeek";
import "dayjs/locale/zh-cn";

dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);

/**
 * Chart related utility functions
 */

/**
 * Dynamically calculate X-axis tick interval, ensuring 6-8 ticks are displayed to avoid overlap
 * @param dataLength Length of data
 * @returns Tick interval value
 */
export const calculateXAxisInterval = (dataLength: number): number => {
  if (dataLength <= 6) return 0; // Display all ticks when data is less than or equal to 6
  if (dataLength <= 8) return 0; // Display all ticks when data is 7-8

  // Calculate interval to ensure 6-8 ticks are displayed
  const targetTicks = Math.max(6, Math.min(8, Math.ceil(dataLength / 8)));
  return Math.ceil(dataLength / targetTicks) - 1;
};

/**
 * Format date based on time mode
 * @param value Date string
 * @param mode Time mode (day, week, month, year)
 * @returns Formatted date string
 */
export const formatDateByMode = (value: string, mode: string): string => {
  const date = dayjs(value);
  switch (mode) {
    case "week":
      return `${date.year()}年${date.isoWeek()}周`;
    case "month":
      return `${date.year()}年${date.month() + 1}月`;
    case "year":
      return `${date.year()}年`;
    case "day":
      return date.format("YYYY-MM-DD");
    default:
      return date.format("YYYY-MM-DD");
  }
};

/**
 * Smartly format X-axis time tick label
 * @param value Time value
 * @param dataLength Length of data
 * @param formatter Formatter function
 * @param timeMode Time mode (optional)
 * @returns Formatted label
 */
export const formatXAxisTimeLabel = (
  value: string,
  dataLength: number,
  formatter: (type: string, value: string) => string,
  timeMode?: string,
): string => {
  if (
    timeMode &&
    timeMode !== "day" &&
    timeMode !== "range" &&
    timeMode !== "past-minutes"
  ) {
    return formatDateByMode(value, timeMode);
  }

  const formattedDate = formatter("timeByDay", value);

  // Adjust display format based on data volume
  if (dataLength > 60) {
    // When data volume is large, only display month-day, remove year
    return formattedDate.replace(/^\d{4}-/, "");
  } else if (dataLength > 30) {
    // When data volume is larger, display simplified format
    const parts = formattedDate.split("-");
    if (parts.length === 3) {
      return `${parts[1]}-${parts[2]}`; // MM-DD format
    }
  }
  return formattedDate;
};

/**
 * Calculates smoothed pace data using a moving average window.
 *
 * @param speeds Array of speed values (m/s)
 * @param times Array of timestamps (seconds)
 * @param windowSec Moving average window in seconds (default: 30)
 * @returns Object containing:
 * - smoothedPace: Array of smoothed pace values (min/km), capped at 20 min/km
 * - avgPace: Average pace over the entire dataset (min/km), or null if speed is 0
 */
export const calculateSmoothedPace = (
  speeds: number[],
  times: number[],
  windowSec: number = 30,
): { smoothedPace: number[]; avgPace: number | undefined } => {
  if (speeds.length === 0 || times.length === 0) {
    return { smoothedPace: [], avgPace: undefined };
  }

  const smoothed: number[] = new Array(speeds.length);
  let sum = 0;
  let j = 0;

  // Calculate moving average speed, ignoring zero values
  for (let i = 0; i < speeds.length; i++) {
    // Add current speed to sum if valid
    if (speeds[i] > 0) {
      sum += speeds[i];
    }

    // Remove speeds outside the window
    while (times[i] - times[j] > windowSec) {
      if (speeds[j] > 0) {
        sum -= speeds[j];
      }
      j++;
    }

    // Use a secondary loop to count valid entries in the current window [j, i]
    // Optimization: Maintain a running count instead of re-looping if performance is an issue,
    // but for typical activity data sizes (few thousand points), this nested loop over a small window (30s) is acceptable.
    // However, to be safer and more efficient, let's just count valid items in the window range.
    let validCount = 0;
    for (let k = j; k <= i; k++) {
      if (speeds[k] > 0) validCount++;
    }

    // If no valid speeds in window, smoothed speed is 0
    smoothed[i] = validCount > 0 ? sum / validCount : 0;
  }

  // Calculate overall average speed (filtering out invalid speeds)
  let avgSpeed = 0;
  let cnt = 0;
  for (let i = 0; i < smoothed.length; i++) {
    if (Number.isFinite(smoothed[i]) && smoothed[i] > 0.5) {
      avgSpeed += smoothed[i];
      cnt++;
    }
  }
  avgSpeed = cnt > 0 ? avgSpeed / cnt : 0;
  const avgPace = avgSpeed > 0 ? 16.6666666667 / avgSpeed : undefined;

  // Convert smoothed speed to pace
  const smoothedPace: number[] = [];
  for (let i = 0; i < smoothed.length; i++) {
    let pace = 0;
    if (smoothed[i] > 0.5) {
      pace = 16.6666666667 / smoothed[i];
    }
    if (pace > 20) pace = 20;
    smoothedPace.push(pace);
  }

  return { smoothedPace, avgPace };
};
