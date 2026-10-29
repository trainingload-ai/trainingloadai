import type { Prisma } from '@prisma/client';

/**
 * Serializes short, activity-scoped persistence transactions.
 *
 * Canonical dataset commits and derived-data replacements share this lock so
 * a dataset reset cannot race with metrics persistence for the same activity.
 */
export const ACTIVITY_WRITE_LOCK_SQL =
  'SELECT pg_advisory_xact_lock(1095981392, $1::integer)::text AS lock';

export async function acquireActivityWriteLock(
  client: Pick<Prisma.TransactionClient, '$executeRawUnsafe'>,
  activityId: number,
): Promise<void> {
  await client.$executeRawUnsafe(ACTIVITY_WRITE_LOCK_SQL, activityId);
}
