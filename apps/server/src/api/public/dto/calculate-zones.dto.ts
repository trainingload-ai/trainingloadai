import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { $Enums, SportType } from '@prisma/client';

export class CalculateHeartRateZonesDto {
  @IsNumber()
  @Min(30)
  @Max(250)
  maxHeartRate: number;

  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(150)
  restingHeartRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(250)
  lthr?: number;

  @IsOptional()
  @IsEnum($Enums.HeartRateZoneModel)
  heartRateZoneModel?: $Enums.HeartRateZoneModel;

  @IsOptional()
  @IsEnum(SportType)
  sportType?: SportType;
}
