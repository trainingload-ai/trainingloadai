import { fitnessTimelineFingerprint } from '@/algorithm/fitness-timeline';

/** Bump only when materialization semantics change, independently of parser bytes. */
export const ACTIVITY_MATERIALIZATION_VERSION = 2;

export type ActivityDatasetRepair = {
  migrationId: string;
  activityId: number;
  primarySourceId: string;
  expectedFingerprint: string;
  sourceChecksum: string;
};

export function datasetRepairFingerprint(
  activity: Record<string, unknown>,
  primary: Record<string, unknown>,
  files: ReadonlyArray<Record<string, unknown>>,
) {
  return fitnessTimelineFingerprint({
    activity: Object.fromEntries(
      [
        'id',
        'state',
        'activityName',
        'description',
        'sessionRpe',
        'sportType',
        'sportDefinitionCode',
        'subSport',
        'startTime',
        'endTime',
        'timezone',
        'timerTime',
        'elapsedTime',
        'distance',
      ].map((key) => [key, activity[key] ?? null]),
    ),
    primary: Object.fromEntries(
      ['id', 'sourceChecksum', 'canonicalSnapshotId'].map((key) => [
        key,
        primary[key] ?? null,
      ]),
    ),
    files: files
      .map((file) =>
        Object.fromEntries(
          ['type', 'parquetPath', 'checksum', 'pointCount'].map((key) => [
            key,
            file[key] ?? null,
          ]),
        ),
      )
      .sort((a, b) => String(a.type).localeCompare(String(b.type))),
  });
}
