export const VDOT_MIN = 20;
export const VDOT_MAX = 85;
export const RUNNING_THRESHOLD_VVO2MAX_RATIO = 0.9;

export const VDOT_ZONE_KEYS = ["E", "M", "T", "I", "R"] as const;

export type VdotZoneKey = (typeof VDOT_ZONE_KEYS)[number];

export type VdotPaceRange = {
  fastSecPerKm: number;
  slowSecPerKm: number;
};

export type VdotPaceSnapshot = {
  vdot: number;
  unit: "sec/km";
  zones: Record<VdotZoneKey, VdotPaceRange>;
};

/**
 * Percent of VDOT (oxygen cost), Daniels/Gilbert.
 * Marathon (75–84%) and threshold (83–88%) share the 83–84% shoulder.
 * That overlap is the published model, not a fencepost error. Easy/marathon,
 * threshold/interval, and interval/repetition do not overlap. The gaps between
 * T and I, and I and R, are part of the same model: those paces are separate
 * workout intensities, not slices of one continuous zone chart.
 */
export const VDOT_ZONE_PERCENTAGES: Record<
  VdotZoneKey,
  { low: number; high: number }
> = {
  E: { low: 0.59, high: 0.74 },
  M: { low: 0.75, high: 0.84 },
  T: { low: 0.83, high: 0.88 },
  I: { low: 0.95, high: 1 },
  R: { low: 1.05, high: 1.1 },
};

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function isSupportedVdot(value: number) {
  return Number.isFinite(value) && value >= VDOT_MIN && value <= VDOT_MAX;
}

export function danielsVo2Demand(speedMetersPerMinute: number) {
  return (
    -4.6 +
    0.182258 * speedMetersPerMinute +
    0.000104 * speedMetersPerMinute * speedMetersPerMinute
  );
}

/**
 * Converts a running threshold anchor (TP or CS, persisted as m/s) into the
 * pace-equivalent VDOT used by the plan resolver. This is an internal pace
 * model conversion, not a measured VO2max value.
 */
export function estimateVdotFromThresholdSpeed(speedMetersPerSecond: number) {
  if (!Number.isFinite(speedMetersPerSecond) || speedMetersPerSecond <= 0) {
    return null;
  }
  const vVo2MaxMetersPerMinute =
    (speedMetersPerSecond * 60) / RUNNING_THRESHOLD_VVO2MAX_RATIO;
  const equivalentVdot = danielsVo2Demand(vVo2MaxMetersPerMinute);
  return Number.isFinite(equivalentVdot) && equivalentVdot > 0
    ? round(equivalentVdot, 1)
    : null;
}

export function danielsFractionOfVo2max(timeMinutes: number) {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * timeMinutes) +
    0.2989558 * Math.exp(-0.1932605 * timeMinutes)
  );
}

export function solveSpeedForVo2Demand(targetVo2: number) {
  if (!Number.isFinite(targetVo2) || targetVo2 <= 0) return null;

  let low = 20;
  let high = 700;
  for (let index = 0; index < 60; index += 1) {
    const midpoint = (low + high) / 2;
    if (danielsVo2Demand(midpoint) < targetVo2) {
      low = midpoint;
    } else {
      high = midpoint;
    }
  }

  const speedMetersPerMinute = (low + high) / 2;
  return Number.isFinite(speedMetersPerMinute) && speedMetersPerMinute > 0
    ? speedMetersPerMinute
    : null;
}

function paceRangeForZone(vdot: number, zone: VdotZoneKey) {
  if (!isSupportedVdot(vdot)) {
    throw new RangeError(`VDOT must be between ${VDOT_MIN} and ${VDOT_MAX}`);
  }

  const percentages = VDOT_ZONE_PERCENTAGES[zone];
  const slowSpeed = solveSpeedForVo2Demand(vdot * percentages.low);
  const fastSpeed = solveSpeedForVo2Demand(vdot * percentages.high);
  if (!slowSpeed || !fastSpeed) {
    throw new Error(`Could not resolve ${zone} pace for VDOT ${vdot}`);
  }

  return {
    fastSecPerKm: (1000 / fastSpeed) * 60,
    slowSecPerKm: (1000 / slowSpeed) * 60,
  };
}

/** Unrounded sec/km. Round once at display; do not round this value again. */
export function resolveVdotPaceRangeExact(
  vdot: number,
  zone: VdotZoneKey,
): VdotPaceRange {
  return paceRangeForZone(vdot, zone);
}

export function resolveVdotPaceRange(
  vdot: number,
  zone: VdotZoneKey,
): VdotPaceRange {
  const exact = paceRangeForZone(vdot, zone);
  return {
    fastSecPerKm: Math.round(exact.fastSecPerKm),
    slowSecPerKm: Math.round(exact.slowSecPerKm),
  };
}

export function resolveVdotPaces(vdot: number): VdotPaceSnapshot {
  const normalizedVdot = round(vdot, 1);
  return {
    vdot: normalizedVdot,
    unit: "sec/km",
    zones: Object.fromEntries(
      VDOT_ZONE_KEYS.map((zone) => [
        zone,
        resolveVdotPaceRange(normalizedVdot, zone),
      ]),
    ) as Record<VdotZoneKey, VdotPaceRange>,
  };
}

export function computeVdotForDistanceTime(
  distanceMeters: number,
  timeSeconds: number,
) {
  if (
    !Number.isFinite(distanceMeters) ||
    distanceMeters <= 0 ||
    !Number.isFinite(timeSeconds) ||
    timeSeconds <= 0
  ) {
    return null;
  }

  const timeMinutes = timeSeconds / 60;
  const speedMetersPerMinute = distanceMeters / timeMinutes;
  const oxygenDemand = danielsVo2Demand(speedMetersPerMinute);
  const fraction = danielsFractionOfVo2max(timeMinutes);
  const vdot = oxygenDemand / fraction;
  return Number.isFinite(vdot) && vdot > 0 ? vdot : null;
}

export function predictTimeForVdot(distanceMeters: number, targetVdot: number) {
  if (
    !Number.isFinite(distanceMeters) ||
    distanceMeters <= 0 ||
    !isSupportedVdot(targetVdot)
  ) {
    return null;
  }

  let low = distanceMeters / 7;
  let high = distanceMeters / 1.2;

  for (let index = 0; index < 80; index += 1) {
    const midpoint = (low + high) / 2;
    const estimate = computeVdotForDistanceTime(distanceMeters, midpoint);
    if (!estimate) return null;
    if (estimate > targetVdot) {
      low = midpoint;
    } else {
      high = midpoint;
    }
  }

  const seconds = (low + high) / 2;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export function formatPaceSeconds(
  secondsPerKm: number,
  unitSystem: "METRIC" | "IMPERIAL" = "METRIC",
) {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "—";
  const seconds =
    unitSystem === "IMPERIAL" ? secondsPerKm * 1.609344 : secondsPerKm;
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}/${
    unitSystem === "IMPERIAL" ? "mi" : "km"
  }`;
}

export function formatVdotPaceRange(
  range: VdotPaceRange,
  unitSystem: "METRIC" | "IMPERIAL" = "METRIC",
) {
  return `${formatPaceSeconds(range.fastSecPerKm, unitSystem)}–${formatPaceSeconds(
    range.slowSecPerKm,
    unitSystem,
  )}`;
}

export function formatRaceDuration(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "—";
  const rounded = Math.round(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(
      seconds,
    ).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
