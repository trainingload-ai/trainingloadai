import { Injectable } from '@nestjs/common';
import { fitnessTimelineFingerprint } from '@/algorithm/fitness-timeline';
import { PrismaService } from '@/prisma/prisma.service';

export type ActivityInputDimension =
  | 'HEART_RATE'
  | 'POWER'
  | 'PACE'
  | 'PROFILE'
  | 'LOAD';

export type ActivityInputFingerprints = {
  overall: string;
  dimensions: Record<ActivityInputDimension, string>;
};

/**
 * Builds low-cost fingerprints for every raw activity input consumed by
 * HEAVY analysis. Only database metadata, checksums and lap summaries are
 * read; Parquet point data is intentionally excluded.
 */
@Injectable()
export class ActivityInputFingerprintService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(activityId: number): Promise<ActivityInputFingerprints> {
    const activity = await this.prisma.activity.findUniqueOrThrow({
      where: { id: activityId },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        timezone: true,
        sportType: true,
        sportDefinitionCode: true,
        subSport: true,
        timerTime: true,
        elapsedTime: true,
        distance: true,
        ascent: true,
        descent: true,
        poolLength: true,
        poolLengthUnit: true,
        numLaps: true,
        numLengths: true,
        numActiveLengths: true,
        minPower: true,
        maxPower: true,
        avgPower: true,
        avgCadence: true,
        maxCadence: true,
        avgHeartRate: true,
        maxHeartRate: true,
        minHeartRate: true,
        maxSpeed: true,
        avgSpeed: true,
        cycles: true,
        work: true,
        strokes: true,
        sessionRpe: true,
        eftp: true,
        ecp: true,
        ewPrime: true,
        epmax: true,
        parquetFiles: {
          orderBy: [{ type: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            type: true,
            checksum: true,
            pointCount: true,
            fileSize: true,
            storageStrategy: true,
            parquetPath: true,
          },
        },
        laps: {
          orderBy: [{ index: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            index: true,
            sportType: true,
            startTime: true,
            endTime: true,
            timerTime: true,
            elapsedTime: true,
            distance: true,
            ascent: true,
            descent: true,
            cycles: true,
            work: true,
            strokes: true,
            maxSpeed: true,
            avgSpeed: true,
            avgPower: true,
            maxPower: true,
            normalizedPower: true,
            avgCadence: true,
            maxCadence: true,
            avgHeartRate: true,
            maxHeartRate: true,
            calories: true,
          },
        },
        activitySources: {
          where: { isActive: true, isPrimary: true },
          orderBy: { id: 'asc' },
          select: {
            id: true,
            sourceKind: true,
            provider: true,
            sourceUid: true,
            sourceChecksum: true,
            metadata: true,
          },
        },
      },
    });

    // sampleSec and calories are derived caches, never raw inputs: HEAVY
    // initializes the former and recomputes the latter even without records.
    // Their underlying record/source facts are fingerprinted below instead.
    // With record facts, these other scalar columns are HEAVY output caches. The
    // Parquet/source checksums fingerprint their facts; hashing the caches
    // makes a successful analysis invalidate its own snapshot.
    const hasRecordFacts = activity.parquetFiles.some(
      (file) => String(file.type).toLowerCase() === 'record',
    );
    const summaryFallback = (value: number | null) =>
      hasRecordFacts ? null : value;
    const common = {
      id: activity.id,
      startTime: activity.startTime,
      endTime: activity.endTime,
      timezone: activity.timezone,
      sportType: activity.sportType,
      sportDefinitionCode: activity.sportDefinitionCode,
      subSport: activity.subSport,
      timerTime: activity.timerTime,
      elapsedTime: activity.elapsedTime,
      parquetFiles: activity.parquetFiles,
      sources: activity.activitySources,
    };
    const dimensions: Record<ActivityInputDimension, string> = {
      HEART_RATE: fitnessTimelineFingerprint({
        common,
        avgHeartRate: summaryFallback(activity.avgHeartRate),
        maxHeartRate: summaryFallback(activity.maxHeartRate),
        minHeartRate: summaryFallback(activity.minHeartRate),
        laps: activity.laps.map((lap) => ({
          id: lap.id,
          index: lap.index,
          startTime: lap.startTime,
          endTime: lap.endTime,
          timerTime: lap.timerTime,
          elapsedTime: lap.elapsedTime,
          avgHeartRate: lap.avgHeartRate,
          maxHeartRate: lap.maxHeartRate,
        })),
      }),
      POWER: fitnessTimelineFingerprint({
        common,
        minPower: activity.minPower,
        maxPower: activity.maxPower,
        avgPower: summaryFallback(activity.avgPower),
        avgCadence: activity.avgCadence,
        maxCadence: activity.maxCadence,
        cycles: activity.cycles,
        work: activity.work,
        eftp: activity.eftp,
        ecp: activity.ecp,
        ewPrime: activity.ewPrime,
        epmax: activity.epmax,
        laps: activity.laps.map((lap) => ({
          id: lap.id,
          index: lap.index,
          timerTime: lap.timerTime,
          elapsedTime: lap.elapsedTime,
          avgPower: lap.avgPower,
          maxPower: lap.maxPower,
          normalizedPower: lap.normalizedPower,
          avgCadence: lap.avgCadence,
          maxCadence: lap.maxCadence,
          cycles: lap.cycles,
          work: lap.work,
        })),
      }),
      PACE: fitnessTimelineFingerprint({
        common,
        distance: activity.distance,
        ascent: activity.ascent,
        descent: activity.descent,
        maxSpeed: activity.maxSpeed,
        avgSpeed: summaryFallback(activity.avgSpeed),
        poolLength: activity.poolLength,
        poolLengthUnit: activity.poolLengthUnit,
        numLengths: activity.numLengths,
        numActiveLengths: activity.numActiveLengths,
        strokes: activity.strokes,
        laps: activity.laps.map((lap) => ({
          id: lap.id,
          index: lap.index,
          startTime: lap.startTime,
          endTime: lap.endTime,
          timerTime: lap.timerTime,
          elapsedTime: lap.elapsedTime,
          distance: lap.distance,
          ascent: lap.ascent,
          descent: lap.descent,
          maxSpeed: lap.maxSpeed,
          avgSpeed: lap.avgSpeed,
          strokes: lap.strokes,
        })),
      }),
      PROFILE: fitnessTimelineFingerprint({
        common,
        distance: activity.distance,
        numLaps: activity.numLaps,
        numLengths: activity.numLengths,
      }),
      LOAD: fitnessTimelineFingerprint({
        common: {
          id: common.id,
          startTime: common.startTime,
          sportType: common.sportType,
          sportDefinitionCode: common.sportDefinitionCode,
          timerTime: common.timerTime,
          elapsedTime: common.elapsedTime,
          sources: common.sources,
        },
        sessionRpe: activity.sessionRpe,
      }),
    };
    return {
      overall: fitnessTimelineFingerprint(dimensions),
      dimensions,
    };
  }
}
