import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListAthleteMemoryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  cursor?: string;
}

export class CorrectAthleteMemoryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @IsString()
  @MaxLength(320)
  claim: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;
}

export class UpdateAthleteMemoryPreferenceDto {
  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsBoolean()
  clearHistory?: boolean;
}

export class AthleteMemoryFactParamDto {
  @IsString()
  @MaxLength(128)
  factId: string;
}
