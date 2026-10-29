import type {
  ImportItemJob,
  ImportSourceObject,
  Prisma,
} from '@prisma/client';
import type { CanonicalActivityPayload } from './canonical-activity.types';

/** Prisma Json 字段的对象形态。 */
export type ImportJsonRecord = Record<string, unknown>;

/**
 * `ImportItemJob.sourceRef` 常见字段。
 * Json 列无法由 Prisma 生成精确类型；读侧经 {@link asImportItemSourceRef} 断言。
 */
export type ImportItemSourceRef = {
  /** 直通 canonical 载荷（fan-out 子任务）。 */
  kind?: 'canonical_payload' | string;
  payload?: CanonicalActivityPayload;
  externalId?: string | number;
  fileKey?: string;
  fileName?: string;
  connectionId?: string;
  thirdPartyActivityId?: string | number;
  workoutId?: string | number;
};

/**
 * `ImportSourceObject.metadata` / 部分 `rawPayload` 上导入管线会读写的字段。
 */
export type ImportSourceObjectMeta = ImportJsonRecord & {
  connectionId?: string;
  thirdPartyActivityId?: string | number;
  workoutId?: string | number;
  externalId?: string | number;
  fileKey?: string;
  fileName?: string;
  fitUrl?: string;
  summary?: ImportJsonRecord | unknown;
  region?: string;
  planWorkoutId?: string | number | null;
  suuntoGuideExternalId?: string | null;
  activityName?: string | null;
  downloadedFileEndpoint?: string | null;
  downloadedFileContentType?: string | null;
  downloadedFileName?: string | null;
  source?: string;
};

export type ImportItemJobWithSource = ImportItemJob & {
  sourceObject: ImportSourceObject | null;
};

/** 带非空 sourceObject 的 job（normalize 构建阶段）。 */
export type ImportItemJobWithSourceObject = ImportItemJob & {
  sourceObject: ImportSourceObject;
};

export type ImportJobJsonFields = {
  sourceRef?: unknown;
  sourceObject?: {
    metadata?: unknown;
    rawPayload?: unknown;
    externalId?: string | null;
  } | null;
  sourceUid?: string;
};

export function asImportJsonRecord(value: unknown): ImportJsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as ImportJsonRecord;
}

export function asImportJsonRecordOrUndefined(
  value: unknown,
): ImportJsonRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as ImportJsonRecord;
}

export function asImportItemSourceRef(value: unknown): ImportItemSourceRef {
  return asImportJsonRecord(value) as ImportItemSourceRef;
}

export function asImportSourceObjectMeta(
  value: unknown,
): ImportSourceObjectMeta {
  return asImportJsonRecord(value) as ImportSourceObjectMeta;
}

export function importJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function readImportString(
  ...candidates: unknown[]
): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }
  return undefined;
}

export function readImportNumber(
  ...candidates: unknown[]
): number | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === 'string' && candidate.trim()) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

export function pickImportField(
  ...sources: Array<ImportJsonRecord | null | undefined>
): {
  string(...keys: string[]): string | undefined;
  number(...keys: string[]): number | undefined;
  record(key: string): ImportJsonRecord | undefined;
} {
  return {
    string(...keys: string[]) {
      for (const source of sources) {
        if (!source) continue;
        for (const key of keys) {
          const value = readImportString(source[key]);
          if (value != null) return value;
        }
      }
      return undefined;
    },
    number(...keys: string[]) {
      for (const source of sources) {
        if (!source) continue;
        for (const key of keys) {
          const value = readImportNumber(source[key]);
          if (value != null) return value;
        }
      }
      return undefined;
    },
    record(key: string) {
      for (const source of sources) {
        if (!source) continue;
        const value = source[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          return value as ImportJsonRecord;
        }
      }
      return undefined;
    },
  };
}

/** markStatus 允许附带的可写字段。 */
export type ImportItemJobStatusExtra = {
  completedAt?: Date | null;
  lastError?: string | null;
  lastErrorCode?: string | null;
  availableAt?: Date;
  attempts?: number;
  startedAt?: Date | null;
};
