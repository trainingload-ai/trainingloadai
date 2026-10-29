import {
  CompetitionGoalType,
  CompetitionImportance,
  SportType,
} from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateCompetitionEventDto {
  @IsString()
  @Length(1, 120)
  title!: string;

  @IsEnum(SportType)
  sportType!: SportType;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  sportDefinitionCode?: string | null;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(1)
  @Max(1_000_000)
  distanceMeters?: number | null;

  @IsString()
  @Matches(YMD_PATTERN)
  startDate!: string;

  @IsOptional()
  @IsString()
  @Matches(YMD_PATTERN)
  endDate?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  startTimeMinute?: number | null;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  timezone?: string | null;

  @IsEnum(CompetitionImportance)
  importance!: CompetitionImportance;

  @IsEnum(CompetitionGoalType)
  goalType!: CompetitionGoalType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31_536_000)
  targetTimeSeconds?: number | null;

  @IsOptional()
  @IsString()
  @Length(1, 240)
  location?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 4000)
  notes?: string | null;
}
