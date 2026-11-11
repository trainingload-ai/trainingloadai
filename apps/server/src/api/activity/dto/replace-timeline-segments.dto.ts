import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsInt,
  IsNumber,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

class TimelineSegmentDto {
  @IsString()
  @Matches(/^[\w:-]{1,80}$/)
  id!: string;

  @IsString()
  @MaxLength(80)
  name!: string;

  @IsNumber()
  @Min(0)
  start!: number;

  @IsNumber()
  @Min(0)
  end!: number;
}

export class ReplaceTimelineSegmentsDto {
  @IsInt()
  @Min(0)
  revision!: number;

  @IsDefined()
  @ValidateIf((_object, value) => value !== null)
  @IsArray()
  @ArrayMaxSize(512)
  @ValidateNested({ each: true })
  @Type(() => TimelineSegmentDto)
  segments!: TimelineSegmentDto[] | null;
}
