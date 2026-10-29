import type { FileType } from 'trackswap';
import type { ImportSourceKind } from '@prisma/client';
import type { CanonicalActivityPayload } from './canonical-activity.types';
import type { ImportItemJobWithSourceObject } from './import-item-job.types';
import type { SourceNormalizeInput } from './source-adapters/source-adapter.interface';

export const IMPORT_ITEM_EXTENSION = Symbol('IMPORT_ITEM_EXTENSION');

export type ImportItemExtensionJob = {
  id: string;
  batchJobId: string;
  userId: string;
  sourceObjectId: string;
  sourceKind: ImportSourceKind;
};

export type ImportItemExtensionNotice = {
  message: string;
  data?: Record<string, unknown>;
};

export type ImportItemExtensionPreprocessResult = {
  finished: boolean;
  parsedFile?: FileType;
  notice?: ImportItemExtensionNotice;
};

/**
 * Core 导入管线的可选扩展点。Port 由消费方拥有，只表达生命周期，不暴露任何
 * Provider 名称、凭证、SDK 或网络协议；Managed composition root 注入实现。
 */
export interface ImportItemExtension {
  supportsPreprocess(sourceKind: ImportSourceKind): boolean;
  preprocess(
    job: ImportItemExtensionJob,
  ): Promise<ImportItemExtensionPreprocessResult | null>;

  supportsNormalize(sourceKind: ImportSourceKind): boolean;
  prepareNormalizeInput(job: ImportItemJobWithSourceObject): Promise<{
    input: SourceNormalizeInput;
    thirdPartyActivityId?: number;
  }>;

  afterMaterialize(args: {
    userId: string;
    activityId: number;
    payload: CanonicalActivityPayload;
  }): Promise<ImportItemExtensionNotice[]>;

  afterTerminalFailure(args: {
    userId: string;
    sourceObjectId: string;
    sourceKind: ImportSourceKind;
  }): Promise<void>;
}
