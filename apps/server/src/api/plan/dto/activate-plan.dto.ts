import { IsDateString, IsOptional, Matches } from 'class-validator';

export class ActivatePlanDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;
}

export class StartOfficialPlanDraftDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;

  @Matches(/^[a-f0-9]{64}$/)
  revision!: string;
}
