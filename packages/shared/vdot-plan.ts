import type {
  EndurancePlanBlock,
  EnduranceWorkoutIrV1,
  EnduranceWorkoutStepTarget,
  EnduranceWorkRestBlock,
  EnduranceWorkRestStep,
} from "./endurance-workout-ir";
import type { WorkoutDefinitionInput } from "./workout-structure";
import {
  VDOT_MAX,
  VDOT_MIN,
  type VdotPaceSnapshot,
  type VdotZoneKey,
  formatRaceDuration,
  isSupportedVdot,
  predictTimeForVdot,
  resolveVdotPaces,
} from "./vdot";

export const VDOT_PLAN_SCHEMA_VERSION = 1 as const;
export const VDOT_PLAN_GENERATOR = "TRAININGLOAD_VDOT_PLAN" as const;
export const VDOT_PLAN_METHODOLOGY_VERSION = "vdot-plan-v1" as const;

export const VDOT_GOAL_DISTANCES = [
  "5K",
  "10K",
  "HALF_MARATHON",
  "MARATHON",
] as const;

export type VdotGoalDistance = (typeof VDOT_GOAL_DISTANCES)[number];
export type VdotUnitSystem = "METRIC" | "IMPERIAL";
export type VdotPlanLocale = "en" | "zh" | "zh-hant" | string;
export type VdotWorkoutIntent = VdotZoneKey | "RACE";
export type VdotPlanPhaseKey =
  | "BASE"
  | "ECONOMY"
  | "QUALITY"
  | "SPECIFIC"
  | "TAPER";

export type VdotPlanBriefV1 = {
  schemaVersion: 1;
  vdot: number;
  goalDistance: VdotGoalDistance;
  periodWeeks: number;
  startDate: string;
  unitSystem: VdotUnitSystem;
  currentWeeklyDistanceKm: number;
  currentLongestRunKm?: number;
  runsPerWeek: 3 | 4 | 5 | 6 | 7;
  longRunDayIndex: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  unavailableDayIndexes?: Array<1 | 2 | 3 | 4 | 5 | 6 | 7>;
  optionalGoalTimeSec?: number;
};

export type VdotPlanIssue = {
  code: string;
  message: string;
};

export type VdotPlanPhase = {
  key: VdotPlanPhaseKey;
  startWeek: number;
  endWeek: number;
  purpose: string;
};

export type VdotPlanWorkoutV1 = {
  weekIndex: number;
  dayIndex: number;
  sessionIndex: number;
  name: string;
  notes: string;
  sportType: "RUN";
  sportDefinitionCode: "ROAD_RUNNING";
  workoutType:
    | "EASY"
    | "LONG"
    | "THRESHOLD"
    | "INTERVAL"
    | "REPETITION"
    | "MARATHON_PACE"
    | "RACE";
  plannedDistanceKm: number;
  intent: {
    primary: VdotWorkoutIntent;
    purpose: string;
  };
  definition: WorkoutDefinitionInput;
};

export type VdotPlanWeekV1 = {
  weekIndex: number;
  phase: VdotPlanPhaseKey;
  plannedTrainingDistanceKm: number;
  plannedRaceDistanceKm: number;
  workoutCount: number;
};

export type VdotPlanDraftV1 = {
  schemaVersion: 1;
  generator: typeof VDOT_PLAN_GENERATOR;
  methodologyVersion: typeof VDOT_PLAN_METHODOLOGY_VERSION;
  generatedAt: string;
  locale: string;
  brief: VdotPlanBriefV1;
  paceSnapshot: VdotPaceSnapshot;
  title: string;
  description: string;
  goal: string;
  periodWeeks: number;
  phases: VdotPlanPhase[];
  weeks: VdotPlanWeekV1[];
  workouts: VdotPlanWorkoutV1[];
  validation: {
    status: "VALID" | "VALID_WITH_WARNINGS" | "REJECTED";
    warnings: VdotPlanIssue[];
  };
};

type GoalConfig = {
  distanceKm: number;
  minWeeks: number;
  maxWeeks: number;
  minWeeklyKm: number;
  minLongestKm: number;
  maxLongRunKm: number;
  taperWeeks: number;
  peakGrowth: number;
};

const GOAL_CONFIG: Record<VdotGoalDistance, GoalConfig> = {
  "5K": {
    distanceKm: 5,
    minWeeks: 6,
    maxWeeks: 16,
    minWeeklyKm: 12,
    minLongestKm: 5,
    maxLongRunKm: 14,
    taperWeeks: 1,
    peakGrowth: 0.24,
  },
  "10K": {
    distanceKm: 10,
    minWeeks: 8,
    maxWeeks: 16,
    minWeeklyKm: 15,
    minLongestKm: 6,
    maxLongRunKm: 18,
    taperWeeks: 1,
    peakGrowth: 0.3,
  },
  HALF_MARATHON: {
    distanceKm: 21.0975,
    minWeeks: 10,
    maxWeeks: 20,
    minWeeklyKm: 20,
    minLongestKm: 8,
    maxLongRunKm: 24,
    taperWeeks: 2,
    peakGrowth: 0.4,
  },
  MARATHON: {
    distanceKm: 42.195,
    minWeeks: 12,
    maxWeeks: 24,
    minWeeklyKm: 30,
    minLongestKm: 12,
    maxLongRunKm: 32,
    taperWeeks: 3,
    peakGrowth: 0.5,
  },
};

const QUALITY_INTENTS = new Set<VdotWorkoutIntent>([
  "M",
  "T",
  "I",
  "R",
  "RACE",
]);

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isIsoDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

function uniqueNumbers(values: number[]) {
  return [...new Set(values)];
}

