import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsNumber, IsOptional, Min } from 'class-validator';
import { $Enums } from '@prisma/client';

export class EstimateCpFromFilesDto {
  @IsIn(['three_nine', 'ten_km', 'thirty_min'])
  testType: 'three_nine' | 'ten_km' | 'thirty_min';

  @IsOptional()
  @IsEnum($Enums.SportType)
  sportType: $Enums.SportType = $Enums.SportType.RUN;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  weightKg?: number;
}
