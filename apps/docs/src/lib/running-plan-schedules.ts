import type { RunningPlanSlug } from "@/lib/running-plan-pages";
import type { WorkoutStructure } from "@shared/workout-structure";
import {
  getPlanTemplateCoachFlow,
  getPlanTemplateVariant,
  getRunPlanTemplate,
  normalizePlanTemplateLocale,
  type PlanTemplateCoachFlow,
} from "@shared/plan-templates";

type PlanPhase =
  | "start"
  | "base"
  | "build"
  | "recover"
  | "peak"
  | "taper"
  | "race";

type Workout =
  | { kind: "rest" }
  | { kind: "walk"; minutes: number }
  | { kind: "strength"; minutes: number }
  | { kind: "cross"; minutes: number }
  | { kind: "easy"; minutes: number }
  | { kind: "easy-distance"; distanceKm: number }
  | { kind: "long"; distanceKm: number }
  | { kind: "steady"; minutes: number }
  | { kind: "progression"; minutes: number }
  | { kind: "strides"; easyMinutes: number; repeats: number; seconds: number }
  | {
      kind: "run-walk";
      repeats: number;
      runMinutes: number;
      walkMinutes: number;
    }
  | {
      kind: "tempo";
      warmupMinutes: number;
      tempoMinutes: number;
      cooldownMinutes: number;
    }
  | {
      kind: "intervals";
      warmupMinutes: number;
      repeats: number;
      distanceM: number;
      recoveryM: number;
      cooldownMinutes: number;
    }
  | {
      kind: "hills";
      warmupMinutes: number;
      repeats: number;
      seconds: number;
      cooldownMinutes: number;
    }
  | { kind: "goal-pace"; distanceKm: number; goalPaceKm: number }
  | { kind: "continuous"; minutes: number }
  | { kind: "race"; distanceKm: number };

type TrainingWeek = {
  phase: PlanPhase;
  days: readonly [
    Workout,
    Workout,
    Workout,
    Workout,
    Workout,
    Workout,
    Workout,
  ];
};

type ScheduleDefinition = {
  weeks: readonly TrainingWeek[];
  sources: readonly { name: string; url: string }[];
};

export type LocalizedTrainingWeek = {
  week: number;
  phase: string;
  days: readonly string[];
  dayKinds: readonly RunningPlanDayKind[];
  structures: readonly (WorkoutStructure | null)[];
};

export type RunningPlanDayKind =
  | "REST"
  | "EASY"
  | "QUALITY"
  | "LONG"
  | "RACE"
  | "OTHER";

export type LocalizedRunningPlanSchedule = {
  title: string;
  description: string;
  tableCaption: string;
  weekLabel: string;
  weekdays: readonly string[];
  weeks: readonly LocalizedTrainingWeek[];
  coachFlow?: PlanTemplateCoachFlow;
  weekDetailsLabel: string;
  effortTitle: string;
  effortItems: readonly [string, string][];
  adjustmentTitle: string;
  adjustmentItems: readonly string[];
  evidenceTitle: string;
  authorLabel: string;
  author: string;
  updatedLabel: string;
  updatedAt: string;
  sourceLabel: string;
  sources: ScheduleDefinition["sources"];
  disclaimer: string;
};

const rest = (): Workout => ({ kind: "rest" });
const walk = (minutes: number): Workout => ({ kind: "walk", minutes });
const strength = (minutes: number): Workout => ({ kind: "strength", minutes });
const easy = (minutes: number): Workout => ({ kind: "easy", minutes });
const easyDistance = (distanceKm: number): Workout => ({
  kind: "easy-distance",
  distanceKm,
});