function localeFamily(locale: string) {
  if (locale.toLowerCase() === "zh-hant") return "zh-hant";
  if (locale.toLowerCase().startsWith("zh")) return "zh";
  return "en";
}

function strings(locale: string) {
  const family = localeFamily(locale);
  if (family === "zh-hant") {
    return {
      goal: {
        "5K": "5 公里",
        "10K": "10 公里",
        HALF_MARATHON: "半程馬拉松",
        MARATHON: "馬拉松",
      },
      planTitle: (goal: string, weeks: number, vdot: number) =>
        `${weeks} 週 ${goal} VDOT ${vdot} 訓練計畫`,
      description:
        "依目前 VDOT、跑量與可訓練日期產生。訓練強度參考 VDOT 與 E/M/T/I/R 理念；本計畫不是 Jack Daniels 或 VDOT O2 官方訓練計畫。",
      phase: {
        BASE: "建立有氧基礎與穩定跑量",
        ECONOMY: "發展跑步經濟性與可控速度",
        QUALITY: "提高閾值與最大攝氧能力",
        SPECIFIC: "把能力轉化為目標距離專項表現",
        TAPER: "降低疲勞並為比賽保留狀態",
      },
      workout: {
        E: ["輕鬆跑", "建立有氧基礎並促進恢復"],
        LONG: ["長距離輕鬆跑", "發展耐力並練習穩定輸出"],
        T: ["乳酸閾值巡航間歇", "提高可持續速度與乳酸清除能力"],
        I: ["最大攝氧量間歇", "累積接近最大攝氧強度的有效時間"],
        R: ["短距離重複跑", "改善跑步經濟性、速度與動作放鬆"],
        M: ["馬拉松配速跑", "熟悉長時間穩定的專項節奏"],
        RACE: ["目標比賽", "在減量後完成目標距離"],
      },
    } as const;
  }
  if (family === "zh") {
    return {
      goal: {
        "5K": "5 公里",
        "10K": "10 公里",
        HALF_MARATHON: "半程马拉松",
        MARATHON: "马拉松",
      },
      planTitle: (goal: string, weeks: number, vdot: number) =>
        `${weeks} 周 ${goal} VDOT ${vdot} 训练计划`,
      description:
        "根据当前 VDOT、跑量与可训练日期生成。训练强度参考 VDOT 与 E/M/T/I/R 理念；本计划不是 Jack Daniels 或 VDOT O2 官方训练计划。",
      phase: {
        BASE: "建立有氧基础与稳定跑量",
        ECONOMY: "发展跑步经济性与可控速度",
        QUALITY: "提高阈值与最大摄氧能力",
        SPECIFIC: "把能力转化为目标距离专项表现",
        TAPER: "降低疲劳并为比赛保留状态",
      },
      workout: {
        E: ["轻松跑", "建立有氧基础并促进恢复"],
        LONG: ["长距离轻松跑", "发展耐力并练习稳定输出"],
        T: ["乳酸阈值巡航间歇", "提高可持续速度与乳酸清除能力"],
        I: ["最大摄氧量间歇", "累积接近最大摄氧强度的有效时间"],
        R: ["短距离重复跑", "改善跑步经济性、速度与动作放松"],
        M: ["马拉松配速跑", "熟悉长时间稳定的专项节奏"],
        RACE: ["目标比赛", "在减量后完成目标距离"],
      },
    } as const;
  }
  return {
    goal: {
      "5K": "5K",
      "10K": "10K",
      HALF_MARATHON: "Half Marathon",
      MARATHON: "Marathon",
    },
    planTitle: (goal: string, weeks: number, vdot: number) =>
      `${weeks}-Week ${goal} VDOT ${vdot} Training Plan`,
    description:
      "Generated from your current VDOT, training volume, and available days. Intensities reference VDOT and E/M/T/I/R concepts; this is not an official Jack Daniels or VDOT O2 training plan.",
    phase: {
      BASE: "Build aerobic durability and consistent volume",
      ECONOMY: "Develop running economy and controlled speed",
      QUALITY: "Improve threshold and aerobic power",
      SPECIFIC: "Convert fitness into goal-distance performance",
      TAPER: "Reduce fatigue while preserving race readiness",
    },
    workout: {
      E: ["Easy Run", "Build aerobic fitness and support recovery"],
      LONG: ["Long Easy Run", "Develop endurance and steady execution"],
      T: ["Threshold Cruise Intervals", "Improve sustainable speed"],
      I: ["Aerobic Power Intervals", "Accumulate time near VO₂max"],
      R: ["Repetition Session", "Improve economy, speed, and relaxed form"],
      M: ["Marathon-Pace Run", "Practice a steady race-specific rhythm"],
      RACE: ["Goal Race", "Complete the target distance after tapering"],
    },
  } as const;
}

