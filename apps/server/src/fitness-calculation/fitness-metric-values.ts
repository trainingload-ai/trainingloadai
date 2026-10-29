import type { FitnessCandidate } from '@shared/fitness-assessment';
import { Prisma } from '@prisma/client';
/** Public TP uses seconds/km; persisted TP remains metres/second. */
export function fitnessStorageValue(
  candidate: Pick<FitnessCandidate, 'metric' | 'value' | 'unit'>,
) {
  return candidate.metric === 'TP' && candidate.unit === 's/km'
    ? 1000 / candidate.value
    : candidate.value;
}
/** Do not open adoption until all additional evidence writers share the lock. */
export async function fitnessAdoptionPublicationReady(
  tx: Prisma.TransactionClient,
) {
  const rows = await tx.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`
    SELECT count(*) = 3 AS ready FROM pg_trigger
    WHERE tgname = 'fitness_revision' AND NOT tgisinternal AND tgenabled IN ('O', 'A')
      AND tgrelid IN (to_regclass('t_activity_vo2max'), to_regclass('t_user_profile'), to_regclass('t_user_daily_health_metric'))
  `);
  return rows[0]?.ready === true;
}