function runningPlanDayKind(workout: Workout): RunningPlanDayKind {
  if (workout.kind === "rest") return "REST";
  if (workout.kind === "race") return "RACE";
  if (workout.kind === "long") return "LONG";
  if (
    workout.kind === "tempo" ||
    workout.kind === "intervals" ||
    workout.kind === "hills" ||
    workout.kind === "goal-pace" ||
    workout.kind === "steady" ||
    workout.kind === "progression" ||
    workout.kind === "strides"
  ) {
    return "QUALITY";
  }
  if (
    workout.kind === "easy" ||
    workout.kind === "easy-distance" ||
    workout.kind === "run-walk" ||
    workout.kind === "continuous" ||
    workout.kind === "walk"
  ) {
    return "EASY";
  }
  return "OTHER";
}
const long = (distanceKm: number): Workout => ({ kind: "long", distanceKm });
const steady = (minutes: number): Workout => ({ kind: "steady", minutes });
const progression = (minutes: number): Workout => ({
  kind: "progression",
  minutes,
});
const continuous = (minutes: number): Workout => ({
  kind: "continuous",
  minutes,
});
const strides = (
  easyMinutes: number,
  repeats: number,
  seconds = 20,
): Workout => ({
  kind: "strides",
  easyMinutes,
  repeats,
  seconds,
});
const runWalk = (
  repeats: number,
  runMinutes: number,
  walkMinutes: number,
): Workout => ({
  kind: "run-walk",
  repeats,
  runMinutes,
  walkMinutes,
});
const tempo = (
  tempoMinutes: number,
  warmupMinutes = 10,
  cooldownMinutes = 10,
): Workout => ({
  kind: "tempo",
  warmupMinutes,
  tempoMinutes,
  cooldownMinutes,
});
const intervals = (
  repeats: number,
  distanceM: number,
  recoveryM: number,
  warmupMinutes = 12,
  cooldownMinutes = 10,
): Workout => ({
  kind: "intervals",
  warmupMinutes,
  repeats,
  distanceM,
  recoveryM,
  cooldownMinutes,
});
const hills = (
  repeats: number,
  seconds: number,
  warmupMinutes = 12,
  cooldownMinutes = 10,
): Workout => ({
  kind: "hills",
  warmupMinutes,
  repeats,
  seconds,
  cooldownMinutes,
});
const goalPace = (distanceKm: number, goalPaceKm: number): Workout => ({
  kind: "goal-pace",
  distanceKm,
  goalPaceKm,
});
const race = (distanceKm: number): Workout => ({ kind: "race", distanceKm });

const sharedSources = [
  {
    name: "WHO guidelines on physical activity and sedentary behaviour (2020)",
    url: "https://www.who.int/publications/i/item/9789240015128",
  },
  {
    name: "CDC physical activity guidelines for adults",
    url: "https://www.cdc.gov/physical-activity-basics/guidelines/adults.html",
  },
] as const;

const couchTo5kSources = [
  {
    name: "NHS Couch to 5K running plan",
    url: "https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/",
  },
  {
    name: "NHS Get running with Couch to 5K",
    url: "https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/",
  },
  ...sharedSources,
] as const;

const tenKFinishSources = [
  {
    name: "V.O2 training definitions (Jack Daniels)",
    url: "https://vdoto2.com/learn-more/training-definitions",
  },
  {
    name: "Hal Higdon Novice 10K training principles",
    url: "https://www.halhigdon.com/training-programs/10k-training/novice-10k/",
  },
  {
    name: "B.A.A. 10K Level One training guidance",
    url: "https://www.baa.org/races/boston-10k/info-for-athletes/b-a-a-10k-training/",
  },
  {
    name: "Esteve-Lanao et al. endurance training intensity study",
    url: "https://pubmed.ncbi.nlm.nih.gov/17685689/",
  },
  {
    name: "ACSM relative exercise intensity guidance",
    url: "https://www.acsm.org/docs/default-source/files-for-resource-library/exercise-intensity-infographic.pdf",
  },
] as const;

const schedules: Record<
  Exclude<
    RunningPlanSlug,
    "5k-training-plan-intermediate" | "10k-training-plan"
  >,
  ScheduleDefinition
