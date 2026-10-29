import { IsIn, IsOptional, IsString } from 'class-validator';

export class ConvertFilesDto {
  @IsString()
  @IsIn(['gpx', 'fit', 'tcx'])
  type: 'gpx' | 'fit' | 'tcx';

  @IsOptional()
  @IsString()
  @IsIn(['gpx', 'fit', 'tcx'])
  sourceType?: 'gpx' | 'fit' | 'tcx';
}

export class ConvertByHashDto {
  @IsString()
  fileHashId: string;

  @IsString()
  @IsIn(['gpx', 'fit', 'tcx'])
  type: 'gpx' | 'fit' | 'tcx';
}

export class EditExportDto {
  // Structure passed through from frontend, complex type, strict validation skipped
  @IsOptional()
  activityFile: unknown;

  @IsString()
  @IsIn(['gpx', 'fit', 'tcx'])
  type: 'gpx' | 'fit' | 'tcx';
}
