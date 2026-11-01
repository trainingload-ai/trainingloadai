import type { ActivityRecordType, FileType } from 'trackswap';
import type {
  TrackFileConversionResult,
  TrackFileFormat,
  TrackFileMetric,
} from '@shared/track-file-contract';

export class TrackFileConversionError extends Error {
  constructor(
    readonly code:
      | 'GPX_COORDINATES_REQUIRED'
      | 'RECORDS_REQUIRED'
      | 'TIMESTAMPS_REQUIRED'
      | 'OUTPUT_INVALID',
    readonly reason: string,
  ) {
    super(`${code}: ${reason}`);
    this.name = 'TrackFileConversionError';
  }
}

export function trackFileRecords(file: FileType): ActivityRecordType[] {
  return [
    ...(file.activities ?? []).flatMap((activity) =>
      (activity.laps ?? []).flatMap((lap) => lap.records ?? []),
    ),
    ...(file.routes ?? []).flatMap((route) => route.records ?? []),
    ...(file.points ?? []),
  ];
}

export function hasTrackCoordinates(record: ActivityRecordType): boolean {
  const lat = record.positionLat;
  const lon = record.positionLong;
  return (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lon === 'number' &&
    Number.isFinite(lon) &&
    lon >= -180 &&
    lon < 180
  );
}

export function assertTrackFileConvertible(
  file: FileType,
  target: TrackFileFormat,
): void {
  const records = trackFileRecords(file);
  if (records.length === 0) {
    throw new TrackFileConversionError(
      'RECORDS_REQUIRED',
      'No activity points',
    );
  }
  if (target === 'gpx' && !records.some(hasTrackCoordinates)) {
    throw new TrackFileConversionError(
      'GPX_COORDINATES_REQUIRED',
      'GPX requires at least one point with usable GPS coordinates',
    );
  }
  if (
    target !== 'gpx' &&
    records.some(
      (record) =>
        !record.timestamp ||
        !Number.isFinite(new Date(record.timestamp).getTime()),
    )
  ) {
    throw new TrackFileConversionError(
      'TIMESTAMPS_REQUIRED',
      'Target format requires timestamps for every point',
    );
  }
}

type MetricDefinition = {
  metric: TrackFileMetric;
  fields: string[];
  tolerance: number;
};

const METRICS: MetricDefinition[] = [
  { metric: 'heartRate', fields: ['heartRate'], tolerance: 0.5 },
  {
    metric: 'cadence',
    fields: ['cadence', 'fractionalCadence'],
    tolerance: 0.5,
  },
  { metric: 'power', fields: ['power'], tolerance: 0.5 },
  {
    metric: 'altitude',
    fields: ['enhancedAltitude', 'altitude'],
    tolerance: 1,
  },
  { metric: 'distance', fields: ['distance'], tolerance: 0.1 },
  { metric: 'speed', fields: ['enhancedSpeed', 'speed'], tolerance: 0.02 },
  { metric: 'temperature', fields: ['temperature'], tolerance: 0.5 },
  {
    metric: 'runningDynamics',
    fields: [
      'verticalOscillation',
      'stanceTime',
      'verticalRatio',
      'stepLength',
      'cycleLength16',
    ],
    tolerance: 0.1,
  },
  {
    metric: 'swimming',
    fields: ['swimStroke', 'totalStrokes', 'cycles'],
    tolerance: 0.1,
  },
];

function recordValue(record: ActivityRecordType, key: string): unknown {
  return (record as unknown as Record<string, unknown>)[key];
}

function measurementValue(
  record: ActivityRecordType,
  keys: string[],
): number | string | undefined {
  for (const key of keys) {
    const value = recordValue(record, key);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/** Re-read the generated file: a byte buffer alone is never proof of success. */
export function assessTrackFileConversion(args: {
  source: FileType;
  output: FileType;
  sourceFormat: TrackFileFormat;
  targetFormat: TrackFileFormat;
  sourceWarningCount: number;
  outputWarningCount?: number;
  hasNonActivityData: boolean;
}): TrackFileConversionResult {
  const input = trackFileRecords(args.source);
  const output = trackFileRecords(args.output);
  const expected =
    args.targetFormat === 'gpx' ? input.filter(hasTrackCoordinates) : input;
  if (output.length === 0 || output.length !== expected.length) {
    throw new TrackFileConversionError(
      'OUTPUT_INVALID',
      'Output point count does not match the convertible input',
    );
  }
  if (
    (args.output.activities?.length ?? 0) <
    (args.source.activities?.length ?? 0)
  ) {
    throw new TrackFileConversionError(
      'OUTPUT_INVALID',
      'Output is missing an activity',
    );
  }

  const missingMetrics = new Set<TrackFileMetric>();
  for (let index = 0; index < expected.length; index++) {
    const before = expected[index];
    const after = output[index];
    const beforeHasCoordinates = hasTrackCoordinates(before);
    if (beforeHasCoordinates !== hasTrackCoordinates(after)) {
      throw new TrackFileConversionError(
        'OUTPUT_INVALID',
        'Output coordinate coverage changed',
      );
    }
    if (beforeHasCoordinates) {
      const longitudeDelta = Math.abs(
        before.positionLong! - after.positionLong!,
      );
      if (
        Math.abs(before.positionLat! - after.positionLat!) > 0.00001 ||
        Math.min(longitudeDelta, 360 - longitudeDelta) > 0.00001
      ) {
        throw new TrackFileConversionError(
          'OUTPUT_INVALID',
          'Output coordinates changed',
        );
      }
    }
    const beforeTime = before.timestamp && new Date(before.timestamp).getTime();
    const afterTime = after.timestamp && new Date(after.timestamp).getTime();
    if (
      typeof beforeTime === 'number' &&
      Number.isFinite(beforeTime) &&
      (typeof afterTime !== 'number' ||
        !Number.isFinite(afterTime) ||
        Math.abs(beforeTime - afterTime) >= 1000)
    ) {
      throw new TrackFileConversionError(
        'OUTPUT_INVALID',
        'Output timestamps changed',
      );
    }
    for (const { metric, fields, tolerance } of METRICS) {
      // Enhanced and base altitude/speed describe the same measurement.
      const groups =
        metric === 'altitude' || metric === 'speed'
          ? [fields]
          : fields.map((field) => [field]);
      for (const group of groups) {
        const value = measurementValue(before, group);
        const result = measurementValue(after, group);
        if (
          value !== undefined &&
          (result === undefined ||
            (typeof value === 'number' && typeof result === 'number'
              ? Math.abs(value - result) > tolerance
              : value !== result))
        ) {
          missingMetrics.add(metric);
        }
      }
    }
  }

  const result: TrackFileConversionResult = {
    sourceFormat: args.sourceFormat,
    inputRecords: input.length,
    outputRecords: output.length,
    warnings: [],
  };
  if (input.length > output.length) {
    result.warnings.push({
      code: 'POINTS_OMITTED',
      count: input.length - output.length,
      total: input.length,
    });
  }
  if (missingMetrics.size > 0) {
    result.warnings.push({
      code: 'METRICS_NOT_PRESERVED',
      metrics: [...missingMetrics],
    });
  }
  if (args.sourceWarningCount > 0) {
    result.warnings.push({
      code: 'SOURCE_WARNINGS',
      count: args.sourceWarningCount,
    });
  }
  if (args.outputWarningCount) {
    result.warnings.push({
      code: 'OUTPUT_WARNINGS',
      count: args.outputWarningCount,
    });
  }
  if (args.hasNonActivityData) {
    result.warnings.push({ code: 'NON_ACTIVITY_DATA_OMITTED' });
  }
  return result;
}
