import type { UserZoneSetting } from '@/utils/zones';
import { resolveLthrForCalculation } from '@shared/lthr';

type MetricState = {
  metric: string;
  effectiveCurrent?: number | null;
  effectiveSource?: string | null;
  effectiveRecordedAt?: string | null;
  autoUpdateEnabled?: boolean | null;
};

/** Describes the actual resolver benchmark, not a model guessed from zone count. */
export function describeCoachZoneBasis(
  setting: UserZoneSetting | null | undefined,
  profile: {
    ftp?: number;
    cp?: number;
    tp?: number;
    cs?: number;
    vo2max?: number;
    lthr?: number;
    maxHeartRate?: number;
    restingHeartRate?: number;
  },
  metrics: MetricState[],
) {
  const key = String(setting?.benchmark ?? '');
  const metric = {
    FTP: 'ftp',
    CP: 'cp',
    TP: 'tp',
    CS: 'cs',
    VO2MAX: 'vo2Max',
    LTHR: 'lthr',
    MHR: 'maxHr',
    HRR: 'maxHr',
  }[key] as string | undefined;
  const lthr = resolveLthrForCalculation(profile);
  const value = {
    FTP: profile.ftp,
    CP: profile.cp,
    TP: profile.tp,
    CS: profile.cs,
    VO2MAX: profile.vo2max,
    LTHR: lthr?.value,
    MHR: profile.maxHeartRate,
    HRR:
      profile.maxHeartRate && profile.restingHeartRate
        ? profile.maxHeartRate - profile.restingHeartRate
        : undefined,
  }[key] as number | undefined;
  const state = metrics.find((item) => item.metric === metric);
  const fallback = key === 'LTHR' && lthr?.source === 'ESTIMATED_MAX_HR';
  const derived = fallback || key === 'HRR';
  return {
    configurationSource: setting?.configurationSource ?? null,
    model: setting?.model ?? null,
    benchmarkMetric: key || null,
    benchmarkValue:
      typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : null,
    benchmarkUnit: ['FTP', 'CP'].includes(key)
      ? 'W'
      : ['TP', 'CS'].includes(key)
        ? 'm/s'
        : key === 'VO2MAX'
          ? 'ml/kg/min'
          : ['MHR', 'LTHR', 'HRR'].includes(key)
            ? 'bpm'
            : null,
    benchmarkSource:
      key === 'CUSTOM'
        ? 'CUSTOM_ABSOLUTE'
        : fallback
          ? 'ESTIMATED_MAX_HR'
          : key === 'HRR'
            ? 'DERIVED_HR_RESERVE'
            : (state?.effectiveSource ?? null),
    effectiveMode:
      key === 'CUSTOM'
        ? 'CUSTOM_ABSOLUTE'
        : derived
          ? 'DERIVED_FOR_CALCULATION'
          : key === 'VO2MAX'
            ? 'ESTIMATED_ONLY'
            : 'LATEST_MANUAL_OR_AUTO',
    autoUpdateEnabled:
      key === 'CUSTOM' || derived ? null : (state?.autoUpdateEnabled ?? null),
    effectiveRecordedAt: derived ? null : (state?.effectiveRecordedAt ?? null),
    ...(key === 'HRR'
      ? { restingHeartRateOffset: profile.restingHeartRate ?? null }
      : {}),
    explanation:
      setting?.configurationSource === 'saved'
        ? 'Saved boundaries may be edited. Their count or benchmark does not identify a named zone model.'
        : 'Use the explicit model and benchmark. Never infer a model from the number of zones.',
  };
}
export type CoachZoneBasis = ReturnType<typeof describeCoachZoneBasis>;
