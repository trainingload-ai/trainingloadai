import type { Prisma } from '@prisma/client';
export async function lockFitnessUser(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  // The exact namespace is shared with the publication triggers in the migration.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'fitness:' + userId}, 0))::text`;
}
