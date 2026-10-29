import { IsDateString, IsOptional } from 'class-validator';

export class ActivatePlanDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;
}
