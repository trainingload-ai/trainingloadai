import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class CommitActivityImportDraftDto {
  @ValidateIf((_o, v) => v != null)
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(10)
  sessionRpe?: number | null;

  @IsOptional()
  @IsString()
  workoutId?: string;
}
