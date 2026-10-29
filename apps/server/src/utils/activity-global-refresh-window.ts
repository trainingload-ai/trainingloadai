import type { SportType } from '@prisma/client';

export const ACTIVITY_GLOBAL_REFRESH_WINDOW_DAYS = 60;

export type ActivityGlobalRefreshCandidate = {
  sportType?: SportType | string | null;
  startTime?: Date | string | null;
};

function normalizeActivityStartTime(value?: Date | string | null) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

export function activityGlobalRefreshCutoff(now = new Date()) {
  return new Date(
    now.getTime() - ACTIVITY_GLOBAL_REFRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
}

export function isActivityWithinGlobalRefreshWindow(
  startTime?: Date | string | null,
  now = new Date(),
) {
  const normalized = normalizeActivityStartTime(startTime);
  return Boolean(normalized && normalized >= activityGlobalRefreshCutoff(now));
}

export function selectActivityGlobalRefreshScope(
  candidates: readonly ActivityGlobalRefreshCandidate[],
  now = new Date(),
) {
  const cutoff = activityGlobalRefreshCutoff(now);
  const eligible = candidates
    .map((candidate) => ({
      sportType: candidate.sportType,
      startTime: normalizeActivityStartTime(candidate.startTime),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        sportType: SportType | string | null | undefined;
        startTime: Date;
      } => candidate.startTime instanceof Date && candidate.startTime >= cutoff,
    )
    .sort(
      (left, right) => left.startTime.getTime() - right.startTime.getTime(),
    );

  return {
    windowDays: ACTIVITY_GLOBAL_REFRESH_WINDOW_DAYS,
    cutoff,
    eligibleCount: eligible.length,
    sportTypes: Array.from(
      new Set(
        eligible
          .map((candidate) => candidate.sportType)
          .filter((sportType): sportType is SportType => Boolean(sportType)),
      ),
    ),
    recomputeFrom: eligible[0]?.startTime,
    recomputeTo: eligible[eligible.length - 1]?.startTime,
  };
}