export function validateVdotPlanBrief(brief: VdotPlanBriefV1) {
  const errors: VdotPlanIssue[] = [];
  const warnings: VdotPlanIssue[] = [];
  const config = GOAL_CONFIG[brief.goalDistance];

  if (brief.schemaVersion !== VDOT_PLAN_SCHEMA_VERSION) {
    errors.push({
      code: "SCHEMA_VERSION_UNSUPPORTED",
      message: "Unsupported plan brief schema version.",
    });
  }
  if (!isSupportedVdot(brief.vdot)) {
    errors.push({
      code: "VDOT_OUT_OF_RANGE",
      message: `VDOT must be between ${VDOT_MIN} and ${VDOT_MAX}.`,
    });
  }
  if (!config) {
    errors.push({
      code: "GOAL_UNSUPPORTED",
      message: "Unsupported goal distance.",
    });
    return { errors, warnings };
  }
  if (
    !Number.isInteger(brief.periodWeeks) ||
    brief.periodWeeks < config.minWeeks ||
    brief.periodWeeks > config.maxWeeks
  ) {
    errors.push({
      code: "PERIOD_OUT_OF_RANGE",
      message: `${brief.goalDistance} plans support ${config.minWeeks}–${config.maxWeeks} weeks.`,
    });
  }
  if (!isIsoDate(brief.startDate)) {
    errors.push({
      code: "START_DATE_INVALID",
      message: "Start date must use YYYY-MM-DD.",
    });
  }
  if (
    !Number.isFinite(brief.currentWeeklyDistanceKm) ||
    brief.currentWeeklyDistanceKm < 8 ||
    brief.currentWeeklyDistanceKm > 250
  ) {
    errors.push({
      code: "WEEKLY_DISTANCE_INVALID",
      message: "Current weekly distance must be between 8 and 250 km.",
    });
  }
  if (
    brief.currentLongestRunKm != null &&
    (!Number.isFinite(brief.currentLongestRunKm) ||
      brief.currentLongestRunKm <= 0 ||
      brief.currentLongestRunKm > 80)
  ) {
    errors.push({
      code: "LONGEST_RUN_INVALID",
      message: "Current longest run must be between 0 and 80 km.",
    });
  }
  if (
    !Number.isInteger(brief.runsPerWeek) ||
    brief.runsPerWeek < 3 ||
    brief.runsPerWeek > 7
  ) {
    errors.push({
      code: "RUN_DAYS_INVALID",
      message: "Runs per week must be between 3 and 7.",
    });
  }
  if (
    !Number.isInteger(brief.longRunDayIndex) ||
    brief.longRunDayIndex < 1 ||
    brief.longRunDayIndex > 7
  ) {
    errors.push({
      code: "LONG_RUN_DAY_INVALID",
      message: "Long-run day must be between 1 and 7.",
    });
  }

  const unavailable = uniqueNumbers(brief.unavailableDayIndexes ?? []);
  if (unavailable.some((day) => day < 1 || day > 7)) {
    errors.push({
      code: "UNAVAILABLE_DAY_INVALID",
      message: "Unavailable days must be between 1 and 7.",
    });
  }
  if (unavailable.includes(brief.longRunDayIndex)) {
    errors.push({
      code: "LONG_RUN_DAY_UNAVAILABLE",
      message: "The long-run day cannot also be unavailable.",
    });
  }
  if (7 - unavailable.length < brief.runsPerWeek) {
    errors.push({
      code: "NOT_ENOUGH_AVAILABLE_DAYS",
      message: "There are not enough available days for this schedule.",
    });
  }

  if (brief.currentWeeklyDistanceKm < config.minWeeklyKm) {
    warnings.push({
      code: "FOUNDATION_VOLUME_LOW",
      message: `Current volume is below the usual ${config.minWeeklyKm} km foundation for this goal; early weeks will stay conservative.`,
    });
  }
  if (
    brief.currentLongestRunKm != null &&
    brief.currentLongestRunKm < config.minLongestKm
  ) {
    warnings.push({
      code: "FOUNDATION_LONG_RUN_LOW",
      message: `Current longest run is below the usual ${config.minLongestKm} km foundation for this goal.`,
    });
  }
  if (
    brief.optionalGoalTimeSec != null &&
    (!Number.isFinite(brief.optionalGoalTimeSec) ||
      brief.optionalGoalTimeSec <= 0)
  ) {
    errors.push({
      code: "GOAL_TIME_INVALID",
      message: "Goal time must be positive.",
    });
  }

  const currentLongest = brief.currentLongestRunKm ?? 0;
  if (
    brief.goalDistance === "MARATHON" &&
    brief.periodWeeks < 18 &&
    (brief.currentWeeklyDistanceKm < 20 || currentLongest < 8)
  ) {
    errors.push({
      code: "MARATHON_FOUNDATION_INSUFFICIENT",
      message:
        "This marathon timeline is too short for the supplied weekly volume and longest run. Choose at least 18 weeks or build a stronger foundation first.",
    });
  }

  return { errors, warnings };
}

function buildPhases(
  weeks: number,
  goal: VdotGoalDistance,
  locale: string,
): VdotPlanPhase[] {
  const copy = strings(locale);
  const taperWeeks = GOAL_CONFIG[goal].taperWeeks;
  const buildWeeks = weeks - taperWeeks;
  const phaseLengths: Array<[VdotPlanPhaseKey, number]> = [];

  if (weeks <= 7) {
    phaseLengths.push(
      ["BASE", Math.max(2, buildWeeks - 3)],
      ["SPECIFIC", buildWeeks - Math.max(2, buildWeeks - 3)],
    );
  } else if (weeks <= 11) {
    const base = Math.max(2, Math.floor(buildWeeks * 0.34));
    const quality = Math.max(2, Math.floor(buildWeeks * 0.34));
    phaseLengths.push(
      ["BASE", base],
      ["QUALITY", quality],
      ["SPECIFIC", Math.max(1, buildWeeks - base - quality)],
    );
  } else {
    const base = Math.max(3, Math.floor(buildWeeks * 0.28));
    const economy = Math.max(2, Math.floor(buildWeeks * 0.2));
    const quality = Math.max(2, Math.floor(buildWeeks * 0.25));
    phaseLengths.push(
      ["BASE", base],
      ["ECONOMY", economy],
      ["QUALITY", quality],
      ["SPECIFIC", Math.max(1, buildWeeks - base - economy - quality)],
    );
  }
  phaseLengths.push(["TAPER", taperWeeks]);

  let startWeek = 1;
  return phaseLengths
    .filter(([, length]) => length > 0)
    .map(([key, length]) => {
      const phase = {
        key,
        startWeek,
        endWeek: startWeek + length - 1,
        purpose: copy.phase[key],
      };
      startWeek += length;
      return phase;
    });
}

