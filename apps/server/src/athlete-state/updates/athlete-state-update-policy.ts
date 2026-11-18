import { ATHLETE_STATE_POLICY } from '../athlete-state-policy';

export const STATE_UPDATE_HEALTH_METRICS = new Set([
  'SLEEP_ASLEEP_SECONDS',
  'SLEEP_SCORE',
  'HRV_RMSSD_MS',
  'HRV_SDNN_MS',
  'VO2_MAX',
]);

export function withinStateEvidenceWindow(
  date: Date,
  timezone = 'UTC',
  now = new Date(),
) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  const today = Date.parse(
    `${part('year')}-${part('month')}-${part('day')}T00:00:00Z`,
  );
  const age = (today - date.getTime()) / 86_400_000;
  return age >= 0 && age < ATHLETE_STATE_POLICY.physiologyDays;
}

type DailyFact = {
  value: unknown;
  unit: string | null;
  selectedProvider: string | null;
  timezone?: string | null;
} | null;
export function stateHealthFactChanged(before: DailyFact, after: DailyFact) {
  const fingerprint = (fact: DailyFact) =>
    fact
      ? JSON.stringify([Number(fact.value), fact.unit, fact.selectedProvider])
      : null;
  return fingerprint(before) !== fingerprint(after);
}
