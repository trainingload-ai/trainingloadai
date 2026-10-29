import { Type } from 'class-transformer';
import {
  IsISO8601,
  Max,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class TodaySuggestionLocationDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsNumber()
  @Min(0)
  accuracyMeters!: number;

  @IsISO8601()
  capturedAt!: string;
}

export class TodaySuggestionBodyDto {
  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TodaySuggestionLocationDto)
  location?: TodaySuggestionLocationDto;
}
