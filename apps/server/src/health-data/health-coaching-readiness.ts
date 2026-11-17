/** Readiness describes a use, not a universal final flag for the source object. */
export type CoachingHealthObservation = {
  key: string;
  date: string;
  provider: string;
  metric: string;
  value: number;
  unit: string | null;
  range?: { start: string; end: string } | null;
  sourceStatus?: string | null;
};

export function coachingHealthReadiness(
  observation: CoachingHealthObservation,
  now: Date,
) {
  const sleep = observation.metric.startsWith('SLEEP_');
  const cumulative = [
    'STEP_COUNT',
    'ACTIVE_ENERGY_KCAL',
    'ACTIVE_DURATION_SECONDS',
    'HYDRATION_ML',
  ].includes(observation.metric);
  const ongoing = Boolean(
    observation.range && Date.parse(observation.range.end) > now.getTime(),
  );
  return {
    ...observation,
    readiness: {
      reportedValue: ongoing ? ('IN_PROGRESS' as const) : ('ELIGIBLE' as const),
      completePeriod: sleep
        ? ('UNVERIFIED' as const)
        : cumulative
          ? ('PARTIAL_DAY' as const)
          : ('NOT_ASSERTED' as const),
      reason: ongoing
        ? 'OBSERVATION_WINDOW_OPEN'
        : sleep
          ? 'REPORTED_SLEEP_CAN_BE_REVISED'
          : cumulative
            ? 'REPORTED_SO_FAR'
            : 'REPORTED_MEASUREMENT',
      // Neither silence, a validation label nor a queue deadline proves finality.
      permitsCompleteNightClaim: false,
      permitsMissingDataAsZero: false,
    },
  };
}
