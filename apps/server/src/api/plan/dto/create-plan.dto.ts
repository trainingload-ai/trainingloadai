import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsNumber,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PLAN_SOURCE_TYPES, PLAN_SPORT_TYPES } from '../plan.constants';
import { ParseWorkoutDefinitionDto } from '../../workout/dto/parse-workout-definition.dto';

export class PlanWorkoutInputDto {
  @IsInt()
  @Min(1)
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
  @IsNumber()
  @Min(1)
  @Max(10)
  plannedSessionRpe?: number;

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
  notes?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  blocks?: unknown;
}

export class CreatePlanDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @IsIn(PLAN_SOURCE_TYPES)
  sourceType?: (typeof PLAN_SOURCE_TYPES)[number];

  @IsOptional()
  @IsObject()
  generationMetadata?: Record<string, unknown>;

  @IsInt()
  @Min(1)
  @Max(520)
  periodWeeks!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanWorkoutInputDto)
  workouts!: PlanWorkoutInputDto[];
}
