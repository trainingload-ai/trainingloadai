export const STRENGTH_EQUIPMENT_OPTIONS = [
  "bodyweight",
  "dumbbell",
  "barbell",
  "kettlebell",
  "resistance_band",
  "machine",
  "bench",
  "pull_up_bar",
] as const;

export type StrengthEquipmentKey = (typeof STRENGTH_EQUIPMENT_OPTIONS)[number];

export type StrengthExerciseKey =
  | "backSquat"
  | "gobletSquat"
  | "squat"
  | "deadlift"
  | "romanianDeadlift"
  | "dumbbellRomanianDeadlift"
  | "lunge"
  | "splitSquat"
  | "stepUp"
  | "hipThrust"
  | "calfRaise"
  | "benchPress"
  | "overheadPress"
  | "row"
  | "dumbbellRow"
  | "pullUp"
  | "latPulldown"
  | "pushUp"
  | "plank"
  | "sidePlank"
  | "deadBug"
  | "gluteBridge";

const EQUIPMENT_ALIASES: Record<string, StrengthEquipmentKey> = {
  bodyweight: "bodyweight",
  body_weight: "bodyweight",
  bw: "bodyweight",
  dumbbell: "dumbbell",
  dumbbells: "dumbbell",
  db: "dumbbell",
  barbell: "barbell",
  barbells: "barbell",
  bb: "barbell",
  kettlebell: "kettlebell",
  kettlebells: "kettlebell",
  kb: "kettlebell",
  resistance_band: "resistance_band",
  resistance_bands: "resistance_band",
  band: "resistance_band",
  bands: "resistance_band",
  machine: "machine",
  machines: "machine",
  bench: "bench",
  pull_up_bar: "pull_up_bar",
  pullup_bar: "pull_up_bar",
};

const EXERCISE_ALIASES: Record<string, StrengthExerciseKey> = {
  back_squat: "backSquat",
  barbell_back_squat: "backSquat",
  goblet_squat: "gobletSquat",
  squat: "squat",
  bodyweight_squat: "squat",
  deadlift: "deadlift",
  conventional_deadlift: "deadlift",
  romanian_deadlift: "romanianDeadlift",
  dumbbell_romanian_deadlift: "dumbbellRomanianDeadlift",
  db_romanian_deadlift: "dumbbellRomanianDeadlift",
  lunge: "lunge",
  forward_lunge: "lunge",
  reverse_lunge: "lunge",
  split_squat: "splitSquat",
  bulgarian_split_squat: "splitSquat",
  step_up: "stepUp",
  hip_thrust: "hipThrust",
  calf_raise: "calfRaise",
  standing_calf_raise: "calfRaise",
  bench_press: "benchPress",
  barbell_bench_press: "benchPress",
  overhead_press: "overheadPress",
  shoulder_press: "overheadPress",
  row: "row",
  seated_row: "row",
  cable_row: "row",
  dumbbell_row: "dumbbellRow",
  one_arm_dumbbell_row: "dumbbellRow",
  pull_up: "pullUp",
  pullup: "pullUp",
  chin_up: "pullUp",
  lat_pulldown: "latPulldown",
  push_up: "pushUp",
  pushup: "pushUp",
  plank: "plank",
  front_plank: "plank",
  side_plank: "sidePlank",
  dead_bug: "deadBug",
  glute_bridge: "gluteBridge",
  杠铃后蹲: "backSquat",
  杠铃深蹲: "backSquat",
  槓鈴後蹲: "backSquat",
  高脚杯深蹲: "gobletSquat",
  高腳杯深蹲: "gobletSquat",
  深蹲: "squat",
  硬拉: "deadlift",
  硬举: "deadlift",
  硬舉: "deadlift",
  罗马尼亚硬拉: "romanianDeadlift",
  羅馬尼亞硬舉: "romanianDeadlift",
  哑铃罗马尼亚硬拉: "dumbbellRomanianDeadlift",
  啞鈴羅馬尼亞硬舉: "dumbbellRomanianDeadlift",
  箭步蹲: "lunge",
  弓箭步: "lunge",
  分腿蹲: "splitSquat",
  登台阶: "stepUp",
  登階: "stepUp",
  臀推: "hipThrust",
  提踵: "calfRaise",
  卧推: "benchPress",
  臥推: "benchPress",
  过顶推举: "overheadPress",
  過頭推舉: "overheadPress",
  划船: "row",
  哑铃划船: "dumbbellRow",
  啞鈴划船: "dumbbellRow",
  引体向上: "pullUp",
  引體向上: "pullUp",
  高位下拉: "latPulldown",
  俯卧撑: "pushUp",
  伏地挺身: "pushUp",
  平板支撑: "plank",
  平板支撐: "plank",
  侧平板支撑: "sidePlank",
  側平板支撐: "sidePlank",
  死虫式: "deadBug",
  死蟲式: "deadBug",
  臀桥: "gluteBridge",
  臀橋: "gluteBridge",
};

function normalizeCatalogCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

export function getStrengthEquipmentKey(
  value: string,
): StrengthEquipmentKey | null {
  return EQUIPMENT_ALIASES[normalizeCatalogCode(value)] ?? null;
}

export function getStrengthExerciseKey({
  exerciseCode,
  name,
}: {
  exerciseCode?: string;
  name: string;
}): StrengthExerciseKey | null {
  const codeKey = exerciseCode
    ? EXERCISE_ALIASES[normalizeCatalogCode(exerciseCode)]
    : undefined;
  return codeKey ?? EXERCISE_ALIASES[normalizeCatalogCode(name)] ?? null;
}
