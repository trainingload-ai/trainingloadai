import { IsIn } from 'class-validator';
import { SportType, ZoneType } from '@prisma/client';

export class ZoneModelPreviewQueryDto {
  @IsIn([SportType.UNKNOWN, SportType.RUN, SportType.CYCLING, SportType.SWIM])
  sportType!: SportType;

  @IsIn([ZoneType.HEART_RATE, ZoneType.POWER, ZoneType.PACE])
  zoneType!: ZoneType;
}
