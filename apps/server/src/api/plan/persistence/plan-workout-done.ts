import type { PlanDb } from './plan-db';

/** 事务内：可完成的课次标 DONE。给 matcher / query 共用，避免业务层直写 planWorkout。 */
export async function markWorkoutDoneIfApplicable(
  tx: PlanDb,
  workoutId: string,
  eventTime: Date | null,
) {
  const workout = await tx.planWorkout.findUnique({
    where: { id: workoutId },
    select: { status: true, plan: { select: { status: true } } },
  });
  if (!workout) return false;
  if (workout.plan?.status !== 'ACTIVE' && workout.plan?.status !== 'PAUSED') {
    return false;
  }
  if (workout.status !== 'PLANNED' && workout.status !== 'IN_PROGRESS') {
    return false;
  }
  await tx.planWorkout.update({
    where: { id: workoutId },
    data: { status: 'DONE', completedAt: eventTime ?? new Date() },
  });
  return true;
}
