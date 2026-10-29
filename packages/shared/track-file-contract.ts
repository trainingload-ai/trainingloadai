export type TrackFileFormat = 'fit' | 'gpx' | 'tcx';

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
