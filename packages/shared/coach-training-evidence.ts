type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export type CoachTrainingBaseline = {
  kind: "training_baseline_summary";
  sportType?: string;
  range: { from: string; to: string; weeks: number };
  readiness: "none" | "sparse" | "adequate";
  averageWeek: {
    totalLoad?: number;
    activeDays?: number;
    activityCount?: number;
    totalDurationMin?: number;
    totalDistanceKm?: number;
  };
  longestSession: {
    durationMin?: number;
    distanceKm?: number;
    date?: string;
    activityName?: string;
  } | null;
  trend: { loadDelta?: number; loadDeltaPct?: number } | null;
};

export type CoachTrainingPlanContext = {
  kind: "training_plan_context_summary";
  asOf: string;
  sportType: string;
  planReference: {
    kind: "ACTIVE" | "LATEST_COMPLETED";
    title?: string;
    status?: string;
    periodWeeks?: number;
    workoutCount?: number;
    completedWorkoutCount?: number;
  } | null;
  baseline: CoachTrainingBaseline | null;
  currentLoad: { ATL?: number; CTL?: number; TSB?: number };
  missingCoreFields: string[];
};

export type CoachIntensityMetric = "pace" | "heartRate" | "power";

export type CoachIntensityStrategy = {
  kind: "workout_intensity_strategy_summary";
  sportType: string;
  workoutGoal: string;
  range: { from: string; to: string; weeks: number };
  recentActivityCount: number;
  recommendation: {
    primaryMetric: CoachIntensityMetric | null;
    expression: "zone" | "fixed" | "duration_only";
    fallbackOrder: CoachIntensityMetric[];
  };
  coverage: Array<{
    metric: CoachIntensityMetric;
    activityCount?: number;
    status?: string;
  }>;
  selectedZoneRanges: {
    metric: CoachIntensityMetric;
    benchmark?: string;
    unit?: string;
    zones: Array<{ order: number; name?: string; min?: number; max?: number }>;
  } | null;
};

export function projectCoachTrainingBaseline(
  value: unknown,
): CoachTrainingBaseline | null {
  const source = record(value);
  const range = record(source?.range);
  const averageWeek = record(source?.averageWeek);
  const readiness = source?.personalizationReadiness;
  const from = text(range?.from);
  const to = text(range?.to);
  const weeks = number(range?.weeks);
  if (
    !source ||
    !range ||
    !averageWeek ||
    !from ||
    !to ||
    weeks == null ||
    !["none", "sparse", "adequate"].includes(String(readiness))
  ) {
    return null;
  }
  const longest = record(source.longestSession);
  const trend = record(source.trend);
  return {
    kind: "training_baseline_summary",
    ...(text(source.sportType) ? { sportType: text(source.sportType) } : {}),
    range: { from, to, weeks },
    readiness: readiness as CoachTrainingBaseline["readiness"],
    averageWeek: {
      totalLoad: number(averageWeek.totalLoad),
      activeDays: number(averageWeek.activeDays),
      activityCount: number(averageWeek.activityCount),
      totalDurationMin: number(averageWeek.totalDurationMin),
      totalDistanceKm: number(averageWeek.totalDistanceKm),
    },
    longestSession: longest
      ? {
          durationMin: number(longest.durationMin),
          distanceKm: number(longest.distanceKm),
          date: text(longest.date),
          activityName: text(longest.activityName),
        }
      : null,
    trend: trend
      ? {
          loadDelta: number(trend.loadDelta),
          loadDeltaPct: number(trend.loadDeltaPct),
        }
      : null,
  };
}

export function parseCoachTrainingBaseline(value: unknown) {
  const source = record(value);
  return source?.kind === "training_baseline_summary"
    ? projectCoachTrainingBaseline({
        ...source,
        personalizationReadiness: source.readiness,
      })
    : null;
}

export function projectCoachTrainingPlanContext(
  value: unknown,
): CoachTrainingPlanContext | null {
  const source = record(value);
  const asOf = text(source?.asOf);
  const sportType = text(source?.sportType);
  const planHistory = record(source?.planHistory);
  const referenceKind = planHistory?.primaryReference;
  const reference =
    referenceKind === "ACTIVE"
      ? record(planHistory?.currentActive)
      : referenceKind === "LATEST_COMPLETED"
        ? record(planHistory?.latestCompleted)
        : null;
  const recentTraining = record(source?.recentTraining);
  const readiness = record(recentTraining?.readiness);
  const current = record(readiness?.current);
  const dataQuality = record(source?.dataQuality);
  if (!source || source.kind !== "training_plan_context" || !asOf || !sportType) {
    return null;
  }
  return {
    kind: "training_plan_context_summary",
    asOf,
    sportType,
    planReference:
      reference &&
      (referenceKind === "ACTIVE" || referenceKind === "LATEST_COMPLETED")
        ? {
            kind: referenceKind,
            title: text(reference.title),
            status: text(reference.status),
            periodWeeks: number(reference.periodWeeks),
            workoutCount: number(reference.workoutCount),
            completedWorkoutCount: number(reference.completedWorkoutCount),
          }
        : null,
    baseline: projectCoachTrainingBaseline(
      recentTraining?.completedWeekBaseline,
    ),
    currentLoad: {
      ATL: number(current?.ATL),
      CTL: number(current?.CTL),
      TSB: number(current?.TSB),
    },
    missingCoreFields: stringArray(dataQuality?.missingCoreFields),
  };
}

