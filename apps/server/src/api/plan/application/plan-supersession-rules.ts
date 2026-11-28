import {
  parseScheduleConstraints,
  transitionScheduleMetadata,
  type ScheduleQualityContractTransition,
} from '@shared/plan-calendar';
import {
  parsePlanQualityContract,
  type PlanQualityContract,
} from '@shared/plan-quality';
import type { PlanSupersessionPreviewRequest } from '@shared/plan-proposal';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function inheritVersion(
  value: unknown,
  overrides: PlanQualityContract | undefined,
  startDate: string,
) {
  const version = record(value);
  const scheduleConstraints = parseScheduleConstraints(
    version.scheduleConstraints ?? undefined,
  );
  const previousQuality = parsePlanQualityContract(
    version.qualityContract ?? undefined,
  );
  const qualityContract =
    previousQuality || overrides
      ? {
          ...previousQuality,
          ...overrides,
          ...(overrides?.maxMinutesByIsoWeekday
            ? {
                maxMinutesByIsoWeekday: {
                  ...previousQuality?.maxMinutesByIsoWeekday,
                  ...overrides.maxMinutesByIsoWeekday,
                },
              }
            : {}),
          startDate,
        }
      : undefined;
  const transition = version.qualityContractTransition as
    | ScheduleQualityContractTransition
    | null
    | undefined;
  const qualityContractTransition = transition
    ? {
        ...transition,
        ...(overrides?.maxDailyMinutes === undefined
          ? {}
          : { maxDailyMinutes: overrides.maxDailyMinutes }),
        ...(overrides?.maxTrainingDaysPerWeek === undefined
          ? {}
          : { maxTrainingDaysPerWeek: overrides.maxTrainingDaysPerWeek }),
        ...(transition.mode === 'REPLACE_ALLOWED_DAYS' && overrides?.allowedDays
          ? { allowedDays: overrides.allowedDays }
          : {}),
      }
    : transition;

  return {
    ...(scheduleConstraints ? { scheduleConstraints } : {}),
    ...(qualityContract ? { qualityContract } : {}),
    ...(qualityContractTransition === undefined
      ? {}
      : { qualityContractTransition }),
  };
}

export function inheritReplacementRules(
  sourceMetadata: unknown,
  proposal: Pick<
    PlanSupersessionPreviewRequest,
    'effectiveFrom' | 'scheduleConstraints' | 'qualityContract'
  >,
) {
  const source = record(sourceMetadata);
  const history = Array.isArray(source.scheduleConstraintHistory)
    ? source.scheduleConstraintHistory.map((version) =>
        inheritVersion(
          version,
          proposal.qualityContract,
          proposal.effectiveFrom,
        ),
      )
    : [];
  const inherited = {
    ...inheritVersion(source, proposal.qualityContract, proposal.effectiveFrom),
    ...(history.length ? { scheduleConstraintHistory: history } : {}),
  };
  if (!proposal.scheduleConstraints) return inherited;
  return transitionScheduleMetadata(inherited, proposal.scheduleConstraints, {
    mode: 'INHERIT',
  });
}
