import { Injectable } from '@nestjs/common';
import type {
  CanonicalActivityPayload,
  CanonicalRecord,
} from './canonical-activity.types';
import type { Activity } from '@prisma/client';

export type DatasetQuality = {
  version: 'v1';
  score: number;
  recordCount: number;
  recordDensity: number;
  gpsCoverage: number;
  heartRateCoverage: number;
  powerCoverage: number;
  cadenceCoverage: number;
  lapCount: number;
  lengthCount: number;
};

function coverage(
  records: CanonicalRecord[],
  predicate: (r: CanonicalRecord) => boolean,
) {
  if (!records.length) return 0;
  return records.filter(predicate).length / records.length;
}

export function evaluateActivityDataset(
  payload: CanonicalActivityPayload,
): DatasetQuality {
  const records = payload.records ?? [];
  const laps = payload.laps ?? [];
  const lengths = payload.lengths ?? [];
  const elapsed = Math.max(payload.summary.elapsedTime ?? 0, 1);
  const recordDensity = records.length / elapsed;
  const gpsCoverage = coverage(
    records,
    (record) => record.positionLat != null && record.positionLong != null,
  );
  const heartRateCoverage = coverage(
    records,
    (record) => record.heartRate != null,
  );
  const powerCoverage = coverage(records, (record) => record.power != null);
  const cadenceCoverage = coverage(
    records,
    (record) => record.cadence != null,
  );
  const score = Math.round(
    Math.min(25, recordDensity * 50) +
      gpsCoverage * 20 +
      heartRateCoverage * 15 +
      powerCoverage * 15 +
      cadenceCoverage * 10 +
      Math.min(10, laps.length * 2) +
      Math.min(5, lengths.length / 10),
  );
  return {
    version: 'v1',
    score,
    recordCount: records.length,
    recordDensity,
    gpsCoverage,
    heartRateCoverage,
    powerCoverage,
    cadenceCoverage,
    lapCount: laps.length,
    lengthCount: lengths.length,
  };
}

@Injectable()
export class ActivityDatasetSelectorService {
  evaluate(payload: CanonicalActivityPayload): DatasetQuality {
    return evaluateActivityDataset(payload);
  }

  evaluateLegacyActivity(
    activity: Pick<
      Activity,
      | 'elapsedTime'
      | 'timerTime'
      | 'startLat'
      | 'startLng'
      | 'avgHeartRate'
      | 'maxHeartRate'
      | 'minHeartRate'
      | 'avgPower'
      | 'maxPower'
      | 'minPower'
      | 'avgCadence'
      | 'maxCadence'
      | 'numLaps'
      | 'numLengths'
    >,
    parquetFiles: ReadonlyArray<{
      type?: string | null;
      pointCount?: number | null;
    }>,
  ): DatasetQuality {
    const recordCount = Math.max(
      0,
      ...parquetFiles
        .filter((file) => (file.type ?? 'record') === 'record')
        .map((file) => Number(file.pointCount ?? 0)),
    );
    const lengthCount = Math.max(
      Number(activity.numLengths ?? 0),
      ...parquetFiles
        .filter((file) => file.type === 'length')
        .map((file) => Number(file.pointCount ?? 0)),
    );
    const elapsed = Math.max(
      Number(activity.elapsedTime ?? activity.timerTime ?? 0),
      1,
    );
    const recordDensity = recordCount / elapsed;
    const gpsCoverage =
      activity.startLat != null && activity.startLng != null ? 0.25 : 0;
    const heartRateCoverage =
      activity.avgHeartRate != null ||
      activity.maxHeartRate != null ||
      activity.minHeartRate != null
        ? 0.5
        : 0;
    const powerCoverage =
      activity.avgPower != null ||
      activity.maxPower != null ||
      activity.minPower != null
        ? 0.5
        : 0;
    const cadenceCoverage =
      activity.avgCadence != null || activity.maxCadence != null ? 0.5 : 0;
    const lapCount = Math.max(Number(activity.numLaps ?? 0), 0);
    const score = Math.round(
      Math.min(25, recordDensity * 50) +
        gpsCoverage * 20 +
        heartRateCoverage * 15 +
        powerCoverage * 15 +
        cadenceCoverage * 10 +
        Math.min(10, lapCount * 2) +
        Math.min(5, lengthCount / 10),
    );
    return {
      version: 'v1',
      score,
      recordCount,
      recordDensity,
      gpsCoverage,
      heartRateCoverage,
      powerCoverage,
      cadenceCoverage,
      lapCount,
      lengthCount,
    };
  }

  shouldPromote(args: {
    incoming: DatasetQuality;
    current?: DatasetQuality | null;
    sameChecksum: boolean;
  }) {
    if (args.sameChecksum) return false;
    if (!args.current) return args.incoming.score >= 10;
    // 留出滞回区间，避免同质量来源在反复同步时来回切换。
    return args.incoming.score >= args.current.score + 10;
  }
}
