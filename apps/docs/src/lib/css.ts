export type PoolUnit = "meters" | "yards";

export type CssSwim = {
  distance: number;
  timeSec: number;
};

export type CssZoneId = "easy" | "aerobic" | "threshold" | "vo2" | "speed";

export type CssZone = {
  id: CssZoneId;
  /** Seconds per 100 m added to CSS pace. Faster zones are negative. */
  offsetStart: number;
  offsetEnd: number;
};

export type CssResult = {
  speedMps: number;
  pacePer100mSec: number;
  pacePer100UnitSec: number;
  unit: PoolUnit;
  shortDistance: number;
  longDistance: number;
  shortTimeSec: number;
  longTimeSec: number;
  zones: Array<CssZone & { paceStartSec: number; paceEndSec: number }>;
};

export const METERS_PER_YARD = 0.9144;

/** Classic CSS protocol distances in the selected pool unit. */
export const CSS_CLASSIC_PRESET: Record<PoolUnit, [number, number]> = {
  meters: [400, 200],
  yards: [400, 200],
};

/**
 * CSS training paces as seconds/100 m relative to threshold.
 * Coaching reference offsets used by this tool, not measured physiological zones.
 * Easy and aerobic sit slower than CSS; faster repeats sit below CSS pace.
 */
export const CSS_ZONES: readonly CssZone[] = [
  { id: "easy", offsetStart: 8, offsetEnd: 12 },
  { id: "aerobic", offsetStart: 4, offsetEnd: 7 },
  { id: "threshold", offsetStart: 0, offsetEnd: 0 },
  { id: "vo2", offsetStart: -4, offsetEnd: -2 },
  { id: "speed", offsetStart: -8, offsetEnd: -5 },
];

export function parseNonNegativeNumber(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function parsePositiveNumber(value: string): number | null {
  const n = parseNonNegativeNumber(value);
  if (n == null || n <= 0) return null;
  return n;
}

export function timePartsToSeconds(
  minutes: number,
  seconds: number,
): number | null {
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  if (minutes < 0 || seconds < 0 || seconds >= 60) return null;
  const total = minutes * 60 + seconds;
  if (!Number.isFinite(total) || total <= 0) return null;
  return total;
}

export function distanceToMeters(distance: number, unit: PoolUnit): number {
  return unit === "yards" ? distance * METERS_PER_YARD : distance;
}

export function pacePer100MetersToUnit(
  pacePer100mSec: number,
  unit: PoolUnit,
): number {
  return unit === "yards" ? pacePer100mSec * METERS_PER_YARD : pacePer100mSec;
}

/**
 * Critical Swim Speed (Wakayoshi et al., 1992):
 * CSS (m/s) = (D2 − D1) / (T2 − T1)
 * Pace per 100 m = 100 / CSS
 *
 * Distances may be entered in any order; the longer swim is D2.
 */
export function calculateCss(
  swimA: CssSwim,
  swimB: CssSwim,
  unit: PoolUnit,
): CssResult | null {
  if (
    !Number.isFinite(swimA.distance) ||
    !Number.isFinite(swimB.distance) ||
    !Number.isFinite(swimA.timeSec) ||
    !Number.isFinite(swimB.timeSec)
  ) {
    return null;
  }
  if (
    swimA.distance <= 0 ||
    swimB.distance <= 0 ||
    swimA.timeSec <= 0 ||
    swimB.timeSec <= 0
  ) {
    return null;
  }
  if (swimA.distance === swimB.distance) return null;

  const aMeters = distanceToMeters(swimA.distance, unit);
  const bMeters = distanceToMeters(swimB.distance, unit);
  const short =
    aMeters < bMeters
      ? { distance: swimA.distance, timeSec: swimA.timeSec, meters: aMeters }
      : { distance: swimB.distance, timeSec: swimB.timeSec, meters: bMeters };
  const long =
    aMeters < bMeters
      ? { distance: swimB.distance, timeSec: swimB.timeSec, meters: bMeters }
      : { distance: swimA.distance, timeSec: swimA.timeSec, meters: aMeters };

  const deltaMeters = long.meters - short.meters;
  const deltaTime = long.timeSec - short.timeSec;
  if (deltaMeters <= 0 || deltaTime <= 0) return null;

  const speedMps = deltaMeters / deltaTime;
  if (!Number.isFinite(speedMps) || speedMps <= 0) return null;

  const pacePer100mSec = 100 / speedMps;
  const pacePer100UnitSec = pacePer100MetersToUnit(pacePer100mSec, unit);
  if (!Number.isFinite(pacePer100mSec) || !Number.isFinite(pacePer100UnitSec))
    return null;

  return {
    speedMps,
    pacePer100mSec,
    pacePer100UnitSec,
    unit,
    shortDistance: short.distance,
    longDistance: long.distance,
    shortTimeSec: short.timeSec,
    longTimeSec: long.timeSec,
    zones: CSS_ZONES.map((zone) => ({
      ...zone,
      paceStartSec: pacePer100MetersToUnit(
        pacePer100mSec + zone.offsetStart,
        unit,
      ),
      paceEndSec: pacePer100MetersToUnit(pacePer100mSec + zone.offsetEnd, unit),
    })),
  };
}

export function formatPaceClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "—";
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatSpeedMps(speedMps: number): string {
  if (!Number.isFinite(speedMps) || speedMps <= 0) return "—";
  return speedMps.toFixed(3);
}

export function isUnusualCssPace(pacePer100mSec: number): boolean {
  return pacePer100mSec < 55 || pacePer100mSec > 180;
}
