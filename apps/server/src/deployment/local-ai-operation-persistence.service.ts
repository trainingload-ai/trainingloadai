import { ConflictException, Injectable } from '@nestjs/common';
import {
  AiModelPurpose as PrismaAiModelPurpose,
  AiOperationStatus as PrismaAiOperationStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import type {
  AiOperation,
  AiOperationLedger,
  BeginAiOperationArgs,
} from '@/api/ai/ai-operation-ledger.port';
import type {
  AiUsageRecorder,
  RecordAiUsageArgs,
} from '@/api/ai/ai-usage-recorder.port';
import type { PrismaTx } from '@/prisma/prisma-db';
import { PrismaService } from '@/prisma/prisma.service';

const OPERATION_TTL_MS = 15 * 60 * 1_000;

function nonNegativeInt(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function json(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asRecord(
  value: Prisma.JsonValue | null,
): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function purpose(value: PrismaAiModelPurpose): AiOperation['purpose'] {
  return value === PrismaAiModelPurpose.REASONING ? 'REASONING' : 'DEFAULT';
}

function operationStatus(
  value: PrismaAiOperationStatus,
): AiOperation['status'] {
  return value;
}

@Injectable()
export class LocalAiOperationPersistenceService
  implements AiOperationLedger, AiUsageRecorder
{
  constructor(private readonly prisma: PrismaService) {}

  private toOperation(row: {
    id: string;
    userId: string;
    idempotencyKey: string;
    kind: AiOperation['kind'];
    purpose: PrismaAiModelPurpose;
    actualPurposes: PrismaAiModelPurpose[];
    status: PrismaAiOperationStatus;
    resultRef: Prisma.JsonValue | null;
    completedAt: Date | null;
    errorCode: string | null;
    metadata: Prisma.JsonValue | null;
    heartbeatAt: Date;
    expiresAt: Date;
  }): AiOperation {
    return {
      ...row,
      purpose: purpose(row.purpose),
      actualPurposes: row.actualPurposes.map(purpose),
      status: operationStatus(row.status),
      resultRef: asRecord(row.resultRef),
      metadata: asRecord(row.metadata),
    };
  }

  private async find(args: BeginAiOperationArgs) {
    return this.prisma.aiOperation.findFirst({
      where: {
        OR: [
          { id: args.operationId },
          {
            userId: args.userId,
            idempotencyKey: args.idempotencyKey?.trim() || args.operationId,
          },
        ],
      },
    });
  }

  async peekReplay(args: BeginAiOperationArgs) {
    const existing = await this.find(args);
    return existing
      ? ({ replay: true, operation: this.toOperation(existing) } as const)
      : ({ replay: false } as const);
  }

  async begin(args: BeginAiOperationArgs) {
    const existing = await this.find(args);
    if (existing) {
      const expectedFingerprint = args.metadata?.requestFingerprint;
      const actualFingerprint = asRecord(existing.metadata)?.requestFingerprint;
      if (
        existing.userId !== args.userId ||
        purpose(existing.purpose) !== args.purpose ||
        (expectedFingerprint && expectedFingerprint !== actualFingerprint)
      ) {
        throw new ConflictException('AI_OPERATION_IDEMPOTENCY_CONFLICT');
      }
      return { replay: true, operation: this.toOperation(existing) };
    }

    const now = args.now ?? new Date();
    const created = await this.prisma.aiOperation.create({
      data: {
        id: args.operationId,
        userId: args.userId,
        idempotencyKey: args.idempotencyKey?.trim() || args.operationId,
        kind: args.kind,
        purpose: args.purpose,
        metadata: json(args.metadata),
        heartbeatAt: now,
        expiresAt: new Date(now.getTime() + OPERATION_TTL_MS),
      },
    });
    return { replay: false, operation: this.toOperation(created) };
  }

  async get(userId: string, operationId: string) {
    const row = await this.prisma.aiOperation.findFirst({
      where: { id: operationId, userId },
    });
    return row ? this.toOperation(row) : null;
  }

  heartbeat(userId: string, operationId: string, now = new Date()) {
    return this.prisma.aiOperation.updateMany({
      where: {
        id: operationId,
        userId,
        status: { in: ['STARTED', 'RUNNING'] },
      },
      data: {
        heartbeatAt: now,
        expiresAt: new Date(now.getTime() + OPERATION_TTL_MS),
      },
    });
  }

  updateKind(userId: string, operationId: string, kind: AiOperation['kind']) {
    return this.prisma.aiOperation.updateMany({
      where: { id: operationId, userId },
      data: { kind },
    });
  }

  async markDelivered(args: {
    userId: string;
    operationId: string;
    resultRef: Record<string, unknown>;
    now?: Date;
  }) {
    const now = args.now ?? new Date();
    const row = await this.prisma.aiOperation.update({
      where: { id: args.operationId, userId: args.userId },
      data: {
        status: 'RUNNING',
        resultRef: json(args.resultRef),
        heartbeatAt: now,
      },
    });
    return this.toOperation(row);
  }

  async complete(userId: string, operationId: string, now = new Date()) {
    const row = await this.prisma.aiOperation.update({
      where: { id: operationId, userId },
      data: {
        status: 'COMPLETED',
        completedAt: now,
        heartbeatAt: now,
      },
    });
    return this.toOperation(row);
  }

  fail(args: {
    userId: string;
    operationId: string;
    errorCode?: string;
    now?: Date;
  }) {
    const now = args.now ?? new Date();
    return this.prisma.aiOperation.updateMany({
      where: {
        id: args.operationId,
        userId: args.userId,
        status: { in: ['STARTED', 'RUNNING'] },
      },
      data: {
        status: 'FAILED',
        errorCode: args.errorCode ?? 'AI_OPERATION_FAILED',
        completedAt: now,
        heartbeatAt: now,
      },
    });
  }

  record(args: RecordAiUsageArgs) {
    return this.prisma.$transaction((tx) => this.recordInTransaction(tx, args));
  }

  recordMany(args: RecordAiUsageArgs[]) {
    return this.prisma.$transaction(async (tx) => {
      const rows = [];
      for (const event of args) {
        rows.push(await this.recordInTransaction(tx, event));
      }
      return rows;
    });
  }

  async recordInTransaction(tx: PrismaTx, args: RecordAiUsageArgs) {
    const inputTokens = nonNegativeInt(args.usage.inputTokens);
    const outputTokens = nonNegativeInt(args.usage.outputTokens);
    const cachedInputTokens = Math.min(
      inputTokens,
      nonNegativeInt(args.usage.cachedInputTokens),
    );
    const callKey = args.callKey?.trim() || randomUUID();
    const row = await tx.aiUsageEvent.upsert({
      where: { callKey },
      update: {},
      create: {
        userId: args.userId ?? null,
        operationId: args.operationId ?? null,
        callKey,
        providerRequestId: args.providerRequestId ?? null,
        kind: args.kind,
        provider: args.provider ?? null,
        model: args.model ?? null,
        purpose: args.purpose ?? 'DEFAULT',
        status: args.status,
        inputTokens,
        outputTokens,
        cachedInputTokens,
        uncachedInputTokens: inputTokens - cachedInputTokens,
        completedAt:
          (args.status ?? 'SUCCESS') === 'RETRY'
            ? null
            : (args.now ?? new Date()),
        sid: args.sid ?? null,
        entityId: args.entityId ?? null,
        createdAt: args.now,
      },
    });

    if (args.operationId && args.purpose) {
      await tx.aiOperation.updateMany({
        where: { id: args.operationId },
        data: { actualPurposes: { push: args.purpose } },
      });
    }
    return row;
  }
}
