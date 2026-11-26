import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDefined, IsIn, IsInt, IsNotEmpty,
  IsOptional, IsString, IsUUID, Matches, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { CreateScheduledWorkoutDto } from './create-scheduled-workout.dto';
import { OmitType } from '@nestjs/mapped-types';
import { ParseWorkoutDefinitionDto } from '../../workout/dto/parse-workout-definition.dto';

class CalendarEditWorkoutDto extends OmitType(CreateScheduledWorkoutDto, [
  'scheduledDate', 'text', 'blocks', 'definition',
] as const) {
  @IsDefined()
  @ValidateNested()
  @Type(() => ParseWorkoutDefinitionDto)
  definition!: ParseWorkoutDefinitionDto;
}

class CalendarEditDto {
  @IsIn(['ADD', 'UPDATE', 'DELETE'])
  kind!: 'ADD' | 'UPDATE' | 'DELETE';

  @ValidateIf((edit: CalendarEditDto) => edit.kind === 'ADD')
  @IsUUID('4')
  candidateKey?: string;

  @ValidateIf((edit: CalendarEditDto) => edit.kind !== 'ADD')
  @IsString()
  @IsNotEmpty()
  workoutId?: string;

  @ValidateIf((edit: CalendarEditDto) => edit.kind !== 'ADD')
  @IsInt()
  @Min(0)
  expectedRevision?: number;

  @ValidateIf((edit: CalendarEditDto) => edit.kind !== 'DELETE')
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  targetDate?: string;

  @ValidateIf((edit: CalendarEditDto) => edit.kind === 'ADD' || edit.workout != null)
  @IsDefined()
  @ValidateNested()
  @Type(() => CalendarEditWorkoutDto)
  workout?: CalendarEditWorkoutDto;
}

class CalendarEditsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CalendarEditDto)
  edits!: CalendarEditDto[];
}

export class ReviseCalendarAdjustmentDto extends CalendarEditsDto {
  @IsUUID('4')
  confirmationId!: string;
}

export class SaveCalendarAdjustmentDto extends CalendarEditsDto {
  @IsUUID('4')
  versionId!: string;

  @IsOptional()
  @IsString()
  baseVersionId?: string;
}

export class RebaseCalendarAdjustmentDto {
  @IsUUID('4')
  versionId!: string;

  @IsString()
  baseVersionId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  operationKeys?: string[];
}
