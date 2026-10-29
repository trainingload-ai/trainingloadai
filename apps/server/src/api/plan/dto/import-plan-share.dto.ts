import { IsBoolean, IsOptional } from 'class-validator';

export class ImportPlanShareDto {
  @IsOptional()
  @IsBoolean()
  share?: boolean;
}
