export const MAX_FIT_FILE_BYTES = 25 * 1024 * 1024;

export type FitValue =
  | null
  | string
  | number
  | boolean
  | FitValue[]
  | { [key: string]: FitValue };

export type FitMessage = Record<string, FitValue>;

export type FitFieldSource = "profile" | "developer" | "derived" | "unknown";

export type FitFieldDescriptor = {
  key: string;
  number: number | null;
  units: string | null;
  type: string | null;
  source: FitFieldSource;
};

export type FitMessageGroup = {
  key: string;
  label: string;
  messageNumber: number | null;
  profileDefined: boolean;
  count: number;
  fields: FitFieldDescriptor[];
};

export type FitFileHeader = {
  headerSize: number;
  protocolVersion: string;
  profileVersion: string;
  dataSize: number;
  signature: string;
};

export type FitFileIdentity = {
  type: string | null;
  manufacturer: string | null;
  product: string | null;
  serialNumber: string | null;
  createdAt: string | null;
  sport: string | null;
  subSport: string | null;
};

export type FitFileSummary = {
  startedAt: string | null;
  elapsedSeconds: number | null;
  timerSeconds: number | null;
  distanceMeters: number | null;
  calories: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  averagePower: number | null;
  maxPower: number | null;
  laps: number;
  records: number;
  sessions: number;
};

export type FitDiagnostics = {
  isFit: boolean;
  integrityPassed: boolean;
  decoderErrors: string[];
  definitionCount: number;
  developerFieldCount: number;
  totalMessages: number;
  decodedWith: string;
  sdkProfileVersion: string;
};

export type FitRoutePoint = {
  xM: number;
  zM: number;
  altitudeM?: number;
  distanceM?: number;
  speedMps?: number;
};

export type FitRecordTrendPoint = {
  index: number;
  elapsedSec?: number;
  distanceM?: number;
  speedMps?: number;
  altitudeM?: number;
  heartRateBpm?: number;
  powerW?: number;
  cadenceRpm?: number;
  temperatureC?: number;
  gradePercent?: number;
};

export type FitVisualization = {
  route3d: FitRoutePoint[];
  trends: FitRecordTrendPoint[];
  verticalExaggeration: number;
};

export type FitViewModel = {
  fileName: string;
  fileSize: number;
  header: FitFileHeader;
  identity: FitFileIdentity;
  summary: FitFileSummary;
  diagnostics: FitDiagnostics;
  visualization: FitVisualization;
  groups: FitMessageGroup[];
};

export type FitPageResult = {
  group: string;
  query: string;
  page: number;
  pageSize: number;
  total: number;
  fields: FitFieldDescriptor[];
  rows: FitMessage[];
};

export type FitWorkerRequest =
  | {
      id: number;
      type: "parse";
      fileName: string;
      fileSize: number;
      buffer: ArrayBuffer;
    }
  | {
      id: number;
      type: "page";
      group: string;
      query: string;
      page: number;
      pageSize: number;
      includeUnknownData: boolean;
    }
  | {
      id: number;
      type: "export";
      format: "csv" | "json";
      group?: string;
    };

export type FitWorkerRequestPayload = FitWorkerRequest extends infer Request
  ? Request extends { id: number }
    ? Omit<Request, "id">
    : never
  : never;

export type FitWorkerResponse =
  | { id: number; type: "parsed"; model: FitViewModel }
  | { id: number; type: "page"; result: FitPageResult }
  | {
      id: number;
      type: "export";
      content: string;
      mimeType: string;
      fileName: string;
    }
  | { id: number; type: "error"; message: string };
