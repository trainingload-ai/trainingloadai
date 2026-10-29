import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PLAN_SPORT_TYPES } from '../plan.constants';
import { ParseWorkoutDefinitionDto } from '../../workout/dto/parse-workout-definition.dto';

export class UpdatePlanWorkoutDto {
  @IsInt()
  @Min(1)
  @Max(520)
  weekIndex!: number;

  @IsInt()
  @Min(1)
  @Max(7)
  dayIndex!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  sessionIndex?: number;

  @IsIn(PLAN_SPORT_TYPES)
  sportType!: (typeof PLAN_SPORT_TYPES)[number];

  @IsOptional()
  @IsString()
  sportDefinitionCode?: string | null;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ParseWorkoutDefinitionDto)
  definition?: ParseWorkoutDefinitionDto;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsString()
  name?: string | null;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  blocks?: unknown;
}
