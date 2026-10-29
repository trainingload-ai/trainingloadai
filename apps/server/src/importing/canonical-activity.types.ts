import type {
  ImportSourceKind,
  SportType,
  ThirdPartyProvider,
} from '@prisma/client';

export type CanonicalJson =
  | string
  | number
  | boolean
  | null
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

export interface CanonicalSourceRef {
  kind: ImportSourceKind;
  provider?: ThirdPartyProvider | null;
  sourceUid: string;
  accountRef?: string;
  externalId?: string;
  fileName?: string;
  fileKey?: string;
  rawStorageKey?: string;
  /** 原始活动数据集字节的 SHA-256；JSON-only 来源使用稳定 canonical hash。 */
  sourceChecksum?: string;
}

export interface CanonicalActivityIdentity {
  sourceUid: string;
  sourceVersion?: string;
  dedupeKey: string;
  /** 来源无关的 canonical 数据集 SHA-256，用于缺少原始字节时的精确关联。 */
  datasetChecksum: string;
}

export interface CanonicalActivitySummary {
  name?: string;
  description?: string;
  sportType: SportType;
  /** 平台无关的精确运动代码，例如 TRAIL_RUNNING；优先于仅用于统计的大类。 */
  subSportType?: string | null;
  /** FIT SubSport 枚举整数值；未知或非 FIT 来源省略 */
  subSport?: number | null;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  timestamp?: string;
  distance?: number;
  elapsedTime?: number;
  timerTime?: number;
  ascent?: number;
  descent?: number;
  enhancedAscent?: number;
  enhancedDescent?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgPower?: number;
  maxPower?: number;
  avgSpeed?: number;
  maxSpeed?: number;
  avgCadence?: number;
  maxCadence?: number;
  calories?: number;
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
  poolLength?: number;
  poolLengthUnit?: string;
  numLaps?: number;
  numLengths?: number;
  numActiveLengths?: number;
}

export interface CanonicalLap {
  index?: number;
  activityName?: string;
  sportType?: string;
  startTime?: string;
  endTime?: string;
  elapsedTime?: number;
  timerTime?: number;
  distance?: number;
  ascent?: number;
  descent?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgPower?: number;
  maxPower?: number;
  avgSpeed?: number;
  maxSpeed?: number;
  avgCadence?: number;
  maxCadence?: number;
  cycles?: number;
  avgGroundContactTime?: number;
  avgStrideLength?: number;
  avgVerticalOscillation?: number;
  avgVerticalRatio?: number;
  calories?: number;
}

export interface CanonicalRecord {
  /** 索引 */
  index?: number;
  /** 圈索引 */
  lapIndex?: number;
  /** 时间戳 */
  timestamp?: string;
  /** 位置纬度 */
  positionLat?: number;
  /** 位置经度 */
  positionLong?: number;
  /** 海拔 */
  altitude?: number;
  /** 增强海拔 */
  enhancedAltitude?: number;
  /** 距离 */
  distance?: number;
  speed?: number;
  heartRate?: number;
  power?: number;
  cadence?: number;
  totalCycles?: number;
  temperature?: number;
  grade?: number;
  gap?: number;
  stepLength?: number;
  stanceTime?: number;
  stanceTimePercent?: number;
  stanceTimeBalance?: number;
  verticalOscillation?: number;
  verticalRatio?: number;
  description?: string;
  accumulatedPower?: number;
}

export interface CanonicalLength {
  index?: number;
  startTime?: string;
  totalElapsedTime?: number;
  totalTimerTime?: number;
  totalDistance?: number;
  totalStrokes?: number;
  avgSpeed?: number;
  swimStroke?: string;
  avgSwimmingCadence?: number;
  messageIndex?: number | null;
}

/** 标准化后的活动数据 */
export interface CanonicalActivityPayload {
  /** 来源信息 */
  source: CanonicalSourceRef;
  /** 身份信息 */
  identity: CanonicalActivityIdentity;
  /** 摘要信息 */
  summary: CanonicalActivitySummary;
  /** 圈信息 */
  laps: CanonicalLap[];
  /** 记录信息 */
  records: CanonicalRecord[];
  /** 长度信息 */
  lengths: CanonicalLength[];
  /** 元数据 */
  metadata?: Record<string, CanonicalJson>;
}
