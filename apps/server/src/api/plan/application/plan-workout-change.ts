import type { Prisma } from '@prisma/client';

export type PlanWorkoutChangeSource = 'external_import' | 'garmin_schedule_import';

/** Read the current committed revision. Consumers compare their own acknowledged counter. */
export function readPlanWorkoutChange(
  db: Pick<Prisma.TransactionClient, 'planWorkoutChangeRevision'>,
  userId: string,
) {
  return db.planWorkoutChangeRevision.findUnique({ where: { userId } });
}

/** Carry provider origin through the canonical write transaction and its triggers. */
export async function setPlanWorkoutChangeSource(
  tx: Prisma.TransactionClient,
  source: PlanWorkoutChangeSource,
) {
  await tx.$queryRaw`SELECT set_config('trainingload.plan_workout_change_source', ${source}, true)`;
}
