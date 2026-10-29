import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class ParseWorkoutDefinitionDto {
  @IsIn(['ENDURANCE', 'STRENGTH', 'FREEFORM'])
  kind!: 'ENDURANCE' | 'STRENGTH' | 'FREEFORM';

  @Type(() => Number)
  @IsInt()
  @IsIn([1])
  version!: 1;

  @IsIn(['TEXT', 'STRUCTURE'])
  source!: 'TEXT' | 'STRUCTURE';

  @ValidateIf((value: ParseWorkoutDefinitionDto) => value.source === 'TEXT')
  @IsDefined()
  @IsString()
  text?: string;

  @ValidateIf(
    (value: ParseWorkoutDefinitionDto) => value.source === 'STRUCTURE',
  )
  @IsDefined()
  @IsObject()
  structure?: Record<string, unknown>;

  @IsOptional()
  _compatibilityMarker?: never;
}
