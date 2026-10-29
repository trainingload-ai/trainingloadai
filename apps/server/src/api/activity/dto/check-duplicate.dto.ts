export class DuplicateActivityInfo {
  hashId: string;
  activityName: string;
  startTime: Date;
  totalDistance?: number;
  totalElapsedTime?: number;
  sportType?: string;
}

export class DuplicateCheckResult {
  fileName: string;
  isRepeat: boolean;
  duplicateActivities?: DuplicateActivityInfo[];
}

export class CheckDuplicateActivitiesResponseDto {
  results: DuplicateCheckResult[];
}
