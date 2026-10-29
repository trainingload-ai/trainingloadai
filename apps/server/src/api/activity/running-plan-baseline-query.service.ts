import { Injectable } from '@nestjs/common';
import { ScaleType, SportType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { readyActivityWhere } from '@/utils/activity-ready-where';

export type RunningPlanBaseline = {
  personalizationReadiness: 'none' | 'sparse' | 'adequate';
  activityCount: number;
  validWeeks: number;
  activeDaysPerWeek: number;
  medianRunsPerWeek: number;
  medianDistanceMetersPerWeek: number;
  medianDurationMinutesPerWeek: number;
  latestWeekDurationMinutes: number;
  latestWeekDistanceMeters: number;
  longestRunDistanceMeters: number | null;
  longestContinuousRunMinutes: number | null;
  recent5kSeconds: number | null;
  recentRaceEffort: {
    activityId: string;
    distanceMeters: number;
    durationSeconds: number;
    recordedAt: string;
  } | null;
};

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mondayKey(date: Date) {
  const copy = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const weekday = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - weekday + 1);
  return copy.toISOString().slice(0, 10);
}

@Injectable()
export class RunningPlanBaselineQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string, now = new Date()): Promise<RunningPlanBaseline> {
    const from = new Date(now.getTime() - 180 * 86_400_000);
    const [activities, historicalDistance] = await Promise.all([
      this.prisma.activity.findMany({
        where: readyActivityWhere({
          userId,
          sportType: SportType.RUN,
          startTime: { gte: from, lte: now },
        }),
        select: {
          id: true,
          startTime: true,
          timerTime: true,
          elapsedTime: true,
          distance: true,
          activityPerformanceTTs: {
            where: {
              targetScaleType: ScaleType.DISTANCE,
              targetScaleValue: { in: [5_000, 10_000, 21_097, 42_195] },
            },
            select: {
              id: true,
              targetScaleValue: true,
              resultTimeSec: true,
            },
          },
        },
        orderBy: { startTime: 'desc' },
        take: 80,
      }),
      this.prisma.activity.aggregate({
        where: readyActivityWhere({
          userId,
          sportType: SportType.RUN,
          startTime: { lte: now },
          distance: { gt: 0 },
        }),
        _max: { distance: true },
      }),
    ]);

    const recentActivities = activities.filter(
      (activity) =>
        activity.startTime != null &&
        activity.startTime.getTime() >= now.getTime() - 8 * 7 * 86_400_000,
    );
    const activeDates = new Set(
      recentActivities
        .map((activity) => activity.startTime?.toISOString().slice(0, 10))
        .filter((value): value is string => Boolean(value)),
    );
    const durationSeconds = recentActivities.map((activity) =>
      Math.max(0, Number(activity.timerTime ?? activity.elapsedTime ?? 0)),
    );
    const weekBuckets = new Map<
      string,
      { runs: number; distance: number; seconds: number }
    >();
    for (const activity of recentActivities) {
      if (!activity.startTime) continue;
      const key = mondayKey(activity.startTime);
      const bucket = weekBuckets.get(key) ?? {
        runs: 0,
        distance: 0,
        seconds: 0,
      };
      bucket.runs += 1;
      bucket.distance += Math.max(0, Number(activity.distance ?? 0));
      bucket.seconds += Math.max(
        0,
        Number(activity.timerTime ?? activity.elapsedTime ?? 0),
      );
      weekBuckets.set(key, bucket);
    }
    const buckets = [...weekBuckets.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    );
    const recent5kSeconds =
      activities
        .filter((activity) => {
          const distance = Number(activity.distance ?? 0);
          return distance >= 4_800 && distance <= 5_500;
        })
        .map((activity) =>
          Math.max(0, Number(activity.timerTime ?? activity.elapsedTime ?? 0)),
        )
        .filter((seconds) => seconds > 0)
        .at(0) ?? null;
    const recentRaceEffort = activities
      .flatMap((activity) =>
        activity.activityPerformanceTTs
          .filter((result) => Number(result.resultTimeSec ?? 0) > 0)
          .map((result) => ({
            id: result.id,
            distanceMeters: result.targetScaleValue,
            durationSeconds: Number(result.resultTimeSec),
            recordedAt: activity.startTime,
          })),
      )
      .find((result) => result.recordedAt != null);
    const latestBucket = buckets.at(-1)?.[1];

    return {
      personalizationReadiness:
        recentActivities.length === 0
          ? 'none'
          : weekBuckets.size <= 1
            ? 'sparse'
            : 'adequate',
      activityCount: recentActivities.length,
      validWeeks: weekBuckets.size,
      activeDaysPerWeek: Math.round((activeDates.size / 8) * 10) / 10,
      medianRunsPerWeek:
        Math.round(median(buckets.map(([, value]) => value.runs)) * 10) / 10,
      medianDistanceMetersPerWeek: Math.round(
        median(buckets.map(([, value]) => value.distance)),
      ),
      medianDurationMinutesPerWeek:
        Math.round(
          (median(buckets.map(([, value]) => value.seconds)) / 60) * 10,
        ) / 10,
      latestWeekDurationMinutes:
        Math.round(((latestBucket?.seconds ?? 0) / 60) * 10) / 10,
      latestWeekDistanceMeters: Math.round(latestBucket?.distance ?? 0),
      longestRunDistanceMeters:
        historicalDistance._max.distance != null
          ? Math.round(Number(historicalDistance._max.distance))
          : null,
      longestContinuousRunMinutes:
        durationSeconds.length > 0
          ? Math.round((Math.max(...durationSeconds) / 60) * 10) / 10
          : null,
      recent5kSeconds,
      recentRaceEffort: recentRaceEffort?.recordedAt
        ? {
            activityId: recentRaceEffort.id,
            distanceMeters: recentRaceEffort.distanceMeters,
            durationSeconds: recentRaceEffort.durationSeconds,
            recordedAt: recentRaceEffort.recordedAt.toISOString(),
          }
        : null,
    };
  }
}
