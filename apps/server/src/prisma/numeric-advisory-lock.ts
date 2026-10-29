import type { Prisma } from '@prisma/client';

export const NUMERIC_ADVISORY_XACT_LOCK_SQL =
  'SELECT pg_advisory_xact_lock($1::bigint)::text AS lock';

export async function acquireNumericAdvisoryXactLock(
  client: Pick<Prisma.TransactionClient, '$executeRawUnsafe'>,
  lockId: number,
): Promise<void> {
  await client.$executeRawUnsafe(NUMERIC_ADVISORY_XACT_LOCK_SQL, lockId);
}
