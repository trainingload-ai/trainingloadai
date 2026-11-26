import { IsInt, Matches, Min } from 'class-validator';
import type { PlanCalendarMoveInput } from '@shared/plan-proposal';

export class PreviewCalendarMoveDto implements PlanCalendarMoveInput {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  targetDate: string;

  @IsInt()
  @Min(1)
  expectedRevision: number;
}
