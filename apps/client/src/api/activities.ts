import { apiFetch } from "@/lib/api";
import type { TrackFileInspectionResponse } from "@shared/track-file-contract";
import type { ActivityWeatherSnapshot } from "@shared/activity-weather";

// Sport type enum
export enum SportType {
  RUN = "RUN",
  CYCLING = "CYCLING",
  SWIM = "SWIM",
  STRETCHING = "STRETCHING",
  UNKNOWN = "UNKNOWN",
}

export enum ActivityProcessingStatus {
  RECEIVED = "RECEIVED",
  NORMALIZED = "NORMALIZED",
  DEDUPED = "DEDUPED",
  MATERIALIZED = "MATERIALIZED",
  PARQUET_READY = "PARQUET_READY",
  ANALYZING = "ANALYZING",
  READY = "READY",
  PARTIAL_FAILED = "PARTIAL_FAILED",

  FAILED = "FAILED",
}

// Request type for setting sport type
export interface ActivitySportTypeItem {
  hashId: string;
  fileName?: string;
  sportType: SportType;
  sportDefinitionCode?: string | null;
  subSportType?: string | null;
}

export interface SetActivitiesSportTypeRequest {
  activities: ActivitySportTypeItem[];
  enableSmartInfer?: boolean;
}

export type ImportBatchJobStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "PARTIAL_FAILED"
  | "FAILED"
  | "CANCELLED";

export type ImportItemJobStatus =
  | "QUEUED"
  | "NORMALIZING"
  | "MATERIALIZING"
  | "PARQUET_BUILDING"
  | "DONE"
  | "SKIPPED"
  | "FAILED"
  | "DEAD";

export type UserPostProcessJobStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "DEAD";

