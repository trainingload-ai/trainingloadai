import type { ActivityType, FileType } from 'trackswap';
import type { ImportSourceKind, ThirdPartyProvider } from '@prisma/client';
import type { CanonicalActivityPayload } from '../canonical-activity.types';

export interface BaseNormalizeInput {
  kind: ImportSourceKind;
  sourceUid: string;
  accountRef?: string;
  externalId?: string;
  fileKey?: string;
  rawStorageKey?: string;
  sourceChecksum?: string;
  metadata?: Record<string, unknown>;
  rawPayload?: unknown;
}

export interface FileNormalizeInput extends BaseNormalizeInput {
  kind: 'FILE';
  file: Express.Multer.File;
}

/** Provider 文件输入；具体 kind 及下载协议由组合层扩展拥有。 */
export interface ExternalFileNormalizeInput extends BaseNormalizeInput {
  provider?: ThirdPartyProvider | null;
  activityFile: Express.Multer.File;
  parsedFile?: FileType;
}

/** 已在扩展边界转成 Trackswap 的活动输入。 */
export interface SerializedActivityNormalizeInput extends BaseNormalizeInput {
  provider?: ThirdPartyProvider | null;
  activity: ActivityType;
}

export type SourceNormalizeInput =
  | FileNormalizeInput
  | ExternalFileNormalizeInput
  | SerializedActivityNormalizeInput;

export interface SourceNormalizeResult {
  sourceUid: string;
  sourceKind: ImportSourceKind;
  payloads: CanonicalActivityPayload[];
  metadata?: Record<string, unknown>;
}

export interface ImportSourceAdapter {
  readonly kind: ImportSourceKind;
  normalize(input: SourceNormalizeInput): Promise<SourceNormalizeResult>;
}
