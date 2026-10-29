import { parseThresholdDuration } from "./threshold-records";
import { timePartsToSeconds, type TimeParts } from "./running-pace";

const MAX_SECONDS = 24 * 60 * 60;

/**
 * Race-clock entry for the VDOT calculator.
 *
 * Colon clocks (`mm:ss`, `h:mm:ss`, including minutes past 59) go through
 * `parseThresholdDuration`. Hour, minute, and second fields go through
 * `timePartsToSeconds`, which accepts a fractional second below 60.
 * Compact digits (`2500`) and `1h25m8s` are normalized into one of those two
 * parsers. This module does not define a third duration model.
 */
function withinLimit(total: number | null) {
  if (total == null || total > MAX_SECONDS) return null;
  return total;
}

function fromParts(parts: TimeParts) {
  return withinLimit(timePartsToSeconds(parts));
}

function clockFromParts(hours: number, minutes: number, seconds: number) {
  if (![hours, minutes, seconds].every((part) => Number.isFinite(part) && part >= 0)) {
    return null;
  }
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  return fromParts({ hours, minutes, seconds });
}

/** `mm:ss` and `90m` may carry minutes past 59. `h:mm:ss` may not. */
function longMinutes(minutes: number, seconds: number) {
  if (!Number.isInteger(minutes) || minutes < 0 || seconds < 0 || seconds >= 60) {
    return null;
  }
  return clockFromParts(Math.floor(minutes / 60), minutes % 60, seconds);
}

function parseDecimalClock(value: string) {
  const three = value.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (three) {
    return clockFromParts(Number(three[1]), Number(three[2]), Number(three[3]));
  }
  const two = value.match(/^(\d{1,4}):(\d{1,2}(?:\.\d+)?)$/);
  if (!two) return null;
  return longMinutes(Number(two[1]), Number(two[2]));
}

function parseCompactDigits(value: string) {
  if (!/^\d{1,6}$/.test(value)) return null;
  if (value.length <= 2) return parseThresholdDuration(`${Number(value)}:00`);
  if (value.length <= 4) {
    return parseThresholdDuration(`${Number(value.slice(0, -2))}:${value.slice(-2)}`);
  }
  const padded = value.padStart(6, "0");
  return parseThresholdDuration(
    `${Number(padded.slice(0, -4))}:${padded.slice(-4, -2)}:${padded.slice(-2)}`,
  );
}

export function parseFlexibleTime(raw: string): number | null {
  const value = raw
    .trim()
    .replace(/：/g, ":")
    .replace(/\s*:\s*/g, ":")
    .replace(/\s+/g, "");
  if (!value) return null;

  const colon = parseThresholdDuration(value);
  if (colon != null) return withinLimit(colon);

  const decimal = parseDecimalClock(value);
  if (decimal != null) return decimal;

  const suffixed = value.match(/^(?:(\d{1,2})h)?(?:(\d{1,4})m)?(?:(\d{1,2}(?:\.\d+)?)s)?$/i);
  if (suffixed && (suffixed[1] || suffixed[2] || suffixed[3])) {
    const hours = suffixed[1] ? Number(suffixed[1]) : 0;
    const minutes = suffixed[2] ? Number(suffixed[2]) : 0;
    const seconds = suffixed[3] ? Number(suffixed[3]) : 0;
    return hours > 0
      ? clockFromParts(hours, minutes, seconds)
      : longMinutes(minutes, seconds);
  }

  const compact = parseCompactDigits(value);
  return compact == null ? null : withinLimit(compact);
}

export function parseTimeParts(hours: string, minutes: string, seconds: string) {
  const minutesRaw = minutes.trim();
  const secondsRaw = seconds.trim();
  if (minutesRaw === "" || secondsRaw === "") return null;
  const parsedHours = hours.trim() === "" ? 0 : Number(hours.trim());
  return clockFromParts(parsedHours, Number(minutesRaw), Number(secondsRaw));
}
