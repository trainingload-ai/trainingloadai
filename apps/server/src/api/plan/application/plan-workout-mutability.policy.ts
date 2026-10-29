import { Injectable } from '@nestjs/common';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';

export type WorkoutMutationKind =
  | 'PRESCRIPTION'
  | 'SCHEDULE'
  | 'DELETE'
  | 'STATUS';

export type WorkoutMutabilityInput = {
  planStatus: string;
  workoutStatus: string;
  scheduledDateYmd?: string | null;
  athleteTodayYmd: string;
  activeActivityLinkCount: number;
  pendingSupersessionYmd?: string | null;
};

export type WorkoutImmutabilityReason =
  | 'PLAN_STATUS'
  | 'WORKOUT_STATUS'
  | 'ACTIVITY_LINKED'
  | 'HISTORY'
  | 'PENDING_SUPERSESSION';

export function workoutImmutabilityReason(
  input: WorkoutMutabilityInput,
): WorkoutImmutabilityReason | null {
  if (!['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED'].includes(input.planStatus)) {
    return 'PLAN_STATUS';
  }
  if (input.workoutStatus !== 'PLANNED') return 'WORKOUT_STATUS';
  if (input.activeActivityLinkCount > 0) return 'ACTIVITY_LINKED';

  if (
    input.pendingSupersessionYmd &&
    input.scheduledDateYmd &&
    input.scheduledDateYmd >= input.pendingSupersessionYmd
  ) {
    return 'PENDING_SUPERSESSION';
  }

  if (
    ['ACTIVE', 'PAUSED'].includes(input.planStatus) &&
    (!input.scheduledDateYmd || input.scheduledDateYmd < input.athleteTodayYmd)
  ) {
    return 'HISTORY';
  }
  return null;
}

@Injectable()
export class PlanWorkoutMutabilityPolicy {
  reason(input: WorkoutMutabilityInput, kind: WorkoutMutationKind) {
    return kind === 'STATUS'
      ? this.statusTransitionImmutabilityReason(input)
      : workoutImmutabilityReason(input);
  }

  assertMutable(input: WorkoutMutabilityInput, kind: WorkoutMutationKind) {
    const reason = this.reason(input, kind);
    if (!reason) return;
    const messages: Record<WorkoutImmutabilityReason, string> = {
      PLAN_STATUS: 'This plan is not editable',
      WORKOUT_STATUS: 'Only planned workouts can be changed',
      ACTIVITY_LINKED:
        'This workout is linked to an activity. Remove all active links before changing it.',
      HISTORY: 'Historical workouts cannot be changed',
      PENDING_SUPERSESSION:
        'This workout is already covered by a scheduled replacement plan',
    };
    throw new BusinessException({
      code: BUSINESS_ERROR_CODE.WORKOUT_IMMUTABLE,
      message: messages[reason],
    });
  }

  private statusTransitionImmutabilityReason(
    input: WorkoutMutabilityInput,
  ): WorkoutImmutabilityReason | null {
    if (!['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED'].includes(input.planStatus))
      return 'PLAN_STATUS';
    if (!['PLANNED', 'IN_PROGRESS'].includes(input.workoutStatus))
      return 'WORKOUT_STATUS';
    if (
      input.pendingSupersessionYmd &&
      input.scheduledDateYmd &&
      input.scheduledDateYmd >= input.pendingSupersessionYmd
    )
      return 'PENDING_SUPERSESSION';
    return null;
  }
}
