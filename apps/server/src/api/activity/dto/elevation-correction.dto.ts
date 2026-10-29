import { IsString, IsOptional, IsBoolean } from 'class-validator';

/**
 * Elevation correction upload DTO
 */
export class ElevationCorrectionUploadDto {
  @IsOptional()
  @IsBoolean()
  useEnhancedElevation?: boolean = true; // Whether to use enhanced elevation data
}

/**
 * Elevation correction response DTO
 */
export class ElevationCorrectionResponseDto {
  /**
   * Activity ID
   */
  id?: string;
}

export class ElevationCorrectionWithPaseFileResponseDto {
  ids?: string[];
}

/**
 * Elevation correction by hashId DTO
 */
export class ElevationCorrectionByHashDto {
  @IsString()
  hashId: string;

  @IsOptional()
  @IsBoolean()
  useEnhancedElevation?: boolean = true;
}
