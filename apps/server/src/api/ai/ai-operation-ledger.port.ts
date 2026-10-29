import type { AiUsageKind } from '@prisma/client';
import type { AiModelPurpose } from '@shared/ai-model';

export const AI_OPERATION_LEDGER = Symbol('AI_OPERATION_LEDGER');

export type AiOperationStatus =
  | 'STARTED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'ABANDONED';

export type AiOperation = {
  id: string;
  userId: string;
  idempotencyKey: string;
  kind: AiUsageKind;
  purpose: AiModelPurpose;
  actualPurposes: AiModelPurpose[];
  status: AiOperationStatus;
  resultRef: Record<string, unknown> | null;
  completedAt: Date | null;
  errorCode: string | null;
  metadata: Record<string, unknown> | null;
  heartbeatAt: Date;
  expiresAt: Date;
};

export type BeginAiOperationArgs = {
  userId: string;
  operationId: string;
  idempotencyKey?: string;
  kind: AiUsageKind;
  purpose: AiModelPurpose;
  metadata?: Record<string, unknown>;
  now?: Date;
};

export interface AiOperationLedger {
  peekReplay(
    args: BeginAiOperationArgs,
  ): Promise<{ replay: true; operation: AiOperation } | { replay: false }>;
  begin(args: BeginAiOperationArgs): Promise<{
    replay: boolean;
    operation: AiOperation;
  }>;
  get(userId: string, operationId: string): Promise<AiOperation | null>;
  heartbeat(userId: string, operationId: string, now?: Date): Promise<unknown>;
  updateKind(
    userId: string,
    operationId: string,
    kind: AiUsageKind,
  ): Promise<unknown>;
  markDelivered(args: {
    userId: string;
    operationId: string;
    resultRef: Record<string, unknown>;
    now?: Date;
  }): Promise<AiOperation>;
  complete(
    userId: string,
    operationId: string,
    now?: Date,
  ): Promise<AiOperation>;
  fail(args: {
    userId: string;
    operationId: string;
    errorCode?: string;
    now?: Date;
  }): Promise<unknown>;
}

export function toAiOperationResult(
  operation: AiOperation,
  replayed: boolean,
) {
  return {
    operationId: operation.id,
    status: operation.status,
    purpose: operation.purpose,
    replayed,
    pending:
      operation.status === 'STARTED' || operation.status === 'RUNNING',
    recovery: operation.resultRef,
    completedAt: operation.completedAt?.toISOString() ?? null,
    errorCode: operation.errorCode,
  };
}
