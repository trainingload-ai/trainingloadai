import type {
  FitMessage,
  FitRecordTrendPoint,
  FitRoutePoint,
  FitVisualization,
} from "./fit-view-model";
import { semicirclesToDegrees } from "./fit-value-format";

const EARTH_RADIUS_M = 6_371_000;
const MAX_ROUTE_POINTS = 1_500;
const MAX_TREND_POINTS = 1_200;
const TREND_METRICS = [
  "speedMps",
  "altitudeM",
  "heartRateBpm",
  "powerW",
  "cadenceRpm",
  "temperatureC",
  "gradePercent",
] as const satisfies ReadonlyArray<keyof FitRecordTrendPoint>;

function finite(row: FitMessage, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function round(value: number, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function range(values: number[]) {
  if (values.length === 0) return 0;
  let minimum = values[0];
  let maximum = values[0];
  for (const value of values) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  return maximum - minimum;
}

function sample<T>(values: T[], maximum: number) {
  if (values.length <= maximum) return values;
  const lastIndex = values.length - 1;
  return Array.from(
    { length: maximum },
    (_, index) => values[Math.round((index * lastIndex) / (maximum - 1))],
  );
}

function sampleTrends(
  values: FitRecordTrendPoint[],
  maximum: number,
): FitRecordTrendPoint[] {
  if (values.length <= maximum) return values;
  const metrics = TREND_METRICS.filter((metric) =>
    values.some((point) => point[metric] !== undefined),
  );
  if (metrics.length === 0) return sample(values, maximum);

  const pointsPerBucket = 2 + metrics.length * 2;
  const bucketCount = Math.max(1, Math.floor((maximum - 2) / pointsPerBucket));
  const interior = values.slice(1, -1);
  const bucketSize = Math.ceil(interior.length / bucketCount);
  const selected = new Set<number>([0, values.length - 1]);

  for (let start = 0; start < interior.length; start += bucketSize) {
    const end = Math.min(interior.length, start + bucketSize);
    selected.add(start + 1);
    selected.add(end);
    for (const metric of metrics) {
      let minimumIndex: number | undefined;
      let maximumIndex: number | undefined;
      for (let index = start; index < end; index += 1) {
        const value = interior[index][metric];
        if (typeof value !== "number") continue;
        if (
          minimumIndex === undefined ||
          value < (interior[minimumIndex][metric] as number)
        ) {
          minimumIndex = index;
        }
        if (
          maximumIndex === undefined ||
          value > (interior[maximumIndex][metric] as number)
        ) {
          maximumIndex = index;
        }
      }
      if (minimumIndex !== undefined) selected.add(minimumIndex + 1);
      if (maximumIndex !== undefined) selected.add(maximumIndex + 1);
    }
  }

  const sampled = [...selected]
    .toSorted((left, right) => left - right)
    .map((index) => values[index]);
  return sampled.length <= maximum ? sampled : sample(sampled, maximum);
}

function timestampMs(row: FitMessage) {
  const value = row.timestamp;
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function coordinate(row: FitMessage) {
  const latitude = finite(row, "positionLat");
  const longitude = finite(row, "positionLong");
  if (latitude === undefined || longitude === undefined) return undefined;
  const lat = semicirclesToDegrees(latitude);
  const lon = semicirclesToDegrees(longitude);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : undefined;
}

function coordinateDistance(left: FitMessage, right: FitMessage) {
  const from = coordinate(left);
  const to = coordinate(right);
  if (!from || !to) return undefined;
  const meanLatitude = (((from.lat + to.lat) / 2) * Math.PI) / 180;
  const x = (((to.lon - from.lon) * Math.PI) / 180) * Math.cos(meanLatitude);
  const y = ((to.lat - from.lat) * Math.PI) / 180;
  return EARTH_RADIUS_M * Math.sqrt(x * x + y * y);
}

function segmentSpeed(left: FitMessage, right: FitMessage) {
  const leftTime = timestampMs(left);
  const rightTime = timestampMs(right);
  if (leftTime === undefined || rightTime === undefined) return undefined;
  const elapsedSeconds = (rightTime - leftTime) / 1_000;
  if (elapsedSeconds <= 0 || elapsedSeconds > 300) return undefined;
  const leftDistance = finite(left, "distance");
  const rightDistance = finite(right, "distance");
  const distance =
    leftDistance !== undefined &&
    rightDistance !== undefined &&
    rightDistance >= leftDistance
      ? rightDistance - leftDistance
      : coordinateDistance(left, right);
  if (distance === undefined) return undefined;
  const speed = distance / elapsedSeconds;
  return Number.isFinite(speed) && speed >= 0 && speed <= 80
    ? round(speed)
    : undefined;
}

function recordSpeeds(records: FitMessage[]) {
  return records.map((record, index) => {
    const recorded = finite(record, "enhancedSpeed", "speed");
    if (recorded !== undefined && recorded >= 0) return recorded;
    if (index > 0) {
      const previous = segmentSpeed(records[index - 1], record);
      if (previous !== undefined) return previous;
    }
    if (index < records.length - 1) {
      return segmentSpeed(record, records[index + 1]);
    }
    return undefined;
  });
}

function cadence(row: FitMessage) {
  const whole = finite(row, "cadence");
  const fractional = finite(row, "fractionalCadence");
  if (whole === undefined) return undefined;
  return whole + (fractional ?? 0);
}

function buildTrends(records: FitMessage[], speeds: Array<number | undefined>) {
  const firstTimestamp = records.reduce<number | undefined>((first, record) => {
    if (first !== undefined) return first;
    return timestampMs(record);
  }, undefined);

  const trends = records
    .map((record, index): FitRecordTrendPoint => {
      const currentTimestamp = timestampMs(record);
      return {
        index,
        elapsedSec:
          firstTimestamp !== undefined &&
          currentTimestamp !== undefined &&
          currentTimestamp >= firstTimestamp
            ? round((currentTimestamp - firstTimestamp) / 1_000, 1)
            : undefined,
        distanceM: finite(record, "distance"),
        speedMps: speeds[index],
        altitudeM: finite(record, "enhancedAltitude", "altitude"),
        heartRateBpm: finite(record, "heartRate"),
        powerW: finite(record, "power"),
        cadenceRpm: cadence(record),
        temperatureC: finite(record, "temperature"),
        gradePercent: finite(record, "grade"),
      };
    })
    .filter((point) =>
      [
        point.speedMps,
        point.altitudeM,
        point.heartRateBpm,
        point.powerW,
        point.cadenceRpm,
        point.temperatureC,
        point.gradePercent,
      ].some((value) => value !== undefined),
    );
  return sampleTrends(trends, MAX_TREND_POINTS);
}

function buildRoute(records: FitMessage[], speeds: Array<number | undefined>) {
  const geolocated = records
    .map((record, index) => ({ record, index, coordinate: coordinate(record) }))
    .filter(
      (
        item,
      ): item is {
        record: FitMessage;
        index: number;
        coordinate: { lat: number; lon: number };
      } => item.coordinate !== undefined,
    );
  if (geolocated.length < 2) {
    return { route3d: [] as FitRoutePoint[], verticalExaggeration: 1 };
  }

  const centerLat =
    geolocated.reduce((sum, item) => sum + item.coordinate.lat, 0) /
    geolocated.length;
  const centerLon =
    geolocated.reduce((sum, item) => sum + item.coordinate.lon, 0) /
    geolocated.length;
  const centerLatRad = (centerLat * Math.PI) / 180;
  const route3d: FitRoutePoint[] = sample(geolocated, MAX_ROUTE_POINTS).map(
    ({ record, index, coordinate: point }) => ({
      xM: round(
        EARTH_RADIUS_M *
          (((point.lon - centerLon) * Math.PI) / 180) *
          Math.cos(centerLatRad),
      ),
      zM: round(-EARTH_RADIUS_M * (((point.lat - centerLat) * Math.PI) / 180)),
      altitudeM: finite(record, "enhancedAltitude", "altitude"),
      distanceM: finite(record, "distance"),
      speedMps: speeds[index],
    }),
  );
  const altitudes = route3d
    .map((point) => point.altitudeM)
    .filter((value): value is number => value !== undefined);
  const xValues = route3d.map((point) => point.xM);
  const zValues = route3d.map((point) => point.zM);
  const horizontalExtent = Math.max(range(xValues), range(zValues));
  if (horizontalExtent < 1) {
    return { route3d: [] as FitRoutePoint[], verticalExaggeration: 1 };
  }
  const altitudeRange = range(altitudes);
  const verticalExaggeration =
    altitudeRange > 0
      ? round(
          Math.min(8, Math.max(2, (horizontalExtent * 0.15) / altitudeRange)),
          1,
        )
      : 1;

  return {
    route3d,
    verticalExaggeration,
  };
}

export function buildFitVisualization(records: FitMessage[]): FitVisualization {
  const speeds = recordSpeeds(records);
  const route = buildRoute(records, speeds);
  return {
    ...route,
    trends: buildTrends(records, speeds),
  };
}
