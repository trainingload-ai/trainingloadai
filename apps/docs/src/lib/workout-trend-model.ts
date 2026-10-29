export type WorkoutTrendPoint = {
  index: number;
  elapsedSec?: number;
  distanceM?: number;
  altitudeM?: number;
  speedMps?: number;
  heartRateBpm?: number;
  powerW?: number;
  cadence?: number;
};

export type WorkoutTrendMetric =
  | "paceSecPerKm"
  | "speedKph"
  | "heartRateBpm"
  | "powerW"
  | "altitudeM";

export type WorkoutTrendChartDatum = {
  x: number;
  paceSecPerKm?: number;
  speedKph?: number;
  heartRateBpm?: number;
  powerW?: number;
  altitudeM?: number;
};

function round(value: number, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function isPaceSport(sport: string) {
  return sport === "RUN";
}

export function speedMpsToPaceSecPerKm(speedMps: number | undefined) {
  return typeof speedMps === "number" && Number.isFinite(speedMps) && speedMps > 0
    ? 1_000 / speedMps
    : undefined;
}

export function formatPace(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return "—";
  const roundedSeconds = Math.round(value);
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function buildWorkoutTrendChartData(
  points: WorkoutTrendPoint[],
  sport: string,
) {
  const distances = points
    .map((point) => point.distanceM)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const elapsed = points
    .map((point) => point.elapsedSec)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const axis =
    distances.length >= 2 && Math.max(...distances) - Math.min(...distances) > 0
      ? ("distance" as const)
      : elapsed.length >= 2 && Math.max(...elapsed) - Math.min(...elapsed) > 0
        ? ("elapsed" as const)
        : ("index" as const);
  const paceSport = isPaceSport(sport);
  const data: WorkoutTrendChartDatum[] = points.map((point) => {
    const pace = speedMpsToPaceSecPerKm(point.speedMps);
    return {
      x: round(
        axis === "distance"
          ? (point.distanceM ?? 0) / 1_000
          : axis === "elapsed"
            ? (point.elapsedSec ?? 0) / 60
            : point.index,
      ),
      paceSecPerKm: paceSport && pace !== undefined ? round(pace) : undefined,
      speedKph:
        !paceSport && point.speedMps !== undefined
          ? round(point.speedMps * 3.6)
          : undefined,
      heartRateBpm: point.heartRateBpm,
      powerW: point.powerW,
      altitudeM: point.altitudeM,
    };
  });
  const preferredSpeedMetric: WorkoutTrendMetric = paceSport
    ? "paceSecPerKm"
    : "speedKph";
  const availableMetrics = (
    [preferredSpeedMetric, "heartRateBpm", "powerW", "altitudeM"] as const
  ).filter((metric) => data.some((point) => point[metric] !== undefined));

  return { axis, data, availableMetrics };
}