> = {
  "couch-to-5k-training-plan": {
    sources: [
      {
        name: "NHS Couch to 5K running plan",
        url: "https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/",
      },
      ...sharedSources,
    ],
    weeks: [
      {
        phase: "start",
        days: [
          rest(),
          runWalk(8, 1, 1.5),
          walk(25),
          runWalk(8, 1, 1.5),
          rest(),
          runWalk(8, 1, 1.5),
          walk(30),
        ],
      },
      {
        phase: "start",
        days: [
          rest(),
          runWalk(6, 1.5, 2),
          strength(15),
          runWalk(6, 1.5, 2),
          rest(),
          runWalk(6, 1.5, 2),
          walk(30),
        ],
      },
      {
        phase: "base",
        days: [
          rest(),
          runWalk(6, 2, 2),
          walk(30),
          runWalk(6, 2, 2),
          rest(),
          runWalk(6, 2, 2),
          strength(15),
        ],
      },
      {
        phase: "base",
        days: [
          rest(),
          runWalk(5, 3, 2),
          strength(15),
          runWalk(5, 3, 2),
          rest(),
          runWalk(5, 3, 2),
          walk(35),
        ],
      },
      {
        phase: "build",
        days: [
          rest(),
          runWalk(4, 5, 2.5),
          walk(30),
          runWalk(4, 5, 2.5),
          rest(),
          continuous(20),
          strength(15),
        ],
      },
      {
        phase: "build",
        days: [
          rest(),
          runWalk(3, 8, 3),
          strength(15),
          runWalk(2, 10, 3),
          rest(),
          continuous(25),
          walk(35),
        ],
      },
      {
        phase: "build",
        days: [
          rest(),
          continuous(25),
          walk(30),
          continuous(25),
          rest(),
          continuous(28),
          strength(15),
        ],
      },
      {
        phase: "peak",
        days: [
          rest(),
          continuous(28),
          strength(15),
          continuous(28),
          rest(),
          continuous(30),
          walk(35),
        ],
      },
      {
        phase: "race",
        days: [
          rest(),
          continuous(25),
          walk(25),
          continuous(20),
          rest(),
          easy(15),
          race(5),
        ],
      },
    ],
  },
  "5k-training-plan": {
    sources: sharedSources,
    weeks: [
      {
        phase: "base",
        days: [
          rest(),
          easy(25),
          strength(20),
          strides(25, 4),
          rest(),
          easy(20),
          long(5),
        ],
      },
      {
        phase: "base",
        days: [
          rest(),
          easy(30),
          strength(20),
          hills(6, 30),
          rest(),
          easy(25),
          long(6),
        ],
      },
      {
        phase: "build",
        days: [
          rest(),
          easy(30),
          strength(20),
          intervals(6, 400, 200),
          rest(),
          easy(25),
          long(7),
        ],
      },
      {
        phase: "recover",
        days: [
          rest(),
          easy(25),
          strength(15),
          tempo(12),
          rest(),
          easy(20),
          long(5),
        ],
      },
      {
        phase: "build",
        days: [
          rest(),
          easy(35),
          strength(20),
          intervals(5, 600, 300),
          rest(),
          easy(25),
          long(7),
        ],
      },
      {
        phase: "peak",
        days: [
          rest(),
          easy(30),
          strength(15),
          tempo(20),
          rest(),
          strides(20, 6),
          long(8),
        ],
      },
      {
        phase: "taper",
        days: [
          rest(),
          easy(30),
          strength(15),
          intervals(4, 400, 200),
          rest(),
          easy(20),
          long(6),
        ],
      },
      {
        phase: "race",
        days: [
          rest(),
          easy(25),
          rest(),
          strides(20, 4),
          rest(),
          easy(15),
          race(5),
        ],
      },
    ],
  },
  "half-marathon-training-plan": {
    sources: sharedSources,
    weeks: [
      {
        phase: "base",
        days: [
          rest(),
          easy(35),
          strength(20),
          steady(30),
          rest(),
          easy(25),
          long(8),
        ],
      },
      {
        phase: "base",
        days: [
          rest(),
          easy(40),
          strength(20),
          strides(35, 4),
          rest(),
          easy(30),
          long(10),
        ],
      },
      {
        phase: "build",
        days: [
          rest(),
          easy(40),
          strength(20),
          tempo(18),
          rest(),
          easy(30),
          long(12),
        ],
      },
      {
        phase: "recover",
        days: [
          rest(),
          easy(35),
          strength(15),
          progression(35),
          rest(),
          easy(25),
          long(9),
        ],
      },
      {
        phase: "build",
        days: [
          rest(),
          easy(45),
          strength(20),
          intervals(5, 800, 400),
          rest(),
          easy(30),
          long(13),
        ],
      },
      {
        phase: "build",
        days: [
          rest(),
          easy(45),
          strength(20),
          tempo(25),
          rest(),
          easy(35),
          long(15),
        ],
      },
      {
        phase: "recover",
        days: [
          rest(),
          easy(40),
          strength(15),
          steady(35),
          rest(),
          easy(30),
          long(12),
        ],
      },
      {
        phase: "build",
        days: [
          rest(),
          easy(50),
          strength(20),
          intervals(4, 1200, 400),
          rest(),
          easy(35),
          long(16),
        ],
      },
      {
        phase: "peak",
        days: [
          rest(),
          easy(50),
          strength(15),
          goalPace(9, 5),
          rest(),
          easy(35),
          long(18),
        ],
      },
      {
        phase: "peak",
        days: [
          rest(),
          easy(45),
          strength(15),
          tempo(30),
          rest(),
          strides(30, 6),
          long(16),
        ],
      },
      {
        phase: "taper",
        days: [
          rest(),
          easy(40),
          strength(10),
          goalPace(7, 3),
          rest(),
          easy(25),
          long(10),
        ],
      },
      {
        phase: "race",
        days: [
          rest(),
          easy(30),
          rest(),
          strides(20, 4),
          rest(),
          easy(15),
          race(21.1),
        ],
      },
    ],
  },
  "marathon-training-plan": {
    sources: sharedSources,
    weeks: [
      {
        phase: "base",
        days: [
          rest(),
          easyDistance(6),
          strength(20),
          steady(35),
          rest(),
          easyDistance(5),
          long(12),
        ],
      },
      {
        phase: "base",
        days: [
          rest(),
          easyDistance(7),
          strength(20),
          strides(35, 4),
          rest(),
          easyDistance(5),
          long(14),
        ],
      },
      {
        phase: "base",
        days: [
          rest(),
          easyDistance(8),
          strength(20),
          tempo(20),
          rest(),
          easyDistance(6),
          long(16),
        ],
      },
      {
        phase: "recover",
        days: [
          rest(),
          easyDistance(6),
          strength(15),
          progression(35),
          rest(),
          easyDistance(5),
          long(12),
        ],
      },
      {
        phase: "build",
        days: [
          rest(),
          easyDistance(8),
          strength(20),
          intervals(5, 800, 400),
          rest(),
          easyDistance(6),
          long(18),
        ],
      },
      {
        phase: "build",
        days: [
          rest(),
          easyDistance(9),
          strength(20),
          tempo(25),
          rest(),
          easyDistance(6),
          long(20),
        ],
      },
      {
        phase: "build",
        days: [
          rest(),
          easyDistance(9),
          strength(15),
          goalPace(10, 5),
          rest(),
          easyDistance(7),
          long(22),
        ],
      },
      {
        phase: "recover",
        days: [
          rest(),
          easyDistance(7),
          strength(15),
          steady(40),
          rest(),
          easyDistance(6),
          long(16),
        ],
      },
      {
        phase: "build",
        days: [
          rest(),
          easyDistance(10),
          strength(20),
          intervals(4, 1200, 400),
          rest(),
          easyDistance(7),
          long(24),
        ],
      },
      {
        phase: "build",
        days: [
          rest(),
          easyDistance(10),
          strength(15),
          tempo(30),
          rest(),
          easyDistance(8),
          long(26),
        ],
      },
      {
        phase: "peak",
        days: [
          rest(),
          easyDistance(10),
          strength(15),
          goalPace(14, 8),
          rest(),
          easyDistance(8),
          long(28),
        ],
      },
      {
        phase: "recover",
        days: [
          rest(),
          easyDistance(8),
          strength(10),
          steady(45),
          rest(),
          easyDistance(6),
          long(20),
        ],
      },
      {
        phase: "peak",
        days: [
          rest(),
          easyDistance(10),
          strength(15),
          goalPace(16, 10),
          rest(),
          easyDistance(8),
          long(30),
        ],
      },
      {
        phase: "taper",
        days: [
          rest(),
          easyDistance(8),
          strength(10),
          tempo(20),
          rest(),
          easyDistance(6),
          long(22),
        ],
      },
      {
        phase: "taper",
        days: [
          rest(),
          easyDistance(7),
          rest(),
          goalPace(8, 4),
          rest(),
          easyDistance(5),
          long(14),
        ],
      },
      {
        phase: "race",
        days: [
          rest(),
          easyDistance(5),
          rest(),
          strides(20, 4),
          rest(),
          easy(15),
          race(42.2),
        ],
      },
    ],
  },
};

