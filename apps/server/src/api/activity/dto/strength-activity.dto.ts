import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class StrengthActualLoadDto {
  @IsIn(['OPEN', 'ABSOLUTE', 'PERCENT_1RM', 'BODYWEIGHT', 'BODYWEIGHT_OFFSET'])
  kind!:
    | 'OPEN'
    | 'ABSOLUTE'
    | 'PERCENT_1RM'
    | 'BODYWEIGHT'
    | 'BODYWEIGHT_OFFSET';

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsIn(['KG', 'LB'])
  unit?: 'KG' | 'LB';

  @IsOptional()
  @IsIn(['ADDED', 'ASSISTED'])
  direction?: 'ADDED' | 'ASSISTED';
}

export class ActivityStrengthSetDto {
  @IsOptional()
  @IsString()
  plannedSetGroupId?: string;

  @IsInt()
  @Min(0)
  setIndex!: number;

  @IsIn(['WARMUP', 'WORK'])
  setType!: 'WARMUP' | 'WORK';

  @IsOptional()
  @IsInt()
  @Min(0)
  completedReps?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  completedDurationSeconds?: number;

  @ValidateNested()
  @Type(() => StrengthActualLoadDto)
  load!: StrengthActualLoadDto;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  actualRpe?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  actualRir?: number;

  @IsOptional()
  @IsString()
  completedAt?: string | null;

  @IsOptional()
  @IsIn(['APP', 'FIT', 'MANUAL'])
  source?: 'APP' | 'FIT' | 'MANUAL';
}

export class ActivityStrengthExerciseDto {
  @IsOptional()
  @IsString()
  exerciseCode?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  equipmentCode?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ActivityStrengthSetDto)
  sets!: ActivityStrengthSetDto[];
}

export class ReplaceActivityStrengthDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ActivityStrengthExerciseDto)
  exercises!: ActivityStrengthExerciseDto[];
}

export class AddActivityStrengthExerciseDto extends ActivityStrengthExerciseDto {}

export class StartStrengthActivityDto {
  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsString()
  workoutId?: string;

  @IsOptional()
  @IsString()
  startedAt?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class FinishStrengthActivityDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  sessionRpe?: number;
}

export class CompleteActivityStrengthSetDto {
  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  completedReps?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  completedDurationSeconds?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => StrengthActualLoadDto)
  load?: StrengthActualLoadDto;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  actualRpe?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  actualRir?: number;

  @IsOptional()
  @IsIn(['APP', 'FIT', 'MANUAL'])
  source?: 'APP' | 'FIT' | 'MANUAL';
}
