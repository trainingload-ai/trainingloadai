import { Type } from 'class-transformer';
import { IsDefined, IsNumber, Max, Min, ValidateIf } from 'class-validator';

/**
 * PATCH /activities/:hashId/session-rpe
 * 主观 Session RPE（常见 1–10，可半档）；`null` 表示清除已保存值。
 */
export class UpdateActivitySessionRpeDto {
  @IsDefined()
  @ValidateIf((_o, v) => v != null)
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(10)
  sessionRpe!: number | null;
}
