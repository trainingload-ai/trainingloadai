/**
 * Time formatting utility functions
 */

/**
 * Convert seconds to HH:MM:SS format
 * @param totalSeconds Total seconds
 * @param options Formatting options
 * @returns Formatted time string
 */
export function formatSecondsToTime(
  totalSeconds: number,
  options: {
    /** Whether to show hours, default is false */
    showHours?: boolean;
    /** Whether to round seconds, default is true */
    roundSeconds?: boolean;
    /** Separator, default is ':' */
    separator?: string;
  } = {},
): string {
  const { showHours = false, roundSeconds = true, separator = ":" } = options;

  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return showHours ? "0:00:00" : "0:00";
  }

  const seconds = roundSeconds
    ? Math.round(totalSeconds % 60)
    : Math.floor(totalSeconds % 60);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  const formatNumber = (num: number): string => num.toString().padStart(2, "0");

  if (showHours || hours > 0) {
    return `${hours}${separator}${formatNumber(minutes)}${separator}${formatNumber(seconds)}`;
  }

  return `${minutes}${separator}${formatNumber(seconds)}`;
}