type ScheduleLocale =
  | "de"
  | "en"
  | "es"
  | "fr"
  | "it"
  | "ja"
  | "ko"
  | "pt-BR"
  | "zh"
  | "zh-hant";

type LocaleCopy = {
  weekdays: readonly string[];
  week: string;
  minutes: string;
  easy: string;
  easyDistance: string;
  rest: string;
  walk: string;
  strength: string;
  cross: string;
  long: string;
  steady: string;
  progression: string;
  continuous: string;
  strides: string;
  run: string;
  recoveryWalk: string;
  tempo: string;
  intervals: string;
  jog: string;
  hills: string;
  jogDown: string;
  warmup: string;
  cooldown: string;
  goalPace: string;
  race: string;
  phase: Record<PlanPhase, string>;
  scheduleTitle: string;
  scheduleDescription: string;
  weekDetailsLabel: string;
  effortTitle: string;
  easyEffort: string;
  easyEffortText: string;
  qualityEffort: string;
  qualityEffortText: string;
  adjustmentTitle: string;
  adjustmentItems: readonly string[];
  evidenceTitle: string;
  authorLabel: string;
  author: string;
  updatedLabel: string;
  sourceLabel: string;
  disclaimer: string;
};

const en: LocaleCopy = {
  weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  week: "Week",
  minutes: "min",
  easy: "easy",
  easyDistance: "easy",
  rest: "Rest",
  walk: "walk",
  strength: "strength",
  cross: "cross-train",
  long: "long easy run",
  steady: "steady",
  progression: "progression run",
  continuous: "continuous easy run",
  strides: "relaxed strides",
  run: "run",
  recoveryWalk: "walk",
  tempo: "tempo",
  intervals: "fast",
  jog: "jog",
  hills: "hill",
  jogDown: "easy jog down",
  warmup: "warm-up",
  cooldown: "cool-down",
  goalPace: "at goal pace",
  race: "race / completion run",
  phase: {
    start: "Start",
    base: "Base",
    build: "Build",
    recover: "Recovery",
    peak: "Peak",
    taper: "Taper",
    race: "Race week",
  },
  scheduleTitle: "Complete weekly training schedule",
  scheduleDescription:
    "Use this free schedule as a general reference. Keep easy days conversational, preserve recovery days, and personalize the calendar before treating it as your own plan.",
  weekDetailsLabel: "Workout execution notes",
  effortTitle: "How hard should each workout feel?",
  easyEffort: "Easy and long runs",
  easyEffortText:
    "Conversational effort, usually RPE 2-4 out of 10. Slow down for heat, hills, fatigue, or soreness.",
  qualityEffort: "Tempo, intervals, and goal pace",
  qualityEffortText:
    "Controlled quality, not an all-out test. Finish with repeatable form and stop the session if pain changes your stride.",
  adjustmentTitle: "How to adjust the schedule",
  adjustmentItems: [
    "Do not stack missed runs into the next day.",
    "Repeat or reduce a week when fatigue or soreness does not settle.",
    "Stop and seek qualified medical advice for pain, chest pain, dizziness, illness, or unusual symptoms.",
  ],
  evidenceTitle: "Method, sources, and safety",
  authorLabel: "Prepared by",
  author: "Trainingload.ai editorial team",
  updatedLabel: "Last updated",
  sourceLabel: "Reference sources",
  disclaimer:
    "This schedule is general training information, not medical advice or an individualized coaching prescription. A qualified coach or clinician should review material changes when health, injury, pregnancy, medication, or chronic conditions are relevant.",
};

