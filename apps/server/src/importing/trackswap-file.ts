import TrackSwap, {
  detectFITKinds,
  TrackSwapError,
  type FITPrimaryKind,
  type FileType,
  type TrackDocument,
  type TrackInput,
} from 'trackswap';
import type {
  TrackFileInspection,
  TrackFileConversionResult,
} from '@shared/track-file-contract';
import {
  assertTrackFileConvertible,
  assessTrackFileConversion,
  hasTrackCoordinates,
  trackFileRecords,
  TrackFileConversionError,
} from './track-file-conversion';

export type { FITPrimaryKind } from 'trackswap';

export const TRACK_FILE_FORMATS = ['fit', 'gpx', 'tcx'] as const;
export type TrackFileFormat = (typeof TRACK_FILE_FORMATS)[number];

export type TrackFileValidationCode =
  | 'FORMAT_MISMATCH'
  | 'ACTIVITY_NOT_FOUND'
  | 'ACTIVITY_RECORD_COUNT_MISMATCH';

export class TrackFileValidationError extends Error {
  constructor(
    readonly code: TrackFileValidationCode,
    message: string,
    readonly details: {
      detectedFormat?: TrackFileFormat;
      expectedFormat?: TrackFileFormat;
      filename?: string;
      decodedRecordCount?: number;
      canonicalRecordCount?: number;
    } = {},
  ) {
    super(message);
    this.name = 'TrackFileValidationError';
  }
}

export function assertFITActivityRecordParity(args: {
  detectedFormat: TrackFileFormat;
  document: TrackDocument;
  activity: FileType;
  filename?: string;
}): void {
  if (args.detectedFormat !== 'fit') return;
  const decodedRecordCount =
    args.document.diagnostics.fit?.messageCounts.recordMesgs;
  if (typeof decodedRecordCount !== 'number') return;

  const canonicalRecordCount = trackFileRecords(args.activity).length;
  if (decodedRecordCount === canonicalRecordCount) return;

  throw new TrackFileValidationError(
    'ACTIVITY_RECORD_COUNT_MISMATCH',
    `FIT record count mismatch: decoded ${decodedRecordCount}, canonicalized ${canonicalRecordCount}`,
    {
      detectedFormat: args.detectedFormat,
      filename: args.filename,
      decodedRecordCount,
      canonicalRecordCount,
    },
  );
}

export interface DecodedTrackFile {
  activity: FileType;
  document: TrackDocument;
  detectedFormat: TrackFileFormat;
  extensionFormat?: TrackFileFormat;
  extensionMismatch: boolean;
}

export interface DecodedTrackDocument {
  document: TrackDocument;
  detectedFormat: TrackFileFormat;
  extensionFormat?: TrackFileFormat;
  extensionMismatch: boolean;
}

function isTrackFileFormat(value: string): value is TrackFileFormat {
  return (TRACK_FILE_FORMATS as readonly string[]).includes(value);
}

export function trackFormatFromFilename(
  filename?: string,
): TrackFileFormat | undefined {
  const extension = filename?.split('.').pop()?.trim().toLowerCase();
  return extension && isTrackFileFormat(extension) ? extension : undefined;
}

export function detectTrackFITKinds(
  messages: Parameters<typeof detectFITKinds>[0],
): FITPrimaryKind[] {
  return detectFITKinds(messages);
}

function asBuiltInFormat(format: string): TrackFileFormat {
  if (!isTrackFileFormat(format)) {
    throw new TrackSwapError(
      'FORMAT_UNSUPPORTED',
      `Unsupported track format: ${format}`,
      { format },
    );
  }
  return format;
}

async function withTrackSwap<T>(
  operation: (trackSwap: TrackSwap) => Promise<T>,
): Promise<T> {
  const trackSwap = new TrackSwap();
  try {
    return await operation(trackSwap);
  } finally {
    await trackSwap.dispose();
  }
}

function assertExpectedFormat(args: {
  detectedFormat: TrackFileFormat;
  expectedFormat?: TrackFileFormat;
  filename?: string;
}) {
  if (args.expectedFormat && args.expectedFormat !== args.detectedFormat) {
    throw new TrackFileValidationError(
      'FORMAT_MISMATCH',
      `Expected ${args.expectedFormat.toUpperCase()} but detected ${args.detectedFormat.toUpperCase()}`,
      args,
    );
  }
}

export async function decodeTrackDocument(
  input: TrackInput,
  options: {
    filename?: string;
    expectedFormat?: TrackFileFormat;
    includeNative?: boolean;
  } = {},
): Promise<DecodedTrackDocument> {
  return withTrackSwap(async (trackSwap) => {
    const detectedFormat = asBuiltInFormat(trackSwap.detect(input));
    assertExpectedFormat({
      detectedFormat,
      expectedFormat: options.expectedFormat,
      filename: options.filename,
    });
    const document = await trackSwap.decode(input, {
      format: detectedFormat,
      includeNative: options.includeNative,
    });
    const extensionFormat = trackFormatFromFilename(options.filename);
    return {
      document,
      detectedFormat,
      extensionFormat,
      extensionMismatch:
        extensionFormat !== undefined && extensionFormat !== detectedFormat,
    };
  });
}

