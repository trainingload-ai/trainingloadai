import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SportType } from '@prisma/client';

export class TimeRangeDto {
  @IsOptional()
  @IsString()
  start?: string;

  @IsOptional()
  @IsString()
  end?: string;
}

export class PaceDistancePerformanceRequestDto {
  @IsString()
  @IsIn(['RUN', 'CYCLING', 'SWIM', 'UNKNOWN'])
  sportType!: SportType;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeRangeDto)
  ranges!: TimeRangeDto[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  distances?: number[];

  @IsOptional()
  @IsString()
  @IsIn(['distance', 'time'])
  mode?: 'distance' | 'time';

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  targets?: number[];

  @IsOptional()
  @IsNumber()
  limit?: number;
}

export type PaceDistanceValue = {
  paceSec: number;
  timeSec: number;
  paceBaseM?: number | null;
  activityId?: string;
  activityTime?: string;
};

export type PaceDistancePerformanceResponseItem = {
  timeRange: { start?: string; end?: string };
  values: Record<string, PaceDistanceValue | undefined>;
  topValues?: Record<string, PaceDistanceValue[]>;
};
