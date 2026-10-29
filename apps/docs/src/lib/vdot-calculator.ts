import {
  VDOT_ZONE_KEYS,
  VDOT_ZONE_PERCENTAGES,
  computeVdotForDistanceTime,
  isSupportedVdot,
  predictTimeForVdot,
  resolveVdotPaceRange,
  resolveVdotPaceRangeExact,
  type VdotZoneKey,
} from "@shared/vdot";
import { predictRaceTimes } from "./race-time-predictor";
import { KM_PER_MILE } from "./running-pace";

export const VDOT_EXAMPLE_DISTANCE_M = 5000;
export const VDOT_EXAMPLE_TIME_SEC = 25 * 60;

export type PaceUnit = "km" | "mi";

export type PaceBand = {
  zone: VdotZoneKey;
  fastSec: number;
  slowSec: number;
  lowPercent: number;
  highPercent: number;
};

/** Round a VDOT once, to one decimal, for display and for equivalent times. */
export function displayVdot(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return null;
  const rounded = Math.round(raw * 10) / 10;
  return isSupportedVdot(rounded) ? rounded : null;
}

export function vdotFromRace(
  distanceMeters: number,
  timeSeconds: number,
): number | null {
  if (!Number.isFinite(distanceMeters) || !Number.isFinite(timeSeconds)) return null;
  return displayVdot(computeVdotForDistanceTime(distanceMeters, timeSeconds));
}

/**
 * Convert an exact sec/km pace into the display unit and round once.
 * Do not pass an already-rounded pace back through this function.
 */
export function roundPaceSeconds(
  exactSecPerKm: number,
  unit: PaceUnit,
): number | null {
  if (!Number.isFinite(exactSecPerKm) || exactSecPerKm <= 0) return null;
  const seconds = unit === "mi" ? exactSecPerKm * KM_PER_MILE : exactSecPerKm;
  return Math.round(seconds);
}

function rangesOverlap(left: PaceBand, right: PaceBand) {
  return left.fastSec <= right.slowSec && right.fastSec <= left.slowSec;
}

/**
 * Integer pace bands for the scorecard.
 * Metric seconds match `resolveVdotPaceRange` (one round of the exact pace).
 * Where marathon and threshold share the published 83–84% shoulder, the slower
 * zone keeps those seconds so a pace is listed on one row. Other neighbors
 * already have a gap in the Daniels/Gilbert percentages.
 */
export function trainingPaceBands(vdot: number, unit: PaceUnit = "km"): PaceBand[] | null {
  const shown = displayVdot(vdot);
  if (shown == null) return null;

  const bands: PaceBand[] = [];
  for (const zone of VDOT_ZONE_KEYS) {
    const exact = resolveVdotPaceRangeExact(shown, zone);
    const fastSec = roundPaceSeconds(exact.fastSecPerKm, unit);
    const slowSec = roundPaceSeconds(exact.slowSecPerKm, unit);
    if (fastSec == null || slowSec == null || fastSec >= slowSec) return null;
    const percents = VDOT_ZONE_PERCENTAGES[zone];
    bands.push({
      zone,
      fastSec,
      slowSec,
      lowPercent: percents.low,
      highPercent: percents.high,
    });
  }

  for (let index = 1; index < bands.length; index += 1) {
    const slower = bands[index - 1];
    const faster = bands[index];
    if (rangesOverlap(slower, faster)) {
      faster.slowSec = slower.fastSec - 1;
      if (faster.fastSec >= faster.slowSec) return null;
    }
  }

  return bands;
}

export function publishedMetricPaces(vdot: number) {
  const shown = displayVdot(vdot);
  if (shown == null) return null;
  return Object.fromEntries(
    VDOT_ZONE_KEYS.map((zone) => [zone, resolveVdotPaceRange(shown, zone)]),
  ) as Record<VdotZoneKey, { fastSecPerKm: number; slowSecPerKm: number }>;
}

export type BriefEquivalent = {
  key: "5k" | "10k" | "half" | "marathon";
  distanceKm: number;
  timeSec: number | null;
  isSource: boolean;
};

export function briefRaceEquivalents(
  distanceMeters: number,
  timeSeconds: number,
): { vdot: number; rows: BriefEquivalent[] } | null {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return null;
  if (!Number.isFinite(timeSeconds) || timeSeconds <= 0) return null;
  const prediction = predictRaceTimes({
    distanceKm: distanceMeters / 1000,
    timeSec: timeSeconds,
  });
  if (!prediction?.vdot || !prediction.vdotSupported) return null;
  // predictRaceTimes keeps the raw score; round once for display here.
  const shown = displayVdot(prediction.vdot);
  if (shown == null) return null;
  const rows = prediction.rows.flatMap((row): BriefEquivalent[] => {
    if (row.key === "custom") return [];
    return [
      {
        key: row.key,
        distanceKm: row.distanceKm,
        timeSec: row.timeSec,
        isSource: row.isSource,
      },
    ];
  });
  return { vdot: shown, rows };
}

export function equivalentTimeSec(distanceMeters: number, vdot: number) {
  const shown = displayVdot(vdot);
  if (shown == null) return null;
  const seconds = predictTimeForVdot(distanceMeters, shown);
  return seconds != null && Number.isFinite(seconds) ? seconds : null;
}