export function parseCoachTrainingPlanContext(value: unknown) {
  const source = record(value);
  if (source?.kind !== "training_plan_context_summary") return null;
  const baseline = source.baseline
    ? parseCoachTrainingBaseline(source.baseline)
    : null;
  const currentLoad = record(source.currentLoad);
  const planReference = record(source.planReference);
  const asOf = text(source.asOf);
  const sportType = text(source.sportType);
  if (!asOf || !sportType || !currentLoad) return null;
  return {
    kind: "training_plan_context_summary",
    asOf,
    sportType,
    planReference:
      planReference &&
      ["ACTIVE", "LATEST_COMPLETED"].includes(String(planReference.kind))
        ? {
            kind: planReference.kind as "ACTIVE" | "LATEST_COMPLETED",
            title: text(planReference.title),
            status: text(planReference.status),
            periodWeeks: number(planReference.periodWeeks),
            workoutCount: number(planReference.workoutCount),
            completedWorkoutCount: number(planReference.completedWorkoutCount),
          }
        : null,
    baseline,
    currentLoad: {
      ATL: number(currentLoad.ATL),
      CTL: number(currentLoad.CTL),
      TSB: number(currentLoad.TSB),
    },
    missingCoreFields: stringArray(source.missingCoreFields),
  } satisfies CoachTrainingPlanContext;
}

function intensityMetric(value: unknown): CoachIntensityMetric | null {
  return value === "pace" || value === "heartRate" || value === "power"
    ? value
    : null;
}

export function projectCoachIntensityStrategy(
  value: unknown,
): CoachIntensityStrategy | null {
  const source = record(value);
  const range = record(source?.range);
  const recentData = record(source?.recentData);
  const metrics = record(recentData?.metrics);
  const recommendation = record(source?.recommendation);
  const expression = recommendation?.expression;
  const from = text(range?.from);
  const to = text(range?.to);
  const weeks = number(range?.weeks);
  const recentActivityCount = number(recentData?.activityCount);
  const sportType = text(source?.sportType);
  const workoutGoal = text(source?.workoutGoal);
  if (
    source?.kind !== "workout_intensity_strategy" ||
    !from ||
    !to ||
    weeks == null ||
    recentActivityCount == null ||
    !sportType ||
    !workoutGoal ||
    !["zone", "fixed", "duration_only"].includes(String(expression))
  ) {
    return null;
  }
  const primaryMetric = intensityMetric(recommendation?.primaryMetric);
  const fallbackOrder = stringArray(recommendation?.fallbackOrder).flatMap(
    (item) => {
      const metric = intensityMetric(item);
      return metric ? [metric] : [];
    },
  );
  const selected = record(source.selectedZoneRanges);
  const selectedMetric = intensityMetric(selected?.metric);
  const selectedZones = Array.isArray(selected?.zones) ? selected.zones : [];
  const coverage = (["pace", "heartRate", "power"] as const).map((metric) => {
    const item = record(metrics?.[metric]);
    return {
      metric,
      activityCount: number(item?.activityCount),
      status: text(item?.status),
    };
  });
  return {
    kind: "workout_intensity_strategy_summary",
    sportType,
    workoutGoal,
    range: { from, to, weeks },
    recentActivityCount,
    recommendation: {
      primaryMetric,
      expression: expression as CoachIntensityStrategy["recommendation"]["expression"],
      fallbackOrder,
    },
    coverage,
    selectedZoneRanges:
      selected && selectedMetric
        ? {
            metric: selectedMetric,
            benchmark: text(selected.benchmark),
            unit: text(selected.unit),
            zones: selectedZones.flatMap((candidate) => {
              const zone = record(candidate);
              const order = number(zone?.order);
              return zone && order != null
                ? [
                    {
                      order,
                      name: text(zone.name),
                      min: number(zone.min),
                      max: number(zone.max),
                    },
                  ]
                : [];
            }),
          }
        : null,
  };
}

export function parseCoachIntensityStrategy(value: unknown) {
  const source = record(value);
  if (source?.kind !== "workout_intensity_strategy_summary") return null;
  return projectCoachIntensityStrategy({
    ...source,
    kind: "workout_intensity_strategy",
    recentData: {
      activityCount: source.recentActivityCount,
      metrics: Object.fromEntries(
        (Array.isArray(source.coverage) ? source.coverage : []).flatMap(
          (candidate) => {
            const item = record(candidate);
            const metric = intensityMetric(item?.metric);
            return metric ? [[metric, item]] : [];
          },
        ),
      ),
    },
  });
}
