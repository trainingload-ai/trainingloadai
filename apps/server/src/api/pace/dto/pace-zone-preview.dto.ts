import { IsIn } from 'class-validator';
import { SportType } from '@prisma/client';

export class PaceZonePreviewQueryDto {
  @IsIn([SportType.RUN, SportType.SWIM])
  sportType!: SportType;
}
