import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PLAN_SPORT_TYPES } from '../plan.constants';
import { ParseWorkoutDefinitionDto } from '../../workout/dto/parse-workout-definition.dto';

export class CreateScheduledWorkoutDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  scheduledDate!: string;

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
  name?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  blocks?: unknown;
}
