import { Inject, Injectable } from '@nestjs/common';
import { AiUsageStatus, type AiUsageKind } from '@prisma/client';
import type { AiModelPurpose } from '@shared/ai-model';

import type { PrismaTx } from '@/prisma/prisma-db';
import { lookupAiModel } from '@/api/ai/ai-model-catalog';
import {
  AI_USAGE_RECORDER,
  type AiUsageRecorder,
  type ParsedAiUsage,
  type RecordAiUsageArgs,
} from './ai-usage-recorder.port';

export type { ParsedAiUsage } from './ai-usage-recorder.port';

export type AiUsageRecordInput = {
  userId?: string | null;
  operationId?: string | null;
  /** Compatibility input while call sites move to operationId. */
  actionId?: string | null;
  callKey?: string;
  providerRequestId?: string | null;
  kind: AiUsageKind;
  provider?: string | null;
  model?: string | null;
  purpose?: AiModelPurpose | null;
  usage: ParsedAiUsage;
  sid?: string | null;
  entityId?: string | null;
  status?: AiUsageStatus;
  now?: Date;
};

function int(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function first(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

/** Normalizes OpenAI, AI SDK and DeepSeek-compatible usage payloads. */
export function parseOpenAIUsage(raw: unknown): ParsedAiUsage {
  const usage = record(raw);
  if (!usage) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      reported: false,
    };
  }
  const details = record(
    usage.prompt_tokens_details ??
      usage.promptTokensDetails ??
      usage.input_tokens_details ??
      usage.inputTokensDetails,
  );
  const cachedRaw = first(
    usage.prompt_cache_hit_tokens,
    usage.promptCacheHitTokens,
    usage.cached_tokens,
    usage.cachedTokens,
    usage.input_cached_tokens,
    usage.inputCachedTokens,
    details?.cached_tokens,
    details?.cachedTokens,
  );
  const missRaw = first(
    usage.prompt_cache_miss_tokens,
    usage.promptCacheMissTokens,
    usage.input_cache_miss_tokens,
    usage.inputCacheMissTokens,
  );
  const inputRaw = first(
    usage.prompt_tokens,
    usage.input_tokens,
    usage.promptTokens,
    usage.inputTokens,
  );
  const outputRaw = first(
    usage.completion_tokens,
    usage.output_tokens,
    usage.completionTokens,
    usage.outputTokens,
  );
  const totalRaw = first(usage.total_tokens, usage.totalTokens);
  const reported =
    inputRaw !== undefined ||
    cachedRaw !== undefined ||
    missRaw !== undefined ||
    outputRaw !== undefined ||
    totalRaw !== undefined;
  const inputTokens = int(
    inputRaw ??
      (cachedRaw !== undefined || missRaw !== undefined
        ? int(cachedRaw) + int(missRaw)
        : 0),
  );
  const outputTokens = int(outputRaw);
  return {
    inputTokens,
    outputTokens,
    cachedInputTokens: Math.min(inputTokens, int(cachedRaw)),
    reported,
    ...(totalRaw === undefined ? {} : { totalTokens: int(totalRaw) }),
    raw: usage,
  };
}

@Injectable()
export class AiUsageService {
  constructor(
    @Inject(AI_USAGE_RECORDER)
    private readonly recorder: AiUsageRecorder,
  ) {}

  private normalize(args: AiUsageRecordInput): RecordAiUsageArgs {
    const resolvedModel = args.model
      ? lookupAiModel({ provider: args.provider, modelId: args.model })
      : null;
    return {
      userId: args.userId,
      operationId: args.operationId ?? args.actionId,
      callKey: args.callKey?.trim() || undefined,
      providerRequestId: args.providerRequestId,
      kind: args.kind,
      provider: args.provider,
      model: args.model,
      purpose: args.purpose ?? resolvedModel?.purpose ?? null,
      usage: args.usage,
      status: args.status ?? AiUsageStatus.SUCCESS,
      sid: args.sid,
      entityId: args.entityId,
      now: args.now,
    };
  }

  computeUsageMetrics(usage: ParsedAiUsage) {
    const inputTokens = int(usage.inputTokens);
    const outputTokens = int(usage.outputTokens);
    const cachedInputTokens = Math.min(
      inputTokens,
      int(usage.cachedInputTokens),
    );
    const uncachedInputTokens = inputTokens - cachedInputTokens;
    const equivalentTokens =
      uncachedInputTokens + cachedInputTokens / 30 + outputTokens * 3;
    return {
      inputTokens,
      outputTokens,
      cachedInputTokens,
      uncachedInputTokens,
      weightedTokens: Math.ceil(equivalentTokens),
      equivalentTokens,
    };
  }

  recordUsageEvent(args: AiUsageRecordInput) {
    return this.recorder.record(this.normalize(args));
  }

  recordUsageEvents(args: AiUsageRecordInput[]) {
    return this.recorder.recordMany(args.map((event) => this.normalize(event)));
  }

  recordUsageEventInTransaction(tx: PrismaTx, args: AiUsageRecordInput) {
    return this.recorder.recordInTransaction(tx, this.normalize(args));
  }
}