const localeCopy: Record<ScheduleLocale, LocaleCopy> = {
  en,
  zh: {
    ...en,
    weekdays: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
    week: "第",
    minutes: "分钟",
    easy: "轻松跑",
    easyDistance: "轻松跑",
    rest: "休息",
    walk: "步行",
    strength: "力量训练",
    cross: "交叉训练",
    long: "长距离轻松跑",
    steady: "稳定跑",
    progression: "渐进跑",
    continuous: "连续轻松跑",
    strides: "放松加速跑",
    run: "跑",
    recoveryWalk: "走",
    tempo: "节奏跑",
    intervals: "快速跑",
    jog: "慢跑恢复",
    hills: "上坡跑",
    jogDown: "慢跑下坡恢复",
    warmup: "热身",
    cooldown: "放松",
    goalPace: "目标配速",
    race: "比赛 / 完赛跑",
    phase: {
      start: "起步",
      base: "基础",
      build: "构建",
      recover: "恢复",
      peak: "峰值",
      taper: "减量",
      race: "比赛周",
    },
    scheduleTitle: "完整每周训练安排",
    scheduleDescription:
      "这是一份免费通用参考。轻松日保持能对话的强度，保留恢复日，并在把它当作个人计划前根据自己的基础和日历进行调整。",
    weekDetailsLabel: "本周训练执行说明",
    effortTitle: "每种训练应该有多难？",
    easyEffort: "轻松跑与长距离",
    easyEffortText:
      "保持能完整对话的强度，通常为 RPE 2-4/10。炎热、坡度、疲劳或酸痛时主动降速。",
    qualityEffort: "节奏跑、间歇与目标配速",
    qualityEffortText:
      "质量可控，不是全力测试。动作应能重复；如果疼痛改变跑姿，应停止训练。",
    adjustmentTitle: "训练安排如何调整",
    adjustmentItems: [
      "不要把错过的跑步叠加到第二天。",
      "疲劳或酸痛没有缓解时，重复本周或减少训练量。",
      "疼痛、胸痛、眩晕、疾病或异常症状时停止训练并寻求合格医疗建议。",
    ],
    evidenceTitle: "方法、来源与安全边界",
    authorLabel: "编写",
    author: "Trainingload.ai 编辑团队",
    updatedLabel: "最后更新",
    sourceLabel: "参考来源",
    disclaimer:
      "本计划属于通用训练信息，不是医疗建议或个人教练处方。涉及健康、伤病、孕期、药物或慢性疾病时，应由合格教练或临床专业人士审阅重大调整。",
  },
  "zh-hant": {
    ...en,
    weekdays: ["週一", "週二", "週三", "週四", "週五", "週六", "週日"],
    week: "第",
    minutes: "分鐘",
    easy: "輕鬆跑",
    easyDistance: "輕鬆跑",
    rest: "休息",
    walk: "步行",
    strength: "力量訓練",
    cross: "交叉訓練",
    long: "長距離輕鬆跑",
    steady: "穩定跑",
    progression: "漸進跑",
    continuous: "連續輕鬆跑",
    strides: "放鬆加速跑",
    run: "跑",
    recoveryWalk: "走",
    tempo: "節奏跑",
    intervals: "快速跑",
    jog: "慢跑恢復",
    hills: "上坡跑",
    jogDown: "慢跑下坡恢復",
    warmup: "熱身",
    cooldown: "放鬆",
    goalPace: "目標配速",
    race: "比賽 / 完賽跑",
    phase: {
      start: "起步",
      base: "基礎",
      build: "構建",
      recover: "恢復",
      peak: "峰值",
      taper: "減量",
      race: "比賽週",
    },
    scheduleTitle: "完整每週訓練安排",
    scheduleDescription:
      "這是一份免費通用參考。輕鬆日保持能對話的強度，保留恢復日，並在把它當作個人計畫前依自己的基礎與日曆調整。",
    weekDetailsLabel: "本週訓練執行說明",
    effortTitle: "每種訓練應該有多難？",
    easyEffort: "輕鬆跑與長距離",
    easyEffortText:
      "保持能完整對話的強度，通常為 RPE 2-4/10。炎熱、坡度、疲勞或痠痛時主動降速。",
    qualityEffort: "節奏跑、間歇與目標配速",
    qualityEffortText:
      "品質可控，不是全力測試。動作應能重複；如果疼痛改變跑姿，應停止訓練。",
    adjustmentTitle: "訓練安排如何調整",
    adjustmentItems: [
      "不要把錯過的跑步疊加到第二天。",
      "疲勞或痠痛沒有緩解時，重複本週或減少訓練量。",
      "疼痛、胸痛、暈眩、疾病或異常症狀時停止訓練並尋求合格醫療建議。",
    ],
    evidenceTitle: "方法、來源與安全邊界",
    authorLabel: "編寫",
    author: "Trainingload.ai 編輯團隊",
    updatedLabel: "最後更新",
    sourceLabel: "參考來源",
    disclaimer:
      "本計畫屬於通用訓練資訊，不是醫療建議或個人教練處方。涉及健康、傷病、孕期、藥物或慢性疾病時，應由合格教練或臨床專業人士審閱重大調整。",
  },
  ja: {
    ...en,
    weekdays: ["月", "火", "水", "木", "金", "土", "日"],
    week: "週",
    minutes: "分",
    easy: "イージーラン",
    easyDistance: "イージーラン",
    rest: "休養",
    walk: "ウォーク",
    strength: "筋力トレーニング",
    cross: "クロストレーニング",
    long: "ロングイージーラン",
    steady: "ステディラン",
    progression: "プログレッションラン",
    continuous: "連続イージーラン",
    strides: "リラックスした流し",
    run: "ラン",
    recoveryWalk: "ウォーク",
    tempo: "テンポ",
    intervals: "速め",
    jog: "ジョグ",
    hills: "坂道",
    jogDown: "ゆっくり下る",
    warmup: "ウォームアップ",
    cooldown: "クールダウン",
    goalPace: "目標ペース",
    race: "レース / 完走ラン",
    phase: {
      start: "開始",
      base: "基礎",
      build: "強化",
      recover: "回復",
      peak: "ピーク",
      taper: "テーパー",
      race: "レース週",
    },
    scheduleTitle: "週ごとの完全トレーニングスケジュール",
    scheduleDescription:
      "これは無料の一般的な参考スケジュールです。イージー日は会話できる強度を守り、回復日を残し、自分のプランとして使う前に現在の走力と予定に合わせて調整してください。",
    weekDetailsLabel: "今週の実施メモ",
    effortTitle: "各ワークアウトの強度",
    easyEffort: "イージーランとロングラン",
    easyEffortText:
      "会話できる強度、通常は RPE 2-4/10。暑さ、坂、疲労、痛みがある日はペースを落とします。",
    qualityEffort: "テンポ、インターバル、目標ペース",
    qualityEffortText:
      "全力テストではなく、制御できる質を保ちます。痛みでフォームが変わる場合は中止してください。",
    adjustmentTitle: "スケジュールの調整方法",
    adjustmentItems: [
      "休んだランを翌日に重ねないでください。",
      "疲労や痛みが収まらない場合は、その週を繰り返すか負荷を下げます。",
      "痛み、胸痛、めまい、病気、異常な症状がある場合は中止し、資格のある医療専門家に相談してください。",
    ],
    evidenceTitle: "方法、出典、安全上の境界",
    authorLabel: "作成",
    author: "Trainingload.ai 編集チーム",
    updatedLabel: "最終更新",
    sourceLabel: "参考資料",
    disclaimer:
      "このスケジュールは一般的なトレーニング情報であり、医療助言や個別のコーチング処方ではありません。健康、けが、妊娠、薬、慢性疾患が関係する場合は、資格のあるコーチまたは臨床専門家に重要な変更を確認してもらってください。",
  },
  de: { ...en, weekdays: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] },
  es: { ...en, weekdays: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] },
  fr: { ...en, weekdays: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] },
  it: { ...en, weekdays: ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] },
  ko: { ...en, weekdays: ["월", "화", "수", "목", "금", "토", "일"] },
  "pt-BR": {
    ...en,
    weekdays: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
  },
};

