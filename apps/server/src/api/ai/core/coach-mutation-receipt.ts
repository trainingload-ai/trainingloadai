import type {
  CoachAction,
  CoachActionRiskTier,
  CoachActionType,
} from '@prisma/client';
import { asRecord, sha256Hex, stableJson } from './ai-common.util';
import type { RecordCoachActionResult } from './coach-action.service';
import type { AiToolContext } from './tool.types';

export const COACH_MUTATION_ACTIVITY_PREFIX = 'mutation:';
export const COACH_MUTATION_CARD_NAME = 'MutationApplied';

export type MutationAppliedToolResult<UiPayload = unknown> = {
  kind: 'mutation_applied';
  ok: true;
  actionId: string;
  type: CoachActionType;
  riskTier: CoachActionRiskTier;
  summary: string;
  undoUntil: string | null;
  payload: UiPayload;
};

export function coachMutationInvocationKey(
  ctx: AiToolContext,
  toolName: string,
  toolCallId: string | undefined,
) {
  const userId = ctx.session?.user?.id;
  const { mutationRun, sid } = ctx;
  if (
    !userId ||
    !sid?.trim() ||
    !mutationRun?.runId.trim() ||
    !mutationRun.attemptId.trim() ||
    !toolCallId?.trim()
  )
    return null;
  return sha256Hex(
    stableJson([
      userId,
      sid,
      mutationRun.runId,
      mutationRun.attemptId,
      toolName,
      toolCallId,
    ]),
  );
}

export function readCoachMutationReceipt<UiPayload>(
  row: CoachAction,
): RecordCoachActionResult<UiPayload> {
  return {
    actionId: row.id,
    type: row.type,
    riskTier: row.riskTier,
    summary: row.summary,
    undoUntil: row.undoUntil,
    createdAt: row.createdAt,
    payloadForUi: asRecord(row.invocationPayload)?.value as UiPayload,
  };
}

export function toCoachMutationReceipt<UiPayload>(
  result: RecordCoachActionResult<UiPayload>,
): MutationAppliedToolResult<UiPayload> {
  return {
    kind: 'mutation_applied',
    ok: true,
    actionId: result.actionId,
    type: result.type,
    riskTier: result.riskTier,
    summary: result.summary,
    undoUntil: result.undoUntil?.toISOString() ?? null,
    payload: result.payloadForUi,
  };
}

export function coachMutationCardId(actionId: string) {
  return `mutation-applied:${actionId}`;
}
