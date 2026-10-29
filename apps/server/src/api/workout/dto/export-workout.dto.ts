import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ParseWorkoutDefinitionDto } from './parse-workout-definition.dto';

export class ExportWorkoutDto {
  @IsString()
  provider!: string;

  @IsOptional()
  @IsString()
  deviceProfile?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  sport?: string;

  @IsOptional()
  @IsString()
  subSport?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  product?: number;

  @ValidateNested()
  @Type(() => ParseWorkoutDefinitionDto)
  definition!: ParseWorkoutDefinitionDto;
}
