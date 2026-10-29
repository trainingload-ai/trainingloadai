import { IsIn } from 'class-validator';
import { PLAN_WORKOUT_STATUSES } from '../plan.constants';

export class UpdatePlanWorkoutStatusDto {
  @IsIn(PLAN_WORKOUT_STATUSES)
  status!: (typeof PLAN_WORKOUT_STATUSES)[number];
}
