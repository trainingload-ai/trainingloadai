import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateReviewScheduleDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** HH:mm（本地时间） */
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,2}:\d{2}$/)
  sendAtLocalTime?: string;
}
