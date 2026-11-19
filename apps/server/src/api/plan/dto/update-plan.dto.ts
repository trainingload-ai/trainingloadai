import type {
  ScheduleConstraints,
  ScheduleQualityContractTransition,
} from '@shared/plan-calendar';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  Max,
  IsOptional,
  IsObject,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PLAN_SPORT_TYPES } from '../plan.constants';
import { ParseWorkoutDefinitionDto } from '../../workout/dto/parse-workout-definition.dto';

class UpdatePlanWorkoutInputDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  plannedSessionRpe?: number;

  @IsOptional()
  @IsString()
  id?: string;

  @IsInt()
  @Min(1)
  weekIndex!: number;

  @IsInt()
  @Min(1)
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
  blocks?: unknown;
}

export class UpdatePlanDto {
  @IsOptional()
  @IsObject()
  scheduleConstraints?: ScheduleConstraints;

  @IsOptional()
  @IsObject()
  qualityContractTransition?: ScheduleQualityContractTransition;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  goal?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  periodWeeks?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdatePlanWorkoutInputDto)
  workouts?: UpdatePlanWorkoutInputDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deletedWorkoutIds?: string[];
}