function phaseForWeek(phases: VdotPlanPhase[], weekIndex: number) {
  return (
    phases.find(
      (phase) => weekIndex >= phase.startWeek && weekIndex <= phase.endWeek,
    )?.key ?? "BASE"
  );
}

function buildWeeklyVolumeCurve(
  brief: VdotPlanBriefV1,
  phases: VdotPlanPhase[],
) {
  const config = GOAL_CONFIG[brief.goalDistance];
  const start = round(brief.currentWeeklyDistanceKm, 1);
  const buildWeeks = brief.periodWeeks - config.taperWeeks;
  const possibleGrowth = Math.min(
    config.peakGrowth,
    Math.max(0.12, buildWeeks * 0.04),
  );
  const peak = round(start * (1 + possibleGrowth), 1);

  return Array.from({ length: brief.periodWeeks }, (_, zeroIndex) => {
    const weekIndex = zeroIndex + 1;
    const phase = phaseForWeek(phases, weekIndex);
    if (phase === "TAPER") {
      const taperIndex = weekIndex - buildWeeks;
      const taperFactors =
        config.taperWeeks === 1
          ? [0.48]
          : config.taperWeeks === 2
            ? [0.68, 0.42]
            : [0.76, 0.58, 0.38];
      return round(peak * (taperFactors[taperIndex - 1] ?? 0.4), 1);
    }

    const progress =
      buildWeeks <= 1 ? 1 : clamp(zeroIndex / (buildWeeks - 1), 0, 1);
    const progressive = start + (peak - start) * progress;
    const recoveryWeek = weekIndex > 2 && weekIndex % 4 === 0;
    return round(recoveryWeek ? progressive * 0.85 : progressive, 1);
  });
}

function cyclicDay(longRunDay: number, offset: number) {
  return ((((longRunDay - 1 + offset) % 7) + 7) % 7) + 1;
}

function chooseTrainingDays(brief: VdotPlanBriefV1) {
  const unavailable = new Set<number>(brief.unavailableDayIndexes ?? []);
  const preferenceOffsets = [0, -5, -3, -6, -2, -4, -1];
  const selected = preferenceOffsets
    .map((offset) => cyclicDay(brief.longRunDayIndex, offset))
    .filter((day) => !unavailable.has(day))
    .slice(0, brief.runsPerWeek);
  return selected.sort((a, b) => a - b);
}

function qualityIntents(
  goal: VdotGoalDistance,
  phase: VdotPlanPhaseKey,
  weekIndex: number,
): VdotWorkoutIntent[] {
  if (phase === "BASE") {
    if (weekIndex === 1) return [];
    return goal === "5K" || goal === "10K" ? ["R"] : ["T"];
  }
  if (phase === "ECONOMY") return ["R", "T"];
  if (phase === "QUALITY") {
    if (goal === "5K" || goal === "10K") return ["I", "T"];
    if (goal === "HALF_MARATHON") return ["T", "I"];
    return ["T", "M"];
  }
  if (phase === "SPECIFIC") {
    if (goal === "5K") return ["I", "R"];
    if (goal === "10K") return ["T", "I"];
    return ["T", "M"];
  }
  return ["R"];
}

function selectQualityDays(trainingDays: number[], longRunDay: number) {
  const candidates = trainingDays
    .filter((day) => day !== longRunDay)
    .map((day) => ({
      day,
      daysBeforeLong: (longRunDay - day + 7) % 7,
    }));
  const preferred = [5, 3, 4, 2, 6, 1];
  return preferred
    .flatMap((distance) =>
      candidates
        .filter((candidate) => candidate.daysBeforeLong === distance)
        .map((candidate) => candidate.day),
    )
    .filter((day, index, list) => list.indexOf(day) === index);
}

function stepTarget(
  intent: VdotWorkoutIntent,
  paceSnapshot: VdotPaceSnapshot,
  racePaceSecPerKm: number,
): EnduranceWorkoutStepTarget {
  const range =
    intent === "RACE"
      ? {
          fastSecPerKm: Math.max(1, Math.round(racePaceSecPerKm - 3)),
          slowSecPerKm: Math.round(racePaceSecPerKm + 3),
        }
      : paceSnapshot.zones[intent];

  return {
    kind: "SPEED",
    value: range.fastSecPerKm,
    valueHigh: range.slowSecPerKm,
    zoneLabel: intent,
    zoneSystem: "VDOT",
    zoneSource: VDOT_PLAN_GENERATOR,
    zoneBasis: {
      schemaVersion: VDOT_PLAN_SCHEMA_VERSION,
      vdot: paceSnapshot.vdot,
      methodologyVersion: VDOT_PLAN_METHODOLOGY_VERSION,
      targetLowSecPerKm: range.fastSecPerKm,
      targetHighSecPerKm: range.slowSecPerKm,
    },
    unit: "sec/km",
  };
}

function distanceStep(
  distanceKm: number,
  intent: VdotWorkoutIntent,
  paceSnapshot: VdotPaceSnapshot,
  racePaceSecPerKm: number,
  stepKind: EnduranceWorkRestStep["stepKind"],
): EnduranceWorkRestStep {
  const target = stepTarget(intent, paceSnapshot, racePaceSecPerKm);
  const averagePace =
    ((target.value ?? racePaceSecPerKm) +
      (target.valueHigh ?? target.value ?? racePaceSecPerKm)) /
    2;
  return {
    duration: Math.max(1, Math.round(distanceKm * averagePace)),
    paceKmh: round(3600 / averagePace, 3),
    stepKind,
    durationMeta: {
      kind: "DISTANCE",
      value: Math.round(distanceKm * 1000),
      unit: "METERS",
    },
    primaryTargetMeta: target,
  };
}

