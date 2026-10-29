import { CompetitionStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ListCompetitionEventsDto {
  @IsString()
  @Matches(YMD_PATTERN)
  startDate!: string;

  @IsString()
  @Matches(YMD_PATTERN)
  endDate!: string;

  @IsOptional()
  @IsEnum(CompetitionStatus)
  status?: CompetitionStatus;
}