export async function decodeTrackFile(
  input: TrackInput,
  options: {
    filename?: string;
    expectedFormat?: TrackFileFormat;
  } = {},
): Promise<DecodedTrackFile> {
  const decoded = await decodeTrackDocument(input, options);
  const activity = decoded.document.facets.activity;
  if (!activity) {
    throw new TrackFileValidationError(
      'ACTIVITY_NOT_FOUND',
      `The ${decoded.detectedFormat.toUpperCase()} file has no activity data`,
      { detectedFormat: decoded.detectedFormat, filename: options.filename },
    );
  }
  assertFITActivityRecordParity({
    detectedFormat: decoded.detectedFormat,
    document: decoded.document,
    activity,
    filename: options.filename,
  });
  if (options.filename && activity.metadata) {
    activity.metadata.fileName = options.filename;
  }
  return { ...decoded, activity };
}

export async function decodeTrackActivity(
  input: TrackInput,
  options: {
    filename?: string;
    expectedFormat?: TrackFileFormat;
  } = {},
): Promise<FileType> {
  return (await decodeTrackFile(input, options)).activity;
}

export async function transcodeTrackFile(
  input: TrackInput,
  targetFormat: TrackFileFormat,
  options: {
    expectedFormat?: TrackFileFormat;
    filename?: string;
  } = {},
): Promise<{
  content: Buffer;
  sourceFormat: TrackFileFormat;
  report: TrackFileConversionResult;
}> {
  return withTrackSwap(async (trackSwap) => {
    const sourceFormat = asBuiltInFormat(trackSwap.detect(input));
    assertExpectedFormat({
      detectedFormat: sourceFormat,
      expectedFormat: options.expectedFormat,
      filename: options.filename,
    });
    const document = await trackSwap.decode(input, { format: sourceFormat });
    const source = document.facets.activity;
    if (!source) {
      throw new TrackFileValidationError(
        'ACTIVITY_NOT_FOUND',
        'No activity data',
        { filename: options.filename },
      );
    }
    assertTrackFileConvertible(source, targetFormat);
    const content = await trackSwap.encodeActivity(source, {
      format: targetFormat,
    });
    let outputDocument: TrackDocument;
    try {
      outputDocument = await trackSwap.decode(content, {
        format: targetFormat,
      });
    } catch {
      throw new TrackFileConversionError(
        'OUTPUT_INVALID',
        'Generated file cannot be read as an activity',
      );
    }
    const output = outputDocument.facets.activity;
    if (!output)
      throw new TrackFileConversionError(
        'OUTPUT_INVALID',
        'Generated file has no activity data',
      );
    const health = document.facets.health;
    const report = assessTrackFileConversion({
      source,
      output,
      sourceFormat,
      targetFormat,
      sourceWarningCount: document.diagnostics.warnings.length,
      outputWarningCount: outputDocument.diagnostics.warnings.length,
      hasNonActivityData: Boolean(
        health &&
        (health.points.length ||
          health.intervals.length ||
          health.sessions.length ||
          health.summaries.length),
      ),
    });
    return { content, sourceFormat, report };
  });
}

export async function encodeTrackActivity(
  activity: FileType,
  targetFormat: TrackFileFormat,
): Promise<Buffer> {
  return withTrackSwap((trackSwap) =>
    trackSwap.encodeActivity(activity, { format: targetFormat }),
  );
}

export async function encodeTrackCourse(input: TrackInput): Promise<Buffer> {
  return withTrackSwap((trackSwap) => trackSwap.encodeCourse(input));
}

/**
 * 使用 TrackSwap 检查文件内容是否符合预期格式，并返回文件的格式、种类、活动、健康等信息。
 * @param input
 * @param filename 文件名，用于获取文件扩展名
 * @returns 文件检查结果
 */
export async function inspectTrackFile(
  input: TrackInput,
  filename?: string,
): Promise<TrackFileInspection> {
  return withTrackSwap(async (trackSwap) => {
    const format = asBuiltInFormat(trackSwap.detect(input));
    const document = await trackSwap.decode(input, { format });
    const extensionFormat = trackFormatFromFilename(filename);
    const activity = document.facets.activity;
    const activities = activity?.activities ?? [];
    const laps = activities.flatMap((item) => item.laps ?? []);
    const health = document.facets.health;
    const sports = [
      ...new Set(
        activities
          .map((item) => item.sport)
          .filter((sport): sport is string => Boolean(sport)),
      ),
    ];

    return {
      format,
      kinds: document.kinds,
      byteLength: document.source.byteLength,
      extensionFormat,
      extensionMismatch:
        extensionFormat !== undefined && extensionFormat !== format,
      metadata: {
        creator: document.metadata.creator,
        createdAt: document.metadata.createdAt,
        fileType: document.metadata.fileType,
        manufacturer: document.metadata.manufacturer,
        product: document.metadata.product,
        productName: document.metadata.productName,
        softwareVersion: document.metadata.softwareVersion,
      },
      activity:
        activities.length > 0 ||
        (activity?.routes?.length ?? 0) > 0 ||
        (activity?.points?.length ?? 0) > 0
          ? {
              activityCount: activities.length,
              lapCount: laps.length,
              recordCount: trackFileRecords(activity!).length,
              coordinateCount: trackFileRecords(activity!).filter(
                hasTrackCoordinates,
              ).length,
              sports,
              startTime: activities[0]?.startTime,
              totalDistance: activities.reduce(
                (total, item) => total + (item.totalDistance ?? 0),
                0,
              ),
              totalElapsedTime: activities.reduce(
                (total, item) => total + (item.totalElapsedTime ?? 0),
                0,
              ),
            }
          : undefined,
      health: health
        ? {
            pointCount: health.points.length,
            intervalCount: health.intervals.length,
            summaryCount: health.summaries.length,
            sessionCount: health.sessions.length,
          }
        : undefined,
      warnings: document.diagnostics.warnings,
    };
  });
}
