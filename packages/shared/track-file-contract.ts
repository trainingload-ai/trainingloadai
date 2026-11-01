export type TrackFileFormat = "fit" | "gpx" | "tcx";

export const TRACK_FILE_CONVERSION_REPORT_HEADER =
  "X-TrackSwap-Conversion-Report";

export type TrackFileMetric =
  | "heartRate"
  | "cadence"
  | "power"
  | "altitude"
  | "distance"
  | "speed"
  | "temperature"
  | "runningDynamics"
  | "swimming";

export type TrackFileConversionWarning =
  | { code: "POINTS_OMITTED"; count: number; total: number }
  | { code: "METRICS_NOT_PRESERVED"; metrics: TrackFileMetric[] }
  | { code: "SOURCE_WARNINGS"; count: number }
  | { code: "OUTPUT_WARNINGS"; count: number }
  | { code: "NON_ACTIVITY_DATA_OMITTED" };

export interface TrackFileConversionResult {
  sourceFormat: TrackFileFormat;
  inputRecords: number;
  outputRecords: number;
  warnings: TrackFileConversionWarning[];
}

/** Bounded, payload-free diagnostics alongside the existing binary download. */
export interface TrackFileConversionReport {
  version: 1;
  targetFormat: TrackFileFormat;
  files: TrackFileConversionResult[];
}

export interface TrackFileInspection {
  format: TrackFileFormat;
  kinds: string[];
  byteLength: number;
  extensionFormat?: TrackFileFormat;
  extensionMismatch: boolean;
  metadata: {
    creator?: string;
    createdAt?: string | Date;
    fileType?: string | number;
    manufacturer?: string | number;
    product?: string | number;
    productName?: string;
    softwareVersion?: number;
  };
  activity?: {
    activityCount: number;
    lapCount: number;
    recordCount: number;
    coordinateCount?: number;
    sports: string[];
    startTime?: string | Date;
    totalDistance?: number;
    totalElapsedTime?: number;
  };
  health?: {
    pointCount: number;
    intervalCount: number;
    summaryCount: number;
    sessionCount: number;
  };
  warnings: string[];
}

export interface TrackFileInspectionItem {
  filename: string;
  valid: boolean;
  inspection?: TrackFileInspection;
  error?: string;
}

export interface TrackFileInspectionResponse {
  items: TrackFileInspectionItem[];
}
