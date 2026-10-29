import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { ParseWorkoutDefinitionDto } from './parse-workout-definition.dto';

export class ParseWorkoutDefinitionsDto {
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ParseWorkoutDefinitionDto)
  definitions!: ParseWorkoutDefinitionDto[];
}
