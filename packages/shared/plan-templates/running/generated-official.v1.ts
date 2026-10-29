import type {
  EndurancePlanBlock,
  EnduranceWorkRestBlock,
  EnduranceWorkRestStep,
  EnduranceWorkoutIrV1,
} from "../../endurance-workout-ir";
import type { WorkoutDefinitionInput } from "../../workout-structure";
import type {
  LocalizedTemplateText,
  LocalizedWorkoutText,
  PlanTemplateDefinition,
  PlanTemplateLocale,
  PlanTemplatePhase,
  PlanTemplateWorkout,
  RunningIntensitySlot,
} from "../registry";
import { GENERATED_OFFICIAL_RUNNING_TEMPLATES } from "./generated-official.v1.data";

type GeneratedSession = {
  id: string;
  name: string;
  notes: string;
  text: string;
};
type GeneratedSlot = {
  id: string;
  family?: string;
  name?: string;
  purpose?: string;
  notes?: string;
  basis?: string;
  paceRangeBasis?: string;
  rpe?: string;
  rpeCue?: string;
  talkTest?: string;
  talkTestCue?: string;
  resolverRule?: string;
  fallbackCue?: string;
  paceRangePolicy?: {
    basis?: string;
    rpeCrossCheckMin?: number;
    rpeCrossCheckMax?: number;
    talkTestCrossCheck?: string;
  } | null;
};
type GeneratedTemplate = {
  key: PlanTemplateDefinition["key"];
  slug: PlanTemplateDefinition["slug"];
  goal: PlanTemplateDefinition["goal"];
  outcome: NonNullable<PlanTemplateDefinition["outcome"]>;
  normalRunsPerWeek: number;
  candidateSha256: string;
  expectedContentHash: string;
  promptContract: string;
  version: PlanTemplateDefinition["version"];
  copyVersion: string;
  methodologyVersion: string;
  resolverVersion: string;
  scheduleVersion: string;
  plan: {
    title: string;
    description: string;
    periodWeeks: number;
    sessionTemplates: readonly GeneratedSession[];
    workouts: readonly {
      weekIndex: number;
      dayIndex: number;
      templateId: string;
    }[];
  };
  intensitySlots: readonly GeneratedSlot[];
  intensityAssignments: readonly {
    templateId: string;
    intensitySlotId: string;
  }[];
  executionPractices: readonly {
    weekIndex: number;
    dayIndex: number;
    practiceType: string;
    instructions?: string;
    instruction?: string;
  }[];
  anchorRequirements: readonly string[];
};

const LOCALES: readonly PlanTemplateLocale[] = ["en", "zh", "zh-hant", "ja"];