export interface ImportBatchPostProcessJob {
  id: string;
  status: UserPostProcessJobStatus;
  recomputeFrom?: string;
  recomputeTo?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportBatchSummary {
  id: string;
  userId?: string;
  sourceKind: string;
  status: ImportBatchJobStatus;
  totalCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  /** 服务端按该用户最早创建的 Activity 判定，前端不得自行猜测。 */
  isFirstActivityImport: boolean;
  requestContext?: unknown;
  summary?: unknown;
  startedAt?: string;
  completedAt?: string;
  notificationSentAt?: string;
  createdAt: string;
  updatedAt: string;
  counts?: {
    items: number;
    createdActivities: number;
    eventLogs: number;
  };
  postProcessJob: ImportBatchPostProcessJob | null;
}

export interface ImportBatchItem {
  id: string;
  position: number;
  status: ImportItemJobStatus;
  sourceKind: string;
  sourceUid: string;
  dedupeKey?: string;
  attempts: number;
  lastErrorCode?: string;
  lastError?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  sourceObject?: {
    id: string;
    sourceKind: string;
    provider?: string;
    externalId?: string;
    fileName?: string;
    fileKey?: string;
    objectType: string;
  };
  canonicalSnapshot?: {
    id: string;
    dedupeKey: string;
    sportType?: string;
    startTime?: string;
    createdAt: string;
  };
  activity?: {
    id: number;
    hashId: string;
    activityName?: string;
    sportType?: string;
    startTime?: string;
    status?: string;
    processingStatus?: string;
    processingUpdatedAt?: string;
    readyAt?: string;
  };
}

export interface ImportBatchItemsResponse {
  batchId: string;
  totalCount: number;
  items: ImportBatchItem[];
}

export const TERMINAL_IMPORT_BATCH_STATUSES: ImportBatchJobStatus[] = [
  "COMPLETED",
  "PARTIAL_FAILED",
  "FAILED",
  "CANCELLED",
];

export const TERMINAL_POST_PROCESS_STATUSES: UserPostProcessJobStatus[] = [
  "COMPLETED",
  "FAILED",
  "DEAD",
];

export const isTerminalImportBatchStatus = (status: ImportBatchJobStatus) =>
  TERMINAL_IMPORT_BATCH_STATUSES.includes(status);

export const isTerminalPostProcessStatus = (status: UserPostProcessJobStatus) =>
  TERMINAL_POST_PROCESS_STATUSES.includes(status);

// Type definition for checking duplicate activities
export interface DuplicateActivityInfo {
  hashId: string;
  activityName: string;
  startTime: string;
  totalDistance?: number;
  totalElapsedTime?: number;
  sportType?: string;
  sportDefinitionCode?: string | null;
}

export interface DuplicateCheckResult {
  fileName: string;
  isRepeat: boolean;
  duplicateActivities?: DuplicateActivityInfo[];
}

export interface CheckDuplicateActivitiesResponse {
  results: DuplicateCheckResult[];
}

export interface ActivityPeakMetric {
  id: string;
  type: "power" | "hr" | "pace";
  scaleType: "TIME" | "DISTANCE";
  scaleValue: number;
  value?: number | null;
  startElapsedSec?: number | null;
  endElapsedSec?: number | null;
  startDistanceM?: number | null;
  endDistanceM?: number | null;
  coveredSeconds?: number | null;
  coverageRatio?: number | null;
  algorithmVersion?: number | null;
}

// Type definition
export interface Activity {
  id?: number;
  activityName?: string;
  sportType?: string;
  sportDefinitionCode?: string | null;
  /** Trainingload.ai 标准运动小类，例如 TRAIL_RUNNING。 */
  subSportType?: string | null;
  /** FIT Profile 原始 sub_sport 数字枚举。 */
  fitSubSport?: number | null;
  /** @deprecated 使用 fitSubSport；保留用于旧客户端兼容。 */
  subSport?: number | null;
  status?: string;
  processingStatus?: string;
  processingUpdatedAt?: string;
  readyAt?: string;
  startTime?: string;
  endTime?: string;
  /** IANA；无则展示回落档案 / 浏览器 */
  timezone?: string | null;
  distance?: number;
  duration?: number;
  movingTime?: number;
  elapsedTime?: number;
  elevationGain?: number;
  elevHigh?: number;
  elevLow?: number;
  averageSpeed?: number;
  maxSpeed?: number;
  avgPower?: number;
  maxPower?: number;
  averageWatts?: number;
  maxWatts?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  vo2maxVdotByRace?: number;
  vo2maxVdotByHr?: number;
  vo2maxVdotByFactor?: number;
  averageCadence?: number;
  maxCadence?: number;
  kilojoules?: number;
  thirdPartyProvider?: string;
  description?: string;
  /** 用户录入 Session RPE（1–10），PMC SESSIONRPE 轨道用 */
  sessionRpe?: number | null;
  start_lat?: number;
  start_lng?: number;
  end_lat?: number;
  end_lng?: number;
  trainer?: boolean;
  commute?: boolean;
  manual?: boolean;
  private?: boolean;
  flagged?: boolean;
  workoutType?: number;
  deviceName?: string;
  gearId?: string;
  hashId?: string;
  createdAt?: string;
  mapping?: unknown;
  laps?: ActivityLap[];
  activityPeakMetrics?: ActivityPeakMetric[];
  /** Calendar/feed presentation fields returned by the activity list endpoint. */
  load?: number | null;
  ascent?: number | null;
  descent?: number | null;
  calories?: number | null;
  mapThumbnailUrl?: string | null;
  mapThumbnailDarkUrl?: string | null;
  weather?: ActivityWeatherSnapshot | null;
  linkedPlanWorkout?: {
    planId: string;
    workoutId: string;
    name: string | null;
    sportType: string;
    source: "MANUAL" | "AUTO" | "AI";
  } | null;
}

export interface ActivityLap {
  id: number;
  index?: number;
  activityName?: string;
  sportType?: string;
  timestamp?: string;
  startTime?: string;
  endTime?: string;
  timerTime?: number;
  elapsedTime?: number;
  distance?: number;
  ascent?: number;
  descent?: number;
  maxSpeed?: number;
  avgSpeed?: number;
  avgPower?: number;
  maxPower?: number;
  normalizedPower?: number;
  avgCadence?: number;
  maxCadence?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  cycles?: number;
  work?: number;
  strokes?: number;
  calories?: number;
  fatCalories?: number;
  aePower?: number;
  avgTemperature?: number;
  maxTemperature?: number;
  avgGradeAdjustedSpeed?: number;
  avgGroundContactTime?: number;
  avgStrideLength?: number;
  avgVerticalOscillation?: number;
  avgVerticalRatio?: number;
}

// API Response type
export interface ActivitiesResponse {
  activities: Activity[];
  total: number;
}

export interface ActivityStats {
  total: {
    activities: number;
    distance: number;
    duration: number;
    elevation: number;
  };
  thisMonth: {
    activities: number;
    distance: number;
    duration: number;
    elevation: number;
  };
}

export interface ActivityStatsOverview {
  totalDistance: number;
  totalDuration: number;
  totalCalories: number;
  totalCount: number;
}

export interface ActivityFilters {
  sportType?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  thirdPartyProvider?: string;
  minDuration?: number;
  maxDuration?: number;
  minDistance?: number;
  maxDistance?: number;
  forcePagination?: boolean;
}

// Paginated activity query
export const fetchActivities = async (
  page: number,
  filters: ActivityFilters,
  orderBy?: string,
  orderDirection?: "asc" | "desc",
): Promise<ActivitiesResponse> => {
  const params = new URLSearchParams();

  const hasStart = !!filters?.startDate && filters.startDate.trim() !== "";
  const hasEnd = !!filters?.endDate && filters.endDate.trim() !== "";
  const shouldPaginate = (!hasStart && !hasEnd) || filters.forcePagination;

  if (!shouldPaginate) {
    // Use date range query: pass only date and other filters, no pagination
    if (hasStart) params.set("startDate", filters.startDate!);
    if (hasEnd) params.set("endDate", filters.endDate!);

    Object.entries(filters || {})
      .filter(
        ([key, value]) =>
          key !== "startDate" &&
          key !== "endDate" &&
          key !== "orderBy" &&
          key !== "orderDirection" &&
          key !== "forcePagination" &&
          value !== "" &&
          value !== undefined &&
          value !== null,
      )
      .forEach(([key, value]) => {
        params.set(key, String(value));
      });
  } else {
    // Use pagination query: must pass page and perPage, plus other non-date filters
    params.set("page", page.toString());
    params.set("perPage", "20");

    Object.entries(filters || {})
      .filter(
        ([key, value]) =>
          key !== "startDate" &&
          key !== "endDate" &&
          key !== "orderBy" &&
          key !== "orderDirection" &&
          key !== "forcePagination" &&
          value !== "",
      )
      .forEach(([key, value]) => {
        // value expected to be string, fallback conversion
        params.set(key, String(value));
      });
  }

  // Add sort parameters (keep consistent with original behavior)
  if (orderBy) {
    params.set("orderBy", orderBy);
  }
  if (orderDirection) {
    params.set("orderDirection", orderDirection);
  }

  // apiFetch already handles JSON parsing and returns data part
  // 响应结构: { activities: Activity[], total: number }
  const data = await apiFetch<ActivitiesResponse>(
    `/activities?${params.toString()}`,
  );
  if (!data) {
    throw new Error("Failed to load activities");
  }

  return data;
};

// Get single activity details
export const fetchActivity = async (id: string): Promise<Activity> => {
  const data = await apiFetch<Activity>(`/activities/${id}`);
  if (!data) {
    throw new Error("Failed to load activity");
  }
  return data;
};

// Get activity statistics
export const fetchActivityStats = async (
  year?: number,
): Promise<ActivityStatsOverview> => {
  const query = year ? `?year=${year}` : "";
  const data = await apiFetch<ActivityStatsOverview>(
    `/activities/stats/overview${query}`,
  );
  if (!data) {
    throw new Error("Failed to load activity stats");
  }
  return data;
};

// Upload activity data and create an import batch
const uploadActivities = async (files: File[]): Promise<ImportBatchSummary> => {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file, file.name);
  });

  const response = await apiFetch<ImportBatchSummary>("/activities/upload", {
    method: "POST",
    body: formData,
  });
  if (!response) {
    throw new Error("Failed to create import batch");
  }
  return response;
};