function resolveLocale(lang: string): ScheduleLocale {
  return lang in localeCopy ? (lang as ScheduleLocale) : "en";
}

function number(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatWorkout(workout: Workout, copy: LocaleCopy) {
  const min = copy.minutes;
  switch (workout.kind) {
    case "rest":
      return copy.rest;
    case "walk":
      return `${workout.minutes} ${min} ${copy.walk}`;
    case "strength":
      return `${workout.minutes} ${min} ${copy.strength}`;
    case "cross":
      return `${workout.minutes} ${min} ${copy.cross}`;
    case "easy":
      return `${workout.minutes} ${min} ${copy.easy}`;
    case "easy-distance":
      return `${number(workout.distanceKm)} km ${copy.easyDistance}`;
    case "long":
      return `${number(workout.distanceKm)} km ${copy.long}`;
    case "steady":
      return `${workout.minutes} ${min} ${copy.steady}`;
    case "progression":
      return `${workout.minutes} ${min} ${copy.progression}`;
    case "continuous":
      return `${workout.minutes} ${min} ${copy.continuous}`;
    case "strides":
      return `${workout.easyMinutes} ${min} ${copy.easy} + ${workout.repeats} × ${workout.seconds}s ${copy.strides}`;
    case "run-walk":
      return `5 ${min} ${copy.warmup} · ${workout.repeats} × (${number(workout.runMinutes)} ${min} ${copy.run} / ${number(workout.walkMinutes)} ${min} ${copy.recoveryWalk}) · 5 ${min} ${copy.cooldown}`;
    case "tempo":
      return `${workout.warmupMinutes} ${min} ${copy.warmup} + ${workout.tempoMinutes} ${min} ${copy.tempo} + ${workout.cooldownMinutes} ${min} ${copy.cooldown}`;
    case "intervals":
      return `${workout.warmupMinutes} ${min} ${copy.warmup} + ${workout.repeats} × ${workout.distanceM} m ${copy.intervals} / ${workout.recoveryM} m ${copy.jog} + ${workout.cooldownMinutes} ${min} ${copy.cooldown}`;
    case "hills":
      return `${workout.warmupMinutes} ${min} ${copy.warmup} + ${workout.repeats} × ${workout.seconds}s ${copy.hills} / ${copy.jogDown} + ${workout.cooldownMinutes} ${min} ${copy.cooldown}`;
    case "goal-pace":
      return `${number(workout.distanceKm)} km · ${number(workout.goalPaceKm)} km ${copy.goalPace}`;
    case "race":
      return `${number(workout.distanceKm)} km ${copy.race}`;
  }
}

export function getRunningPlanSchedule(
  slug: RunningPlanSlug,
  lang: string,
): LocalizedRunningPlanSchedule {
  const templateSlug =
    slug === "couch-to-5k-training-plan"
      ? "first-5k"
      : slug === "5k-training-plan"
        ? "finish-5k"
        : slug === "5k-training-plan-intermediate"
          ? "improve-5k"
          : slug === "10k-training-plan"
            ? "finish-10k"
            : slug === "half-marathon-training-plan"
              ? "finish-half-marathon"
              : slug === "marathon-training-plan"
                ? "finish-marathon"
                : null;
  const copy = localeCopy[resolveLocale(lang)];
  if (templateSlug) {
    const template = getRunPlanTemplate(templateSlug);
    const variant = template ? getPlanTemplateVariant(template) : null;
    if (!template || !variant)
      throw new Error(`Missing shared plan template: ${templateSlug}`);
    const templateLocale = normalizePlanTemplateLocale(lang);
    const trainingDayIndexes =
      variant.trainingDaysPerWeek === 3
        ? [0, 2, 5]
        : variant.trainingDaysPerWeek === 4
          ? [0, 2, 4, 6]
          : [0, 1, 3, 5, 6];
    const phases: Record<string, PlanPhase> = {
      START: "start",
      BASE: "base",
      BUILD: "build",
      RECOVERY: "recover",
      PEAK: "peak",
      RACE: "race",
    };
    const weeks = variant.weeks.map((week) => {
      const days = Array.from({ length: 7 }, () => copy.rest);
      const dayKinds = Array.from(
        { length: 7 },
        (): RunningPlanDayKind => "REST",
      );
      const structures = Array.from(
        { length: 7 },
        (): WorkoutStructure | null => null,
      );
      variant.workouts
        .filter((workout) => workout.weekIndex === week.weekIndex)
        .sort((a, b) => a.slotIndex - b.slotIndex)
        .forEach((workout, index) => {
          const localized = workout.copy[templateLocale];
          days[trainingDayIndexes[index]] =
            `${localized.name} · RPE ${workout.plannedRpeRange.min}–${workout.plannedRpeRange.max} — ${localized.notes}`;
          dayKinds[trainingDayIndexes[index]] =
            workout.intensityKind === "RACE"
              ? "RACE"
              : workout.intensityKind === "LONG"
                ? "LONG"
                : workout.intensityKind === "STEADY" ||
                    workout.intensityKind === "INTERVAL" ||
                    workout.intensityKind === "TEMPO"
                  ? "QUALITY"
                  : "EASY";
          structures[trainingDayIndexes[index]] =
            workout.definition.source === "STRUCTURE"
              ? workout.definition.structure
              : null;
        });
      return {
        week: week.weekIndex,
        phase:
          templateSlug === "finish-5k" && week.weekIndex === 7
            ? copy.phase.taper
            : copy.phase[phases[week.phase]],
        days,
        dayKinds,
        structures,
      };
    });
    return {
      title: copy.scheduleTitle,
      description: template.copy[templateLocale].description,
      tableCaption: copy.scheduleTitle,
      weekLabel: copy.week,
      weekdays: copy.weekdays,
      weeks,
      coachFlow: getPlanTemplateCoachFlow(templateLocale),
      weekDetailsLabel: copy.weekDetailsLabel,
      effortTitle: copy.effortTitle,
      effortItems: [
        [copy.easyEffort, copy.easyEffortText],
        [copy.qualityEffort, copy.qualityEffortText],
      ],
      adjustmentTitle: copy.adjustmentTitle,
      adjustmentItems: copy.adjustmentItems,
      evidenceTitle: copy.evidenceTitle,
      authorLabel: copy.authorLabel,
      author: copy.author,
      updatedLabel: copy.updatedLabel,
      updatedAt:
        template.goal === "10K" || template.key === "RUN_5K_FIRST"
          ? "2026-08-24"
          : template.goal === "HALF_MARATHON" || template.goal === "MARATHON"
            ? "2026-08-25"
            : "2026-08-20",
      sourceLabel: copy.sourceLabel,
      sources:
        template.goal === "10K" && template.key === "RUN_10K_FINISH"
          ? tenKFinishSources
          : template.key === "RUN_5K_FIRST"
            ? couchTo5kSources
            : sharedSources,
      disclaimer: copy.disclaimer,
    };
  }
  const definition =
    schedules[
      slug as Exclude<
        RunningPlanSlug,
        "5k-training-plan-intermediate" | "10k-training-plan"
      >
    ];
  const weeks = definition.weeks.map((week, index) => ({
    week: index + 1,
    phase: copy.phase[week.phase],
    days: week.days.map((workout) => formatWorkout(workout, copy)),
    dayKinds: week.days.map(runningPlanDayKind),
    structures: week.days.map(() => null),
  }));

  return {
    title: copy.scheduleTitle,
    description: copy.scheduleDescription,
    tableCaption: copy.scheduleTitle,
    weekLabel: copy.week,
    weekdays: copy.weekdays,
    weeks,
    weekDetailsLabel: copy.weekDetailsLabel,
    effortTitle: copy.effortTitle,
    effortItems: [
      [copy.easyEffort, copy.easyEffortText],
      [copy.qualityEffort, copy.qualityEffortText],
    ],
    adjustmentTitle: copy.adjustmentTitle,
    adjustmentItems: copy.adjustmentItems,
    evidenceTitle: copy.evidenceTitle,
    authorLabel: copy.authorLabel,
    author: copy.author,
    updatedLabel: copy.updatedLabel,
    updatedAt: "2026-07-18",
    sourceLabel: copy.sourceLabel,
    sources: definition.sources,
    disclaimer: copy.disclaimer,
  };
}
