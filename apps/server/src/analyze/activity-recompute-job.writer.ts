import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

export type ActivityInputReplayJobInput = {
  userId: string;
  effectiveFrom: Date;
  effectiveTo?: Date;
  includeActivityIds?: readonly number[];
  triggerSource: string;
  affectedPipelines?: readonly string[];
  priority?: number;
  eventId?: string;
};

/**
 * Atomically persist a correctness replay request beside the mutation that
 * invalidated activity analysis. The caller owns the surrounding transaction.
 */
export function createActivityInputReplayJob(
  tx: Prisma.TransactionClient,
  input: ActivityInputReplayJobInput,
) {
  const includeActivityIds = Array.from(
    new Set(
      (input.includeActivityIds ?? []).filter((id) => Number.isSafeInteger(id)),
    ),
  ).sort((left, right) => left - right);
  const eventId = input.eventId ?? randomUUID();
  return tx.activityRecomputeJob.create({
    data: {
      dedupeKey: `activity-input:${input.userId}:${eventId}`,
      userId: input.userId,
      reason: 'ACTIVITY_INPUT_CHANGED',
      metricType: 'ACTIVITY_INPUT',
      affectedPipelines: [
        ...(input.affectedPipelines ?? [
          'ACTIVITY_ANALYSIS',
          'FITNESS_TIMELINE',
          'TRAINING_LOAD',
          'PMC',
        ]),
      ],
      recomputeFrom: input.effectiveFrom,
      recomputeTo: input.effectiveTo ?? new Date(),
      lookbackDays: 0,
      priority: input.priority ?? 200,
      status: 'SCHEDULED',
      availableAt: new Date(),
      replayCheckpoint: Prisma.DbNull,
      attempts: 0,
      maxAttempts: 6,
      triggerSource: input.triggerSource,
      triggerPayload: {
        schemaVersion: 1,
        eventId,
        includeActivityIds,
      },
    },
  });
}