function workBlock(step: EnduranceWorkRestStep): EnduranceWorkRestBlock {
  return { type: "work", steps: [step] };
}

function restBlock(step: EnduranceWorkRestStep): EnduranceWorkRestBlock {
  return { type: "rest", steps: [step] };
}

function definition(blocks: EndurancePlanBlock[]): WorkoutDefinitionInput {
  const structure: EnduranceWorkoutIrV1 = {
    kind: "ENDURANCE",
    version: 1,
    blocks,
  };
  return {
    kind: "ENDURANCE",
    version: 1,
    source: "STRUCTURE",
    structure,
  };
}

function totalDefinitionDistanceKm(input: WorkoutDefinitionInput) {
  if (input.source !== "STRUCTURE" || input.structure.kind !== "ENDURANCE") {
    return 0;
  }
  const sum = (blocks: EndurancePlanBlock[]): number =>
    blocks.reduce((total, block) => {
      if (block.type === "repeat")
        return total + block.count * sum(block.children);
      return (
        total +
        block.steps.reduce((stepTotal, step) => {
          const meta = step.durationMeta;
          if (meta?.kind !== "DISTANCE" || typeof meta.value !== "number") {
            return stepTotal;
          }
          return (
            stepTotal +
            (meta.unit === "METERS" ? meta.value / 1000 : meta.value)
          );
        }, 0)
      );
    }, 0);
  return round(sum(input.structure.blocks), 1);
}

function easyDefinition(
  targetKm: number,
  pace: VdotPaceSnapshot,
  racePace: number,
) {
  return definition([
    workBlock(distanceStep(targetKm, "E", pace, racePace, "WORK")),
  ]);
}

function marathonDefinition(
  targetKm: number,
  pace: VdotPaceSnapshot,
  racePace: number,
) {
  const warmup = round(Math.max(1.5, targetKm * 0.2), 1);
  const cooldown = round(Math.max(1, targetKm * 0.15), 1);
  const main = round(Math.max(2, targetKm - warmup - cooldown), 1);
  return definition([
    workBlock(distanceStep(warmup, "E", pace, racePace, "WARMUP")),
    workBlock(distanceStep(main, "M", pace, racePace, "WORK")),
    workBlock(distanceStep(cooldown, "E", pace, racePace, "COOLDOWN")),
  ]);
}

function thresholdDefinition(
  targetKm: number,
  pace: VdotPaceSnapshot,
  racePace: number,
) {
  const warmup = round(Math.min(2, Math.max(1.2, targetKm * 0.2)), 1);
  const cooldown = round(Math.min(1.8, Math.max(1, targetKm * 0.15)), 1);
  const repetitions = targetKm >= 9 ? 3 : 2;
  const recoveryKm = 0.4;
  const workKm = round(
    Math.max(
      0.8,
      (targetKm - warmup - cooldown - repetitions * recoveryKm) / repetitions,
    ),
    1,
  );
  return definition([
    workBlock(distanceStep(warmup, "E", pace, racePace, "WARMUP")),
    {
      type: "repeat",
      count: repetitions,
      children: [
        workBlock(distanceStep(workKm, "T", pace, racePace, "WORK")),
        restBlock(distanceStep(recoveryKm, "E", pace, racePace, "RECOVERY")),
      ],
    },
    workBlock(distanceStep(cooldown, "E", pace, racePace, "COOLDOWN")),
  ]);
}

function intervalDefinition(
  targetKm: number,
  pace: VdotPaceSnapshot,
  racePace: number,
) {
  const warmup = round(Math.min(2, Math.max(1.3, targetKm * 0.2)), 1);
  const cooldown = round(Math.min(1.8, Math.max(1, targetKm * 0.15)), 1);
  const repetitions = targetKm >= 10 ? 5 : 4;
  const recoveryKm = 0.4;
  const available = targetKm - warmup - cooldown - repetitions * recoveryKm;
  const workKm = round(clamp(available / repetitions, 0.6, 1), 1);
  return definition([
    workBlock(distanceStep(warmup, "E", pace, racePace, "WARMUP")),
    {
      type: "repeat",
      count: repetitions,
      children: [
        workBlock(distanceStep(workKm, "I", pace, racePace, "WORK")),
        restBlock(distanceStep(recoveryKm, "E", pace, racePace, "RECOVERY")),
      ],
    },
    workBlock(distanceStep(cooldown, "E", pace, racePace, "COOLDOWN")),
  ]);
}

function repetitionDefinition(
  targetKm: number,
  pace: VdotPaceSnapshot,
  racePace: number,
) {
  const warmup = round(Math.min(2, Math.max(1.2, targetKm * 0.24)), 1);
  const cooldown = round(Math.min(1.5, Math.max(1, targetKm * 0.16)), 1);
  const repetitions = clamp(
    Math.floor((targetKm - warmup - cooldown) / 0.4),
    6,
    10,
  );
  return definition([
    workBlock(distanceStep(warmup, "E", pace, racePace, "WARMUP")),
    {
      type: "repeat",
      count: repetitions,
      children: [
        workBlock(distanceStep(0.2, "R", pace, racePace, "WORK")),
        restBlock(distanceStep(0.2, "E", pace, racePace, "RECOVERY")),
      ],
    },
    workBlock(distanceStep(cooldown, "E", pace, racePace, "COOLDOWN")),
  ]);
}

