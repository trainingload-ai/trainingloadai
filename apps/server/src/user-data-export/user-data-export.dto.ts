import { IsBoolean, IsIn } from 'class-validator';

import {
  USER_DATA_EXPORT_LOCATION_PRIVACY,
  USER_DATA_EXPORT_MODES,
  type UserDataExportLocationPrivacy,
  type UserDataExportMode,
} from '@shared/user-data-export';

export class CreateUserDataExportDto {
  @IsIn(USER_DATA_EXPORT_MODES)
  mode!: UserDataExportMode;

  @IsIn(USER_DATA_EXPORT_LOCATION_PRIVACY)
  locationPrivacy!: UserDataExportLocationPrivacy;

  @IsBoolean()
  includeOriginalFiles!: boolean;
}
