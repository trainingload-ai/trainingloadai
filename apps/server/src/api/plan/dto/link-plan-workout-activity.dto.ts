import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import {
  PLAN_WORKOUT_ACTIVITY_LINK_ROLES,
  PLAN_WORKOUT_ACTIVITY_LINK_SOURCES,
} from '../plan.constants';

export class LinkPlanWorkoutActivityDto {
  @IsInt()
  @Min(1)
  activityId!: number;

  @IsOptional()
  @IsIn(PLAN_WORKOUT_ACTIVITY_LINK_SOURCES)
  source?: (typeof PLAN_WORKOUT_ACTIVITY_LINK_SOURCES)[number];

  @IsOptional()
  @IsIn(PLAN_WORKOUT_ACTIVITY_LINK_ROLES)
  role?: (typeof PLAN_WORKOUT_ACTIVITY_LINK_ROLES)[number];
}