function raceDefinition(
  goal: VdotGoalDistance,
  pace: VdotPaceSnapshot,
  racePace: number,
) {
  const distance = GOAL_CONFIG[goal].distanceKm;
  if (goal === "MARATHON") {
    return definition([
      workBlock(distanceStep(distance, "RACE", pace, racePace, "WORK")),
    ]);
  }
  const warmup = goal === "HALF_MARATHON" ? 1 : 1.5;
  const cooldown = goal === "HALF_MARATHON" ? 0.5 : 1;
  return definition([
    workBlock(distanceStep(warmup, "E", pace, racePace, "WARMUP")),
    workBlock(distanceStep(distance, "RACE", pace, racePace, "WORK")),
    workBlock(distanceStep(cooldown, "E", pace, racePace, "COOLDOWN")),
  ]);
}

function workoutFromIntent(args: {
  intent: VdotWorkoutIntent;
  targetKm: number;
  weekIndex: number;
  dayIndex: number;
  pace: VdotPaceSnapshot;
  racePace: number;
  goal: VdotGoalDistance;
  locale: string;
  longRun: boolean;
}): VdotPlanWorkoutV1 {
  const copy = strings(args.locale);
  const definitionInput =
    args.intent === "RACE"
      ? raceDefinition(args.goal, args.pace, args.racePace)
      : args.intent === "T"
        ? thresholdDefinition(args.targetKm, args.pace, args.racePace)
        : args.intent === "I"
          ? intervalDefinition(args.targetKm, args.pace, args.racePace)
          : args.intent === "R"
            ? repetitionDefinition(args.targetKm, args.pace, args.racePace)
            : args.intent === "M"
              ? marathonDefinition(args.targetKm, args.pace, args.racePace)
              : easyDefinition(args.targetKm, args.pace, args.racePace);

  const copyKey =
    args.intent === "RACE"
      ? "RACE"
      : args.intent === "M"
        ? "M"
        : args.intent === "T"
          ? "T"
          : args.intent === "I"
            ? "I"
            : args.intent === "R"
              ? "R"
              : args.longRun
                ? "LONG"
                : "E";
  const [name, purpose] = copy.workout[copyKey];
  const workoutType =
    args.intent === "RACE"
      ? "RACE"
      : args.intent === "M"
        ? "MARATHON_PACE"
        : args.intent === "T"
          ? "THRESHOLD"
          : args.intent === "I"
            ? "INTERVAL"
            : args.intent === "R"
              ? "REPETITION"
              : args.longRun
                ? "LONG"
                : "EASY";

  return {
    weekIndex: args.weekIndex,
    dayIndex: args.dayIndex,
    sessionIndex: 1,
    name,
    notes: purpose,
    sportType: "RUN",
    sportDefinitionCode: "ROAD_RUNNING",
    workoutType,
    plannedDistanceKm: totalDefinitionDistanceKm(definitionInput),
    intent: {
      primary: args.intent,
      purpose,
    },
    definition: definitionInput,
  };
}

function buildWeekWorkouts(args: {
  brief: VdotPlanBriefV1;
  weekIndex: number;
  phase: VdotPlanPhaseKey;
  targetTrainingKm: number;
  pace: VdotPaceSnapshot;
  racePace: number;
  locale: string;
}) {
  const { brief, weekIndex, phase, targetTrainingKm } = args;
  const trainingDays = chooseTrainingDays(brief);
  const isRaceWeek = weekIndex === brief.periodWeeks;
  const qualityDays = selectQualityDays(trainingDays, brief.longRunDayIndex);
  const desiredQuality = qualityIntents(brief.goalDistance, phase, weekIndex);
  const longRunWillBeQuality =
    phase === "SPECIFIC" &&
    (brief.goalDistance === "MARATHON" ||
      brief.goalDistance === "HALF_MARATHON") &&
    weekIndex % 2 === 0;
  const maxQuality =
    targetTrainingKm < 25 || brief.runsPerWeek === 3 || longRunWillBeQuality
      ? 1
      : 2;
  const selectedQuality = desiredQuality.slice(0, maxQuality);
  const qualityByDay = new Map<number, VdotWorkoutIntent>();
  selectedQuality.forEach((intent, index) => {
    const day = qualityDays[index];
    if (day != null) qualityByDay.set(day, intent);
  });

  if (isRaceWeek) {
    qualityByDay.clear();
    const tuneUpDay = qualityDays[0];
    if (tuneUpDay != null) qualityByDay.set(tuneUpDay, "R");
  }

  const config = GOAL_CONFIG[brief.goalDistance];
  const startLong =
    brief.currentLongestRunKm ??
    Math.max(config.minLongestKm, brief.currentWeeklyDistanceKm * 0.25);
  const buildProgress =
    brief.periodWeeks <= 1 ? 1 : (weekIndex - 1) / (brief.periodWeeks - 1);
  const longRunTarget = round(
    Math.min(
      config.maxLongRunKm,
      targetTrainingKm * (brief.runsPerWeek <= 3 ? 0.34 : 0.29),
      startLong + buildProgress * (config.maxLongRunKm - startLong),
    ),
    1,
  );

  const nonLongDays = trainingDays.filter(
    (day) => day !== brief.longRunDayIndex,
  );
  const qualityTarget = round(
    clamp(
      targetTrainingKm * 0.18,
      4.5,
      brief.goalDistance === "MARATHON" ? 13 : 11,
    ),
    1,
  );
  const qualityDistance = [...qualityByDay.values()].reduce(
    (sum) => sum + qualityTarget,
    0,
  );
  const easyDayCount = Math.max(1, nonLongDays.length - qualityByDay.size);
  const remaining = Math.max(
    easyDayCount * 3,
    targetTrainingKm - longRunTarget - qualityDistance,
  );
  const easyTarget = round(remaining / easyDayCount, 1);

  return trainingDays.map((dayIndex) => {
    if (dayIndex === brief.longRunDayIndex) {
      if (isRaceWeek) {
        return workoutFromIntent({
          ...args,
          intent: "RACE",
          targetKm: config.distanceKm,
          dayIndex,
          goal: brief.goalDistance,
          longRun: false,
        });
      }
      const specificLong =
        phase === "SPECIFIC" &&
        (brief.goalDistance === "MARATHON" ||
          brief.goalDistance === "HALF_MARATHON") &&
        weekIndex % 2 === 0;
      return workoutFromIntent({
        ...args,
        intent: specificLong ? "M" : "E",
        targetKm: longRunTarget,
        dayIndex,
        goal: brief.goalDistance,
        longRun: true,
      });
    }

    const intent = qualityByDay.get(dayIndex) ?? "E";
    return workoutFromIntent({
      ...args,
      intent,
      targetKm: intent === "E" ? easyTarget : qualityTarget,
      dayIndex,
      goal: brief.goalDistance,
      longRun: false,
    });
  });
}