function stableHash(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function duration(
  value: string,
): Pick<EnduranceWorkRestStep, "duration" | "durationMeta"> {
  const match = value.match(/^(\d+(?:\.\d+)?)(s|m|h|km)$/);
  if (!match) throw new Error(`Unsupported frozen DSL duration: ${value}`);
  const amount = Number(match[1]);
  if (match[2] === "km") {
    return {
      duration: 0,
      durationMeta: { kind: "DISTANCE", value: amount, unit: "KILOMETERS" },
    };
  }
  const seconds =
    match[2] === "h" ? amount * 3600 : match[2] === "m" ? amount * 60 : amount;
  return {
    duration: seconds,
    durationMeta: { kind: "TIME", value: seconds, unit: "SECONDS" },
  };
}

function parseStep(line: string): EnduranceWorkRestBlock {
  const match = line.trim().match(/^(warmup|work|recovery|cooldown)\s+(\S+)$/);
  if (!match) throw new Error(`Unsupported frozen DSL step: ${line}`);
  const stepKind = {
    warmup: "WARMUP",
    work: "WORK",
    recovery: "RECOVERY",
    cooldown: "COOLDOWN",
  }[match[1]] as EnduranceWorkRestStep["stepKind"];
  return {
    type: match[1] === "recovery" ? "rest" : "work",
    steps: [{ ...duration(match[2]), stepKind }],
  };
}

function parseFrozenDsl(text: string): WorkoutDefinitionInput {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const blocks: EndurancePlanBlock[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const repeat = lines[index].match(/^repeat\s+(\d+)\s+\{$/);
    if (!repeat) {
      blocks.push(parseStep(lines[index]));
      continue;
    }
    const children: EnduranceWorkRestBlock[] = [];
    index += 1;
    while (index < lines.length && lines[index] !== "}") {
      children.push(parseStep(lines[index]));
      index += 1;
    }
    if (lines[index] !== "}")
      throw new Error(`Unclosed repeat in frozen DSL: ${text}`);
    blocks.push({ type: "repeat", count: Number(repeat[1]), children });
  }
  const structure: EnduranceWorkoutIrV1 = {
    kind: "ENDURANCE",
    version: 1,
    blocks,
  };
  return { kind: "ENDURANCE", version: 1, source: "STRUCTURE", structure };
}

function normalizedSlot(slot: GeneratedSlot): RunningIntensitySlot {
  const policy = slot.paceRangePolicy ?? null;
  const rpeText = slot.rpe ?? slot.rpeCue;
  const parsedRpe = rpeText?.match(/(\d+)\D+(\d+)/);
  const singleRpe = rpeText?.match(/(?:RPE\s*)?(\d+)/i);
  const fallback =
    slot.fallbackCue ??
    slot.notes ??
    slot.resolverRule ??
    "Use RPE and the talk test.";
  return {
    id: slot.id,
    family: slot.family ?? slot.name ?? slot.id,
    purpose: slot.purpose ?? slot.notes ?? slot.name ?? slot.id,
    basis:
      policy?.basis ?? slot.paceRangeBasis ?? slot.basis ?? "QUALITATIVE_ONLY",
    fallbackCue: fallback,
    rpeRange: {
      min:
        policy?.rpeCrossCheckMin ??
        Number(parsedRpe?.[1] ?? singleRpe?.[1] ?? 3),
      max:
        policy?.rpeCrossCheckMax ??
        Number(parsedRpe?.[2] ?? singleRpe?.[1] ?? 4),
    },
    talkTest:
      policy?.talkTestCrossCheck ??
      slot.talkTestCue ??
      slot.talkTest ??
      fallback,
  };
}

function workoutKind(args: {
  session: GeneratedSession;
  slot?: RunningIntensitySlot;
  final: boolean;
}): PlanTemplateWorkout["intensityKind"] {
  if (args.final || /race|final/i.test(args.session.id)) return "RACE";
  const value =
    `${args.slot?.id ?? ""} ${args.slot?.family ?? ""} ${args.session.name}`.toLowerCase();
  if (/long/.test(value)) return "LONG";
  if (/interval|hill|vo2/.test(value)) return "INTERVAL";
  if (/threshold|tempo/.test(value)) return "TEMPO";
  if (/steady|goal|marathon|progress/.test(value)) return "STEADY";
  return "EASY";
}

function phaseFor(week: number, weeks: number): PlanTemplatePhase {
  if (week === weeks) return "RACE";
  if (week >= weeks - 2) return "RECOVERY";
  if (week >= weeks - 4) return "PEAK";
  if (week <= Math.max(2, Math.floor(weeks * 0.3))) return "BASE";
  return "BUILD";
}

function practiceCue(type: string, locale: PlanTemplateLocale): string {
  const cues: Record<PlanTemplateLocale, Record<string, string>> = {
    en: {
      PRE_RUN_MEAL:
        "Rehearse your planned pre-run meal and record stomach comfort.",
      HYDRATION:
        "Practise your planned hydration timing and record comfort and thirst.",
      CARRYING_SYSTEM:
        "Test the carrying system and equipment you intend to use on race day.",
      IN_RUN_CARBOHYDRATE:
        "Practise only previously tolerated in-run carbohydrate and record GI response.",
      RACE_GEAR:
        "Rehearse race-day shoes, socks, clothing and anti-chafing choices.",
      FULL_DRESS_REHEARSAL:
        "Rehearse the complete race-day routine; do not introduce anything new.",
    },
    zh: {
      PRE_RUN_MEAL: "练习计划中的跑前饮食，并记录胃肠舒适度。",
      HYDRATION: "练习计划中的饮水时机，并记录口渴和舒适度。",
      CARRYING_SYSTEM: "测试比赛日准备使用的携带方式和装备。",
      IN_RUN_CARBOHYDRATE: "只练习已经耐受的跑中碳水，并记录胃肠反应。",
      RACE_GEAR: "演练比赛鞋袜、服装和防摩擦方案。",
      FULL_DRESS_REHEARSAL: "完整演练比赛日流程，不尝试任何新东西。",
    },
    "zh-hant": {
      PRE_RUN_MEAL: "練習計畫中的跑前飲食，並記錄腸胃舒適度。",
      HYDRATION: "練習計畫中的飲水時機，並記錄口渴和舒適度。",
      CARRYING_SYSTEM: "測試比賽日準備使用的攜帶方式和裝備。",
      IN_RUN_CARBOHYDRATE: "只練習已經耐受的跑中碳水，並記錄腸胃反應。",
      RACE_GEAR: "演練比賽鞋襪、服裝和防摩擦方案。",
      FULL_DRESS_REHEARSAL: "完整演練比賽日流程，不嘗試任何新東西。",
    },
    ja: {
      PRE_RUN_MEAL: "予定しているラン前の食事を試し、胃腸の状態を記録します。",
      HYDRATION:
        "予定している給水タイミングを試し、喉の渇きと快適さを記録します。",
      CARRYING_SYSTEM: "レース当日に使う携行方法と装備を試します。",
      IN_RUN_CARBOHYDRATE:
        "耐えられることを確認済みの補給だけを試し、胃腸の反応を記録します。",
      RACE_GEAR: "レース用のシューズ、ソックス、ウェア、擦れ対策を試します。",
      FULL_DRESS_REHEARSAL:
        "レース当日の流れを通して試し、新しい物は使いません。",
    },
  };
  return (
    cues[locale][type] ??
    (locale === "en" ? `Execution practice: ${type}.` : `执行练习：${type}。`)
  );
}

type TranslatedWorkoutLocale = Exclude<PlanTemplateLocale, "en">;
type WorkoutNoteCategory =
  | "easy"
  | "long"
  | "steady"
  | "progression"
  | "strides"
  | "threshold"
  | "interval"
  | "current-marathon"
  | "goal-pace"
  | "race";

const WORKOUT_TERMS: Record<
  TranslatedWorkoutLocale,
  Record<
    | "easy"
    | "easyStrides"
    | "long"
    | "taperLong"
    | "goalMarathonLong"
    | "marathonFinishLong"
    | "mediumLong"
    | "progression"
    | "strides"
    | "steady"
    | "threshold"
    | "thresholdCruise"
    | "interval"
    | "goal10k"
    | "goalHalf"
    | "currentMarathon"
    | "race10k"
    | "raceHalf"
    | "raceMarathon",
    string
  >
> = {
  zh: {
    easy: "轻松跑",
    easyStrides: "轻松跑与加速跑",
    long: "轻松长跑",
    taperLong: "减量长跑",
    goalMarathonLong: "含目标马拉松配速的长跑",
    marathonFinishLong: "后程马拉松配速长跑",
    mediumLong: "中长距离轻松跑",
    progression: "渐进跑",
    strides: "放松加速跑",
    steady: "稳态跑",
    threshold: "阈值跑",
    thresholdCruise: "阈值巡航间歇",
    interval: "间歇跑",
    goal10k: "10 公里目标配速训练",
    goalHalf: "半马目标配速跑",
    currentMarathon: "当前能力马拉松配速跑",
    race10k: "10 公里比赛",
    raceHalf: "半程马拉松比赛",
    raceMarathon: "马拉松比赛",
  },
  "zh-hant": {
    easy: "輕鬆跑",
    easyStrides: "輕鬆跑與加速跑",
    long: "輕鬆長跑",
    taperLong: "減量長跑",
    goalMarathonLong: "含目標馬拉松配速的長跑",
    marathonFinishLong: "後程馬拉松配速長跑",
    mediumLong: "中長距離輕鬆跑",
    progression: "漸進跑",
    strides: "放鬆加速跑",
    steady: "穩態跑",
    threshold: "閾值跑",
    thresholdCruise: "閾值巡航間歇",
    interval: "間歇跑",
    goal10k: "10 公里目標配速訓練",
    goalHalf: "半馬目標配速跑",
    currentMarathon: "目前能力馬拉松配速跑",
    race10k: "10 公里比賽",
    raceHalf: "半程馬拉松比賽",
    raceMarathon: "馬拉松比賽",
  },
  ja: {
    easy: "イージーラン",
    easyStrides: "イージーラン＋流し",
    long: "イージーロングラン",
    taperLong: "テーパーロングラン",
    goalMarathonLong: "目標マラソンペース入りロングラン",
    marathonFinishLong: "後半マラソンペース入りロングラン",
    mediumLong: "ミディアムロングラン",
    progression: "プログレッションラン",
    strides: "リラックスした流し",
    steady: "ステディラン",
    threshold: "閾値走",
    thresholdCruise: "閾値クルーズインターバル",
    interval: "インターバル走",
    goal10k: "10K目標ペース練習",
    goalHalf: "ハーフ目標ペース走",
    currentMarathon: "現在能力のマラソン相当ペース走",
    race10k: "10Kレース",
    raceHalf: "ハーフマラソンレース",
    raceMarathon: "マラソンレース",
  },
};

function intervalSuffix(value: string, locale: TranslatedWorkoutLocale) {
  const match = value.match(/^(\d+)x(\d+)(min)?$/i);
  if (!match) return value.replace(/x/gi, " × ");
  const repeats = match[1];
  const amount = match[2];
  const unit = match[3]
    ? locale === "ja"
      ? "分"
      : locale === "zh"
        ? "分钟"
        : "分鐘"
    : Number(amount) >= 100
      ? locale === "ja"
        ? "m"
        : "米"
      : locale === "ja"
        ? "分"
        : locale === "zh"
          ? "分钟"
          : "分鐘";
  return `${repeats} × ${amount} ${unit}`;
}

function localizedWorkoutName(
  name: string,
  locale: TranslatedWorkoutLocale,
): string {
  const terms = WORKOUT_TERMS[locale];
  let match: RegExpMatchArray | null;
  if (/^Final 10K(?: Race)?$/.test(name)) return terms.race10k;
  if (/^(?:Final )?Half Marathon(?: Race)?$/.test(name)) return terms.raceHalf;
  if (name === "Marathon Race") return terms.raceMarathon;
  if (name === "Easy Run with Strides") return terms.easyStrides;
  if ((match = name.match(/^Easy Run(?: (\d+))?$/))) return terms.easy;
  if (
    (match = name.match(
      /^(?:Easy Long Run|Long Easy Run|Long Run Easy)(?: (\d+))?$/,
    ))
  )
    return terms.long;
  if ((match = name.match(/^Long Run (\d+) Taper$/))) return terms.taperLong;
  if ((match = name.match(/^Long Run Goal MP (\d+)$/)))
    return terms.goalMarathonLong;
  if ((match = name.match(/^Long Run with Marathon Finish (\d+)$/)))
    return terms.marathonFinishLong;
  if ((match = name.match(/^Long Run(?: (\d+))?$/))) return terms.long;
  if ((match = name.match(/^Medium Long Run (\d+)$/))) return terms.mediumLong;
  if ((match = name.match(/^Progression Run (\d+)$/))) return terms.progression;
  if (name === "Relaxed Strides") return terms.strides;
  if ((match = name.match(/^Strides (\d+)$/)))
    return locale === "ja"
      ? `${terms.strides}・${match[1]}本`
      : `${terms.strides} · ${match[1]} 组`;
  if ((match = name.match(/^Steady Run (\d+)$/))) return terms.steady;
  if ((match = name.match(/^Goal Half Pace(?: Taper)? (\d+)$/)))
    return name.includes("Taper")
      ? `${terms.goalHalf}${locale === "ja" ? "（テーパー）" : locale === "zh" ? "（减量）" : "（減量）"}`
      : terms.goalHalf;
  if (name === "Goal Pace Segments") return terms.goal10k;
  if ((match = name.match(/^Marathon Current Equivalent (\d+)$/)))
    return terms.currentMarathon;
  if ((match = name.match(/^Threshold Cruise(?: Intervals)?(?: (.+))?$/)))
    return `${terms.thresholdCruise}${match[1] ? ` · ${intervalSuffix(match[1], locale)}` : ""}`;
  if ((match = name.match(/^Threshold(?: Tempo)?(?: (\d+))?$/)))
    return terms.threshold;
  if ((match = name.match(/^Intervals?(?: Repeats)?(?: (.+))?$/)))
    return `${terms.interval}${match[1] ? ` · ${intervalSuffix(match[1], locale)}` : ""}`;
  throw new Error(`Missing localized workout name for: ${name}`);
}

const WORKOUT_NOTES: Record<
  TranslatedWorkoutLocale,
  Record<WorkoutNoteCategory | "execution", string>
> = {
  zh: {
    easy: "保持轻松、全程可说完整句；遇到坡度、高温或累积疲劳时主动降速。",
    long: "全程保持可对话的轻松强度并保留余力；重点是耐力和在脚时间，不追求配速。",
    steady:
      "稳态段控制在轻松与阈值之间，只能说短句但应可持续，不要跑成阈值训练。",
    progression:
      "从轻松强度开始，逐步加速至可控稳态；全程保留余力，不追求目标成绩。",
    strides: "加速段短促、放松、动作流畅，每次充分恢复；这不是冲刺。",
    threshold:
      "阈值段保持舒适偏难、可控且可重复，只能说少量词语；恢复段轻松慢跑。",
    interval: "间歇段快速但可控，各组保持一致；充分恢复，不做全力冲刺。",
    "current-marathon":
      "按当前能力对应的马拉松强度保持稳定节奏；这不是目标成绩承诺。",
    "goal-pace":
      "目标配速段保持平稳、放松且可控；只用于指定专项段，不抬高其他课程强度。",
    race: "保守起跑，按当前能力或已验证的目标配速执行；比赛日不尝试未经演练的新内容。",
    execution: "按计划练习并记录补给、饮水、携带方式和比赛装备。",
  },
  "zh-hant": {
    easy: "保持輕鬆、全程可說完整句；遇到坡度、高溫或累積疲勞時主動降速。",
    long: "全程保持可對話的輕鬆強度並保留餘力；重點是耐力和在腳時間，不追求配速。",
    steady:
      "穩態段控制在輕鬆與閾值之間，只能說短句但應可持續，不要跑成閾值訓練。",
    progression:
      "從輕鬆強度開始，逐步加速至可控穩態；全程保留餘力，不追求目標成績。",
    strides: "加速段短促、放鬆、動作流暢，每次充分恢復；這不是衝刺。",
    threshold:
      "閾值段保持舒適偏難、可控且可重複，只能說少量詞語；恢復段輕鬆慢跑。",
    interval: "間歇段快速但可控，各組保持一致；充分恢復，不做全力衝刺。",
    "current-marathon":
      "按目前能力對應的馬拉松強度保持穩定節奏；這不是目標成績承諾。",
    "goal-pace":
      "目標配速段保持平穩、放鬆且可控；只用於指定專項段，不提高其他課程強度。",
    race: "保守起跑，按目前能力或已驗證的目標配速執行；比賽日不嘗試未演練的新內容。",
    execution: "按計畫練習並記錄補給、飲水、攜帶方式和比賽裝備。",
  },
  ja: {
    easy: "会話できる楽な強度を保ち、坂・暑さ・累積疲労に応じてペースを落とします。",
    long: "会話できる楽な強度で余力を残し、ペースではなく持久力と走行時間を重視します。",
    steady:
      "イージーと閾値の間で、短い文を話せる持続可能な強度に抑えます。閾値走にはしません。",
    progression:
      "楽な強度から始めてコントロールしたステディまで徐々に上げ、余力を残します。",
    strides:
      "短く滑らかに加速し、毎回十分に回復します。全力疾走ではありません。",
    threshold:
      "閾値区間は心地よくきつい範囲で反復可能に保ち、回復は楽なジョグにします。",
    interval:
      "速くてもコントロールし、各本をそろえます。十分に回復し、全力にはしません。",
    "current-marathon":
      "現在能力に相当するマラソン強度で安定したリズムを保ちます。目標記録の保証ではありません。",
    "goal-pace":
      "目標ペース区間を滑らかで余裕あるリズムに保ち、他の練習強度を引き上げません。",
    race: "保守的に入り、現在能力または検証済み目標ペースで実行します。レース当日に新しいことは試しません。",
    execution: "補給、給水、携行方法、レース装備を計画どおり試して記録します。",
  },
};

function workoutNoteCategory(
  session: GeneratedSession,
  slot?: RunningIntensitySlot,
): WorkoutNoteCategory {
  const value = `${session.name} ${slot?.family ?? ""}`.toLowerCase();
  if (/final|race/.test(value)) return "race";
  if (/goal.*pace|goal mp/.test(value)) return "goal-pace";
  if (/marathon current|marathon finish|current.*marathon/.test(value))
    return "current-marathon";
  if (/interval/.test(value)) return "interval";
  if (/threshold|tempo/.test(value)) return "threshold";
  if (/progress/.test(value)) return "progression";
  if (/stride/.test(value)) return "strides";
  if (/steady/.test(value)) return "steady";
  if (/long/.test(value)) return "long";
  return "easy";
}

function localizedWorkoutNotes(
  session: GeneratedSession,
  slot: RunningIntensitySlot | undefined,
  locale: TranslatedWorkoutLocale,
) {
  const copy = WORKOUT_NOTES[locale];
  const category = workoutNoteCategory(session, slot);
  const needsExecutionCue =
    /fuel|hydrat|gear|breakfast|carrying|race-day routine/i.test(session.notes);
  return [copy[category], needsExecutionCue ? copy.execution : ""]
    .filter(Boolean)
    .join(" ");
}

function localizedWorkoutCopy(args: {
  session: GeneratedSession;
  slot?: RunningIntensitySlot;
  practices: readonly { practiceType: string; instructions: string }[];
}): Record<PlanTemplateLocale, LocalizedWorkoutText> {
  return Object.fromEntries(
    LOCALES.map((locale) => {
      const localizedName =
        locale === "en"
          ? args.session.name
          : localizedWorkoutName(args.session.name, locale);
      const base =
        locale === "en"
          ? args.session.notes
          : localizedWorkoutNotes(args.session, args.slot, locale);
      const practice = args.practices.map((item) =>
        locale === "en"
          ? item.instructions
          : practiceCue(item.practiceType, locale),
      );
      return [
        locale,
        {
          name: localizedName,
          notes: [base, ...practice].filter(Boolean).join(" "),
        },
      ];
    }),
  ) as Record<PlanTemplateLocale, LocalizedWorkoutText>;
}

const TEMPLATE_TITLES: Record<string, Record<PlanTemplateLocale, string>> = {
  RUN_10K_IMPROVE: {
    en: "Improve Your 10K",
    zh: "10 公里进阶计划",
    "zh-hant": "10 公里進階計畫",
    ja: "10K向上プラン",
  },
  RUN_10K_TARGET: {
    en: "Target 10K Race Plan",
    zh: "10 公里挑战计划",
    "zh-hant": "10 公里挑戰計畫",
    ja: "10K目標レースプラン",
  },
  RUN_HALF_FINISH: {
    en: "First Half Marathon Finish",
    zh: "首个半马完赛计划",
    "zh-hant": "首個半馬完賽計畫",
    ja: "初ハーフ完走プラン",
  },
  RUN_HALF_IMPROVE: {
    en: "Improve Your Half Marathon",
    zh: "半马进阶计划",
    "zh-hant": "半馬進階計畫",
    ja: "ハーフ向上プラン",
  },
  RUN_HALF_TARGET: {
    en: "Target Half Marathon Plan",
    zh: "半马挑战计划",
    "zh-hant": "半馬挑戰計畫",
    ja: "ハーフ目標レースプラン",
  },
  RUN_MARATHON_FINISH: {
    en: "First Marathon Finish",
    zh: "首个全马完赛计划",
    "zh-hant": "首個全馬完賽計畫",
    ja: "初マラソン完走プラン",
  },
  RUN_MARATHON_IMPROVE: {
    en: "Improve Your Marathon",
    zh: "全马进阶计划",
    "zh-hant": "全馬進階計畫",
    ja: "マラソン向上プラン",
  },
  RUN_MARATHON_TARGET: {
    en: "Target Marathon Plan",
    zh: "全马挑战计划",
    "zh-hant": "全馬挑戰計畫",
    ja: "マラソン目標レースプラン",
  },
};

function templateCopy(
  raw: GeneratedTemplate,
): Record<PlanTemplateLocale, LocalizedTemplateText> {
  const distance =
    raw.goal === "HALF_MARATHON"
      ? "半马"
      : raw.goal === "MARATHON"
        ? "全马"
        : "10 公里";
  const englishDistance =
    raw.goal === "HALF_MARATHON"
      ? "half-marathon"
      : raw.goal === "MARATHON"
        ? "marathon"
        : "10K";
  return Object.fromEntries(
    LOCALES.map((locale) => {
      if (locale === "en") {
        return [
          locale,
          {
            title: TEMPLATE_TITLES[raw.key].en,
            description: `This ${raw.plan.periodWeeks}-week structured ${englishDistance} plan typically schedules ${raw.normalRunsPerWeek} runs per week and progressively develops endurance and distance-specific fitness through easy running, quality work and long runs.`,
            eligibility:
              "For runners whose recent training frequency, volume and long-run base are compatible with the opening week.",
            promise:
              raw.outcome === "FINISH"
                ? "Build the durability and execution skills to complete the distance under control."
                : raw.outcome === "IMPROVE"
                  ? "Improve current race performance without deriving training intensity from a wished-for result."
                  : "Prepare with training paces anchored to current fitness and keep goal pace confined to specific race-preparation sessions.",
          },
        ];
      }
      const traditional = locale === "zh-hant";
      const japanese = locale === "ja";
      const localizedDistance = traditional
        ? raw.goal === "HALF_MARATHON"
          ? "半馬"
          : raw.goal === "MARATHON"
            ? "全馬"
            : "10 公里"
        : distance;
      return [
        locale,
        {
          title: TEMPLATE_TITLES[raw.key][locale],
          description: japanese
            ? `${raw.plan.periodWeeks}週間、通常週${raw.normalRunsPerWeek}回の構造化プランです。イージーラン、質の高い練習、ロング走を通じて、持久力と距離に必要な走力を段階的に伸ばします。`
            : `${traditional ? "這" : "这"}是一份 ${raw.plan.periodWeeks} ${traditional ? "週" : "周"}、${traditional ? "正常週每週" : "正常周每周"} ${raw.normalRunsPerWeek} ${traditional ? "跑的結構化" : "跑的结构化"}${localizedDistance}${traditional ? "計畫，透過輕鬆跑、品質訓練和長跑，逐步建立耐力與專項能力。" : "计划，通过轻松跑、质量训练和长跑，逐步建立耐力与专项能力。"}`,
          eligibility: japanese
            ? "直近のトレーニング頻度、走行量、ロング走の基礎が開始週に適合するランナー向けです。"
            : `${traditional ? "適合近期訓練頻率、訓練量和長跑基礎與計畫起始週匹配的跑者。" : "适合近期训练频率、训练量和长跑基础与计划起始周匹配的跑者。"}`,
          promise: japanese
            ? "凍結された練習構造を保ち、現在能力と目標ペースを混同せずに準備します。"
            : "保持冻结训练结构，以当前能力控制训练强度，并把目标比赛配速限制在明确的专项训练中。",
        },
      ];
    }),
  ) as Record<PlanTemplateLocale, LocalizedTemplateText>;
}

function buildTemplate(raw: GeneratedTemplate): PlanTemplateDefinition {
  const sessions = new Map(
    raw.plan.sessionTemplates.map((item) => [item.id, item]),
  );
  const slots = raw.intensitySlots.map(normalizedSlot);
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  const assignmentByTemplate = new Map(
    raw.intensityAssignments.map((item) => [
      item.templateId,
      item.intensitySlotId,
    ]),
  );
  const practicesByOccurrence = new Map<
    string,
    Array<{ practiceType: string; instructions: string }>
  >();
  for (const item of raw.executionPractices) {
    const key = `${item.weekIndex}:${item.dayIndex}`;
    const list = practicesByOccurrence.get(key) ?? [];
    list.push({
      practiceType: item.practiceType,
      instructions:
        item.instructions ??
        item.instruction ??
        `Execution practice: ${item.practiceType}.`,
    });
    practicesByOccurrence.set(key, list);
  }
  const workouts: PlanTemplateWorkout[] = [];
  for (let weekIndex = 1; weekIndex <= raw.plan.periodWeeks; weekIndex += 1) {
    const occurrences = raw.plan.workouts
      .filter((item) => item.weekIndex === weekIndex)
      .slice()
      .sort((left, right) => left.dayIndex - right.dayIndex);
    occurrences.forEach((occurrence, occurrenceIndex) => {
      const session = sessions.get(occurrence.templateId);
      if (!session)
        throw new Error(`${raw.key}: missing session ${occurrence.templateId}`);
      const final =
        weekIndex === raw.plan.periodWeeks &&
        occurrenceIndex === occurrences.length - 1;
      const slotId = assignmentByTemplate.get(occurrence.templateId);
      const slot = slotId ? slotsById.get(slotId) : undefined;
      const kind = workoutKind({ session, slot, final });
      const range =
        slot?.rpeRange ??
        (final
          ? {
              min: raw.outcome === "FINISH" ? 5 : 7,
              max: raw.outcome === "FINISH" ? 6 : 8,
            }
          : { min: 3, max: 4 });
      const slotIndex =
        final && occurrences.length < raw.normalRunsPerWeek
          ? raw.normalRunsPerWeek
          : occurrenceIndex + 1;
      workouts.push({
        semanticId: `${raw.key.toLowerCase()}.w${weekIndex}.s${slotIndex}`,
        templateId: occurrence.templateId,
        canonicalDayIndex: occurrence.dayIndex,
        intensitySlotId: slotId,
        weekIndex,
        slotIndex,
        phase: phaseFor(weekIndex, raw.plan.periodWeeks),
        quality:
          kind === "INTERVAL" ||
          kind === "TEMPO" ||
          kind === "RACE" ||
          (kind === "STEADY" && range.min >= 5),
        sportType: "RUN",
        intensityKind: kind,
        plannedRpe: Math.round((range.min + range.max) / 2),
        plannedRpeRange: range,
        sourceDsl: session.text,
        definition: parseFrozenDsl(session.text),
        copy: localizedWorkoutCopy({
          session,
          slot,
          practices:
            practicesByOccurrence.get(`${weekIndex}:${occurrence.dayIndex}`) ??
            [],
        }),
      });
    });
  }
  const canonical = {
    key: raw.key,
    version: raw.version,
    methodologyVersion: raw.methodologyVersion,
    resolverVersion: raw.resolverVersion,
    scheduleVersion: raw.scheduleVersion,
    plan: raw.plan,
    intensitySlots: raw.intensitySlots,
    intensityAssignments: raw.intensityAssignments,
    executionPractices: raw.executionPractices,
  };
  const contentHash = stableHash(canonical);
  if (contentHash !== raw.expectedContentHash) {
    throw new Error(
      `${raw.key}: canonical content hash changed (${contentHash}, expected ${raw.expectedContentHash})`,
    );
  }
  return {
    key: raw.key,
    version: raw.version,
    slug: raw.slug,
    goal: raw.goal,
    outcome: raw.outcome,
    methodId: "TRAININGLOAD_GENERAL",
    copyVersion: raw.copyVersion,
    methodologyVersion: raw.methodologyVersion,
    resolverVersion: raw.resolverVersion,
    scheduleVersion: raw.scheduleVersion,
    contentHash,
    publicVariantId: "standard",
    publicExample: {
      id: "PUBLIC_EXAMPLE_VDOT_40",
      vdot: 40,
      resolverVersion: raw.resolverVersion,
    },
    intensitySlots: slots,
    capabilityRequirements: Array.isArray(raw.anchorRequirements)
      ? raw.anchorRequirements.map(String)
      : raw.anchorRequirements
        ? [String(raw.anchorRequirements)]
        : [],
    authoring: {
      source: "OFFLINE_AI_REVIEWED",
      generatedAt: "2026-08-25T00:00:00.000Z",
      model: "deepseek-v4-pro",
      promptContract: raw.promptContract,
      candidateSha256: raw.candidateSha256,
    },
    copy: templateCopy(raw),
    variants: [
      {
        id: "standard",
        periodWeeks: raw.plan.periodWeeks,
        trainingDaysPerWeek: raw.normalRunsPerWeek,
        weeks: Array.from({ length: raw.plan.periodWeeks }, (_, offset) => {
          const weekIndex = offset + 1;
          const phase = phaseFor(weekIndex, raw.plan.periodWeeks);
          const weekWorkouts = workouts.filter(
            (item) => item.weekIndex === weekIndex,
          );
          const copy = Object.fromEntries(
            LOCALES.map((locale) => [
              locale,
              {
                title:
                  locale === "en"
                    ? `Week ${weekIndex}`
                    : locale === "ja"
                      ? `${weekIndex}週目`
                      : `第 ${weekIndex} 周`,
                description: weekWorkouts
                  .map((item) => item.copy[locale].name)
                  .join(locale === "en" ? ", " : "、"),
              },
            ]),
          ) as Record<
            PlanTemplateLocale,
            { title: string; description: string }
          >;
          return { weekIndex, phase, copy };
        }),
        workouts,
      },
    ],
  } as PlanTemplateDefinition;
}

export function buildGeneratedOfficialRunningTemplates(): readonly PlanTemplateDefinition[] {
  return GENERATED_OFFICIAL_RUNNING_TEMPLATES.map((item) =>
    buildTemplate(item as unknown as GeneratedTemplate),
  );
}
