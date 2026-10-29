import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CompletePlanDto {
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