/**
 * 针对上传的文件进行检查，返回文件的格式、种类、活动、健康等信息。
 * @param files 文件列表
 * @returns 文件检查结果
 */
export const inspectActivityFiles = async (
  files: File[],
): Promise<TrackFileInspectionResponse> => {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file, file.name);
  });

  const response = await apiFetch<TrackFileInspectionResponse>(
    "/activities/inspect-files",
    {
      method: "POST",
      body: formData,
    },
  );
  if (!response) {
    throw new Error("Failed to inspect activity files");
  }
  return response;
};

export const fetchImportBatch = async (
  batchId: string,
): Promise<ImportBatchSummary> => {
  const data = await apiFetch<ImportBatchSummary>(
    `/activities/import/batches/${batchId}`,
  );
  if (!data) {
    throw new Error("Failed to load import batch");
  }
  return data;
};

export const fetchImportBatchItems = async (
  batchId: string,
): Promise<ImportBatchItemsResponse> => {
  const data = await apiFetch<ImportBatchItemsResponse>(
    `/activities/import/batches/${batchId}/items`,
  );
  if (!data) {
    throw new Error("Failed to load import batch items");
  }
  return data;
};

// Check duplicate activities
const checkDuplicateActivities = async (
  files: File[],
): Promise<CheckDuplicateActivitiesResponse> => {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file, file.name);
  });

  const response = await apiFetch<CheckDuplicateActivitiesResponse>(
    "/activities/check-duplicate",
    {
      method: "POST",
      body: formData,
    },
  );
  if (!response) {
    throw new Error("Failed to check duplicate activities");
  }
  return response;
};

// Set activity type
const setActivitiesSportType = async (
  request: SetActivitiesSportTypeRequest,
): Promise<boolean> => {
  const response = await apiFetch<boolean>("/activities/set-sport-type", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  if (response === undefined) {
    throw new Error("Failed to set activity sport type");
  }
  return response;
};

// Build filter based on selectedSportType
export const buildFilters = (selectedSportType: string): ActivityFilters => {
  const filters: ActivityFilters = {};

  // Filter by sport type
  if (selectedSportType && selectedSportType !== "all") {
    filters.sportType = selectedSportType;
  }

  // Remove time filter, no longer limit time range

  return filters;
};

export { uploadActivities, setActivitiesSportType, checkDuplicateActivities };
