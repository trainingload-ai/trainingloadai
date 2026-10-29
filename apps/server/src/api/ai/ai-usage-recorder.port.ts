import type {
  AiUsageKind,
  AiUsageStatus,
} from '@prisma/client';
import type { AiModelPurpose } from '@shared/ai-model';

import type { PrismaTx } from '@/prisma/prisma-db';

export const AI_USAGE_RECORDER = Symbol('AI_USAGE_RECORDER');

export type ParsedAiUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  totalTokens?: number;
  raw?: Record<string, unknown>;
  reported?: boolean;
};

export type RecordAiUsageArgs = {
  userId?: string | null;
  operationId?: string | null;
  callKey?: string;
  providerRequestId?: string | null;
  kind: AiUsageKind;
  provider?: string | null;
  model?: string | null;
  purpose?: AiModelPurpose | null;
  usage: ParsedAiUsage;
  status?: AiUsageStatus;
  sid?: string | null;
  entityId?: string | null;
  now?: Date;
};

export interface AiUsageRecorder {
  record(args: RecordAiUsageArgs): Promise<unknown>;
  recordMany(args: RecordAiUsageArgs[]): Promise<unknown[]>;
  recordInTransaction(tx: PrismaTx, args: RecordAiUsageArgs): Promise<unknown>;
}
