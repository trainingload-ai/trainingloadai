export type WorkoutRoutePoint = {
  xM: number;
  zM: number;
  altitudeM?: number;
  distanceM?: number;
  speedMps?: number;
};

type Rgb = [number, number, number];

const SPEED_STOPS: Rgb[] = [
  [0.49, 0.23, 0.93],
  [0.15, 0.39, 0.92],
  [0.05, 0.72, 0.69],
  [0.98, 0.82, 0.19],
];

function quantileFloor(sorted: number[], ratio: number) {
  return sorted[Math.floor((sorted.length - 1) * ratio)];
}

function colorAt(value: number): Rgb {
  const scaled = Math.min(1, Math.max(0, value)) * (SPEED_STOPS.length - 1);
  const left = Math.floor(scaled);
  const right = Math.min(SPEED_STOPS.length - 1, left + 1);
  const amount = scaled - left;
  return SPEED_STOPS[left].map(
    (channel, index) =>
      channel + (SPEED_STOPS[right][index] - channel) * amount,
  ) as Rgb;
}

export function buildWorkoutRouteModel(
  points: WorkoutRoutePoint[],
  verticalExaggeration: number,
) {
  const centerX =
    points.reduce((sum, point) => sum + point.xM, 0) / points.length;
  const centerZ =
    points.reduce((sum, point) => sum + point.zM, 0) / points.length;
  const altitudeValues = points
    .map((point) => point.altitudeM)
    .filter((value): value is number => Number.isFinite(value));
  const minAltitude = altitudeValues.length ? Math.min(...altitudeValues) : 0;
  const speeds = points
    .map((point) => point.speedMps)
    .filter((value): value is number => Number.isFinite(value))
    .toSorted((a, b) => a - b);
  const minimum = speeds.length ? quantileFloor(speeds, 0.05) : 0;
  const clippedMaximum = speeds.length ? quantileFloor(speeds, 0.95) : 0;
  const observedMaximum = speeds.at(-1) ?? 0;
  const maximum =
    clippedMaximum <= minimum && observedMaximum > minimum
      ? observedMaximum
      : clippedMaximum;
  const variable =
    speeds.length >= 2 &&
    maximum - minimum >= Math.max(0.12, Math.abs(minimum) * 0.04);
  const range = Math.max(maximum - minimum, Number.EPSILON);
  const uniformColor: Rgb = [0.05, 0.72, 0.69];

  return {
    positions: points.map(
      (point) =>
        [
          point.xM - centerX,
          ((point.altitudeM ?? minAltitude) - minAltitude) *
            verticalExaggeration,
          centerZ - point.zM,
        ] as [number, number, number],
    ),
    colors: points.map((point) =>
      variable && Number.isFinite(point.speedMps)
        ? colorAt((point.speedMps! - minimum) / range)
        : uniformColor,
    ),
    speedRange: {
      minimum,
      maximum,
      available: speeds.length > 0,
      variable,
    },
    minAltitude,
    altitudeAvailable: altitudeValues.length > 0,
  };
}
