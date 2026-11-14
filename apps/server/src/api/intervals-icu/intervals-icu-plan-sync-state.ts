import { workoutChecksum } from './intervals-icu-workout-checksum.util';

export type PlanSyncMetadata = {
  syncVersion?: number;
  detachedAt?: string;
  detachedReason?: string;
  remoteUpdatedAt?: string;
  [key: string]: unknown;
};

export function planSyncMetadata(value: unknown): PlanSyncMetadata {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as PlanSyncMetadata)
    : {};
}

/** Each endpoint has its own identity and creation time, and its own baseline. */
export function planSyncChecksum(args: {
  id: string;
  createdAt: Date | string | null | undefined;
  contentChecksum: string;
}): string {
  return workoutChecksum({
    version: 2,
    id: args.id,
    createdAt: args.createdAt ? new Date(args.createdAt).toISOString() : null,
    contentChecksum: args.contentChecksum,
  });
}

export type DeletionDecision = 'delete' | 'detach' | 'already_deleted';

/** Unknown baselines preserve the survivor; they never authorize deletion. */
export function decidePlanSyncDeletion(args: {
  exists: boolean;
  currentChecksum?: string | null;
  baselineChecksum?: string | null;
}): DeletionDecision {
  if (!args.exists) return 'already_deleted';
  return args.baselineChecksum && args.currentChecksum === args.baselineChecksum
    ? 'delete'
    : 'detach';
}
