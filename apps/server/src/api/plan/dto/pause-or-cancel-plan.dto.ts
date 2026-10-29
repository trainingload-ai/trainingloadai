import { IsOptional, IsString } from 'class-validator';

export class PauseOrCancelPlanDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
