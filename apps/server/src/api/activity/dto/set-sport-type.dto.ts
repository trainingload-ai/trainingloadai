import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { $Enums } from '@prisma/client';

export class ActivitySportTypeItem {
  @IsString()
  @IsNotEmpty()
  hashId: string;

  @IsEnum($Enums.SportType)
  @IsNotEmpty()
  sportType: $Enums.SportType;

  @IsOptional()
  @IsString()
  sportDefinitionCode?: string | null;

  @IsOptional()
  @IsString()
  subSportType?: string | null;
}

export class SetActivitiesSportTypeDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActivitySportTypeItem)
  activities: ActivitySportTypeItem[];

  // Enable smart inference, default is true
  @IsOptional()
  @IsBoolean()
  enableSmartInfer: boolean = true;
}