export function validateVdotPlanDraft(value: unknown): {
  valid: boolean;
  errors: VdotPlanIssue[];
  warnings: VdotPlanIssue[];
} {
  const errors: VdotPlanIssue[] = [];
  const warnings: VdotPlanIssue[] = [];
  if (!value || typeof value !== "object") {
    return {
      valid: false,
      errors: [{ code: "DRAFT_INVALID", message: "Draft must be an object." }],
      warnings,
    };
  }
  const draft = value as Partial<VdotPlanDraftV1>;
  if (
    draft.schemaVersion !== VDOT_PLAN_SCHEMA_VERSION ||
    draft.generator !== VDOT_PLAN_GENERATOR ||
    draft.methodologyVersion !== VDOT_PLAN_METHODOLOGY_VERSION
  ) {
    errors.push({
      code: "DRAFT_VERSION_UNSUPPORTED",
      message: "Unsupported VDOT plan draft version.",
    });
  }
  if (
    !Number.isInteger(draft.periodWeeks) ||
    (draft.periodWeeks ?? 0) < 1 ||
    (draft.periodWeeks ?? 0) > 24
  ) {
    errors.push({
      code: "DRAFT_PERIOD_INVALID",
      message: "Draft period must be between 1 and 24 weeks.",
    });
  }
  if (!draft.brief || !isSupportedVdot(draft.brief.vdot)) {
    errors.push({
      code: "DRAFT_VDOT_INVALID",
      message: "Draft VDOT is invalid.",
    });
  }
  if (!Array.isArray(draft.workouts) || draft.workouts.length === 0) {
    errors.push({
      code: "DRAFT_WORKOUTS_EMPTY",
      message: "Draft must contain workouts.",
    });
    return { valid: false, errors, warnings };
  }
  if (draft.workouts.length > 168) {
    errors.push({
      code: "DRAFT_WORKOUTS_TOO_MANY",
      message: "Draft contains too many workouts.",
    });
  }

  const occupied = new Set<string>();
  const byWeek = new Map<number, VdotPlanWorkoutV1[]>();
  for (const workout of draft.workouts) {
    if (!workout || typeof workout !== "object") {
      errors.push({
        code: "WORKOUT_INVALID",
        message: "A workout entry is invalid.",
      });
      continue;
    }
    if (
      !Number.isInteger(workout.weekIndex) ||
      workout.weekIndex < 1 ||
      workout.weekIndex > (draft.periodWeeks ?? 0) ||
      !Number.isInteger(workout.dayIndex) ||
      workout.dayIndex < 1 ||
      workout.dayIndex > 7
    ) {
      errors.push({
        code: "WORKOUT_POSITION_INVALID",
        message: "A workout is outside the plan period.",
      });
      continue;
    }
    const key = `${workout.weekIndex}:${workout.dayIndex}:${workout.sessionIndex}`;
    if (occupied.has(key)) {
      errors.push({
        code: "WORKOUT_POSITION_DUPLICATE",
        message: `Duplicate workout position ${key}.`,
      });
    }
    occupied.add(key);
    const week = byWeek.get(workout.weekIndex) ?? [];
    week.push(workout);
    byWeek.set(workout.weekIndex, week);

    if (
      workout.definition?.kind !== "ENDURANCE" ||
      workout.definition.version !== 1 ||
      workout.definition.source !== "STRUCTURE" ||
      workout.definition.structure?.kind !== "ENDURANCE"
    ) {
      errors.push({
        code: "WORKOUT_DEFINITION_INVALID",
        message: `Workout ${key} is not a structured endurance workout.`,
      });
    }
    if (
      !Number.isFinite(workout.plannedDistanceKm) ||
      workout.plannedDistanceKm <= 0
    ) {
      errors.push({
        code: "WORKOUT_DISTANCE_INVALID",
        message: `Workout ${key} has no positive distance.`,
      });
    }
  }

  for (const [weekIndex, workouts] of byWeek) {
    const quality = workouts
      .filter((workout) => QUALITY_INTENTS.has(workout.intent.primary))
      .sort((a, b) => a.dayIndex - b.dayIndex);
    if (quality.length > 2) {
      errors.push({
        code: "QUALITY_DAYS_EXCEEDED",
        message: `Week ${weekIndex} contains more than two quality days.`,
      });
    }
    for (let index = 1; index < quality.length; index += 1) {
      if (quality[index].dayIndex - quality[index - 1].dayIndex < 2) {
        errors.push({
          code: "QUALITY_DAYS_ADJACENT",
          message: `Week ${weekIndex} contains adjacent quality days.`,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function generateVdotPlan(
  briefInput: VdotPlanBriefV1,
  options?: { locale?: VdotPlanLocale; generatedAt?: string },
): VdotPlanDraftV1 {
  const locale = options?.locale ?? "en";
  const brief: VdotPlanBriefV1 = {
    ...briefInput,
    vdot: round(briefInput.vdot, 1),
    currentWeeklyDistanceKm: round(briefInput.currentWeeklyDistanceKm, 1),
    currentLongestRunKm:
      briefInput.currentLongestRunKm == null
        ? undefined
        : round(briefInput.currentLongestRunKm, 1),
    unavailableDayIndexes: uniqueNumbers(
      briefInput.unavailableDayIndexes ?? [],
    ) as VdotPlanBriefV1["unavailableDayIndexes"],
  };
  const briefValidation = validateVdotPlanBrief(brief);
  if (briefValidation.errors.length > 0) {
    throw new VdotPlanGenerationError(briefValidation.errors);
  }

  const copy = strings(locale);
  const config = GOAL_CONFIG[brief.goalDistance];
  const paceSnapshot = resolveVdotPaces(brief.vdot);
  const predictedRaceTime =
    predictTimeForVdot(config.distanceKm * 1000, brief.vdot) ??
    config.distanceKm * paceSnapshot.zones.T.slowSecPerKm;
  const racePaceSecPerKm = predictedRaceTime / config.distanceKm;
  const phases = buildPhases(brief.periodWeeks, brief.goalDistance, locale);
  const volumeCurve = buildWeeklyVolumeCurve(brief, phases);
  const workouts = volumeCurve.flatMap((targetTrainingKm, zeroIndex) =>
    buildWeekWorkouts({
      brief,
      weekIndex: zeroIndex + 1,
      phase: phaseForWeek(phases, zeroIndex + 1),
      targetTrainingKm,
      pace: paceSnapshot,
      racePace: racePaceSecPerKm,
      locale,
    }),
  );
  const weeks = Array.from({ length: brief.periodWeeks }, (_, zeroIndex) => {
    const weekIndex = zeroIndex + 1;
    const weekWorkouts = workouts.filter(
      (workout) => workout.weekIndex === weekIndex,
    );
    const raceDistance = weekWorkouts
      .filter((workout) => workout.intent.primary === "RACE")
      .reduce(
        (sum, workout) => sum + GOAL_CONFIG[brief.goalDistance].distanceKm,
        0,
      );
    return {
      weekIndex,
      phase: phaseForWeek(phases, weekIndex),
      plannedTrainingDistanceKm: round(
        weekWorkouts.reduce(
          (sum, workout) =>
            sum +
            workout.plannedDistanceKm -
            (workout.intent.primary === "RACE"
              ? GOAL_CONFIG[brief.goalDistance].distanceKm
              : 0),
          0,
        ),
        1,
      ),
      plannedRaceDistanceKm: round(raceDistance, 1),
      workoutCount: weekWorkouts.length,
    };
  });

  const goalLabel = copy.goal[brief.goalDistance];
  const predicted = formatRaceDuration(predictedRaceTime);
  const draft: VdotPlanDraftV1 = {
    schemaVersion: VDOT_PLAN_SCHEMA_VERSION,
    generator: VDOT_PLAN_GENERATOR,
    methodologyVersion: VDOT_PLAN_METHODOLOGY_VERSION,
    generatedAt: options?.generatedAt ?? new Date().toISOString(),
    locale,
    brief,
    paceSnapshot,
    title: copy.planTitle(goalLabel, brief.periodWeeks, brief.vdot),
    description: copy.description,
    goal: `${goalLabel} · VDOT ${brief.vdot} · ${predicted}`,
    periodWeeks: brief.periodWeeks,
    phases,
    weeks,
    workouts,
    validation: {
      status:
        briefValidation.warnings.length > 0 ? "VALID_WITH_WARNINGS" : "VALID",
      warnings: briefValidation.warnings,
    },
  };
  const draftValidation = validateVdotPlanDraft(draft);
  if (!draftValidation.valid) {
    throw new VdotPlanGenerationError(draftValidation.errors);
  }
  return draft;
}

export class VdotPlanGenerationError extends Error {
  readonly issues: VdotPlanIssue[];

  constructor(issues: VdotPlanIssue[]) {
    super(issues[0]?.message ?? "Could not generate VDOT plan.");
    this.name = "VdotPlanGenerationError";
    this.issues = issues;
  }
}

export function toCreatePlanDto(draft: VdotPlanDraftV1) {
  const validation = validateVdotPlanDraft(draft);
  if (!validation.valid) throw new VdotPlanGenerationError(validation.errors);
  return {
    title: draft.title,
    description: draft.description,
    goal: draft.goal,
    sourceType: "GENERATED" as const,
    generationMetadata: {
      generator: draft.generator,
      schemaVersion: draft.schemaVersion,
      methodologyVersion: draft.methodologyVersion,
      generatedAt: draft.generatedAt,
      vdot: draft.paceSnapshot.vdot,
      paceSnapshot: draft.paceSnapshot,
    },
    periodWeeks: draft.periodWeeks,
    workouts: draft.workouts.map((workout) => ({
      weekIndex: workout.weekIndex,
      dayIndex: workout.dayIndex,
      sessionIndex: workout.sessionIndex,
      name: workout.name,
      notes: workout.notes,
      sportType: workout.sportType,
      sportDefinitionCode: workout.sportDefinitionCode,
      definition: workout.definition,
    })),
  };
}
