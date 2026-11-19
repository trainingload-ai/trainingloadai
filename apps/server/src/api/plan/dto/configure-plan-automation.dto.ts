import { IsBoolean, IsObject, IsOptional } from 'class-validator';
export class ConfigurePlanAutomationDto {
  @IsBoolean()
  enabled!: boolean;
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
