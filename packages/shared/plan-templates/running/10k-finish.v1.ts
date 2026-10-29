import type {
  EndurancePlanBlock,
  EnduranceWorkRestStep,
  EnduranceWorkoutIrV1,
} from "../../endurance-workout-ir";
import type { WorkoutDefinitionInput } from "../../workout-structure";
import type {
  LocalizedWorkoutText,
  PlanTemplateDefinition,
  PlanTemplateLocale,
  PlanTemplatePhase,
  PlanTemplateVariant,
  PlanTemplateWorkout,
  PlanTemplateWeek,
} from "../registry";

type TenKSessionId =
  | "easy30"
  | "easy35"
  | "easy40"
  | "long45"
  | "long50"
  | "long55"
  | "long60"
  | "long65"
  | "steady"
  | "race10k";

type TenKSessionSpec = {
  id: TenKSessionId;
  kind: PlanTemplateWorkout["intensityKind"];
  warmupMinutes: number;
  workMinutes?: number;
  workDistanceMeters?: number;
  cooldownMinutes: number;
  plannedRpe: number;
  plannedRpeRange: { min: number; max: number };
  quality: boolean;
};

const SESSION_SPECS: Record<TenKSessionId, TenKSessionSpec> = {
  easy30: session("easy30", "EASY", 5, 25, 5, 3, 3, 4),
  easy35: session("easy35", "EASY", 5, 30, 5, 3, 3, 4),
  easy40: session("easy40", "EASY", 5, 35, 5, 3, 3, 4),
  long45: session("long45", "LONG", 5, 40, 5, 4, 3, 4),
  long50: session("long50", "LONG", 5, 45, 5, 4, 3, 4),
  long55: session("long55", "LONG", 5, 50, 5, 4, 3, 4),
  long60: session("long60", "LONG", 5, 55, 5, 4, 3, 4),
  long65: session("long65", "LONG", 5, 60, 5, 4, 3, 4),
  steady: session("steady", "STEADY", 10, 20, 10, 5, 5, 6, true),
  race10k: {
    id: "race10k",
    kind: "RACE",
    warmupMinutes: 5,
    workDistanceMeters: 10_000,
    cooldownMinutes: 5,
    plannedRpe: 4,
    plannedRpeRange: { min: 3, max: 4 },
    quality: true,
  },
};

const WEEK_SESSIONS: readonly (readonly TenKSessionId[])[] = [
  ["easy30", "easy30", "long45"],
  ["easy30", "easy35", "long50"],
  ["easy35", "easy35", "long50"],
  ["easy35", "steady", "long55"],
  ["easy40", "easy35", "long55"],
  ["easy40", "steady", "long60"],
  ["easy40", "easy40", "long65"],
  ["easy40", "steady", "long60"],
  ["easy40", "easy35", "long55"],
  ["easy30", "easy30", "race10k"],
] as const;

const PHASES: readonly PlanTemplatePhase[] = [
  "BASE",
  "BASE",
  "BASE",
  "BUILD",
  "BUILD",
  "BUILD",
  "PEAK",
  "RECOVERY",
  "RECOVERY",
  "RACE",
];

function session(
  id: TenKSessionId,
  kind: TenKSessionSpec["kind"],
  warmupMinutes: number,
  workMinutes: number,
  cooldownMinutes: number,
  plannedRpe: number,
  rpeMin: number,
  rpeMax: number,
  quality = false,
): TenKSessionSpec {
  return {
    id,
    kind,
    warmupMinutes,
    workMinutes,
    cooldownMinutes,
    plannedRpe,
    plannedRpeRange: { min: rpeMin, max: rpeMax },
    quality,
  };
}

function timeStep(
  minutes: number,
  stepKind: EnduranceWorkRestStep["stepKind"],
): EnduranceWorkRestStep {
  const seconds = minutes * 60;
  return {
    duration: seconds,
    stepKind,
    durationMeta: { kind: "TIME", value: seconds, unit: "SECONDS" },
  };
}

function distanceStep(
  meters: number,
  stepKind: EnduranceWorkRestStep["stepKind"],
): EnduranceWorkRestStep {
  return {
    duration: 0,
    stepKind,
    durationMeta: {
      kind: "DISTANCE",
      value: meters / 1_000,
      unit: "KILOMETERS",
    },
  };
}

function workoutDefinition(spec: TenKSessionSpec): WorkoutDefinitionInput {
  const blocks: EndurancePlanBlock[] = [
    { type: "work", steps: [timeStep(spec.warmupMinutes, "WARMUP")] },
    {
      type: "work",
      steps: [
        spec.workDistanceMeters
          ? distanceStep(spec.workDistanceMeters, "WORK")
          : timeStep(spec.workMinutes ?? 0, "WORK"),
      ],
    },
    { type: "work", steps: [timeStep(spec.cooldownMinutes, "COOLDOWN")] },
  ];
  const structure: EnduranceWorkoutIrV1 = {
    kind: "ENDURANCE",
    version: 1,
    blocks,
  };
  return { kind: "ENDURANCE", version: 1, source: "STRUCTURE", structure };
}

function sourceDsl(spec: TenKSessionSpec) {
  const work = spec.workDistanceMeters
    ? `${spec.workDistanceMeters / 1_000}km`
    : `${spec.workMinutes}m`;
  return `warmup ${spec.warmupMinutes}m\nwork ${work}\ncooldown ${spec.cooldownMinutes}m`;
}

function sessionName(
  spec: TenKSessionSpec,
): Record<PlanTemplateLocale, string> {
  if (spec.id === "race10k") {
    return {
      en: "10K completion",
      zh: "10 公里完赛跑",
      "zh-hant": "10 公里完賽跑",
      ja: "10K完走ラン",
    };
  }
  if (spec.id === "steady") {
    return {
      en: "Controlled steady run · 20 min work",
      zh: "受控稳定跑 · 主训练 20 分钟",
      "zh-hant": "受控穩定跑 · 主訓練 20 分鐘",
      ja: "コントロール・ステディ走 · メイン20分",
    };
  }
  const total =
    spec.warmupMinutes + (spec.workMinutes ?? 0) + spec.cooldownMinutes;
  const label = spec.kind === "LONG" ? "Long" : "Easy";
  return {
    en: `${label} ${total - 5} min`,
    zh: `${spec.kind === "LONG" ? "长距离轻松跑" : "对话强度轻松跑"} · ${total - 5} 分钟`,
    "zh-hant": `${spec.kind === "LONG" ? "長距離輕鬆跑" : "對話強度輕鬆跑"} · ${total - 5} 分鐘`,
    ja: `${spec.kind === "LONG" ? "ロング・イージーラン" : "会話できるイージーラン"} · ${total - 5}分`,
  };
}

function sessionCopy(
  spec: TenKSessionSpec,
): Record<PlanTemplateLocale, LocalizedWorkoutText> {
  const name = sessionName(spec);
  const main = spec.workDistanceMeters
    ? "10 km"
    : `${spec.workMinutes} minutes`;
  if (spec.id === "race10k") {
    return {
      en: {
        name: name.en,
        notes:
          "Warm up easily for 5 minutes, complete 10 km at a controlled, conversational effort, then cool down easily for 5 minutes. Start conservatively and take walk breaks whenever needed; completion matters more than pace.",
      },
      zh: {
        name: name.zh,
        notes:
          "先轻松热身 5 分钟，再以受控、可对话的强度完成 10 公里，最后轻松冷身 5 分钟。保守起步，按需步行；完成距离比配速更重要。",
      },
      "zh-hant": {
        name: name["zh-hant"],
        notes:
          "先輕鬆熱身 5 分鐘，再以受控、可對話的強度完成 10 公里，最後輕鬆冷身 5 分鐘。保守起步，按需步行；完成距離比配速更重要。",
      },
      ja: {
        name: name.ja,
        notes:
          "5分イージーにウォームアップし、会話できるコントロールした強度で10kmを完走し、5分イージーにクールダウンします。序盤を抑え、必要なら歩いて構いません。ペースより完走を優先します。",
      },
    };
  }
  if (spec.id === "steady") {
    return {
      en: {
        name: name.en,
        notes:
          "Warm up easily for 10 minutes, run 20 minutes at a controlled RPE 5–6 where short sentences remain possible, then cool down easily for 10 minutes. This is steady pacing practice, not threshold training; do not push to breathlessness.",
      },
      zh: {
        name: name.zh,
        notes:
          "先轻松热身 10 分钟，再以 RPE 5–6、仍能说出短句的受控强度跑 20 分钟，最后轻松冷身 10 分钟。这是稳定配速练习，不是阈值训练；不要跑到喘不过气。",
      },
      "zh-hant": {
        name: name["zh-hant"],
        notes:
          "先輕鬆熱身 10 分鐘，再以 RPE 5–6、仍能說出短句的受控強度跑 20 分鐘，最後輕鬆冷身 10 分鐘。這是穩定配速練習，不是閾值訓練；不要跑到喘不過氣。",
      },
      ja: {
        name: name.ja,
        notes:
          "10分イージーにウォームアップし、短い文で話せるRPE 5〜6で20分走り、10分イージーにクールダウンします。閾値走ではなくステディなペース練習なので、息が切れるまで上げません。",
      },
    };
  }
  const long = spec.kind === "LONG";
  return {
    en: {
      name: name.en,
      notes: `Warm up easily for ${spec.warmupMinutes} minutes, complete ${main} at RPE 3–4, then cool down easily for ${spec.cooldownMinutes} minutes. Stay conversational, slow down for heat, hills or fatigue${long ? ", and use short walk breaks when needed" : ""}. Do not stack missed sessions.`,
    },
    zh: {
      name: name.zh,
      notes: `先轻松热身 ${spec.warmupMinutes} 分钟，以 RPE 3–4 完成主训练 ${spec.workMinutes} 分钟，最后轻松冷身 ${spec.cooldownMinutes} 分钟。全程保持可对话；炎热、坡度或疲劳时主动降速${long ? "，需要时可短暂步行" : ""}。不要堆叠补课。`,
    },
    "zh-hant": {
      name: name["zh-hant"],
      notes: `先輕鬆熱身 ${spec.warmupMinutes} 分鐘，以 RPE 3–4 完成主訓練 ${spec.workMinutes} 分鐘，最後輕鬆冷身 ${spec.cooldownMinutes} 分鐘。全程保持可對話；炎熱、坡度或疲勞時主動降速${long ? "，需要時可短暫步行" : ""}。不要堆疊補課。`,
    },
    ja: {
      name: name.ja,
      notes: `${spec.warmupMinutes}分イージーにウォームアップし、RPE 3〜4で${spec.workMinutes}分走り、${spec.cooldownMinutes}分イージーにクールダウンします。会話できる余裕を保ち、暑さ、坂、疲労に合わせて落とし${long ? "、必要なら短く歩いて構いません" : ""}。欠けた練習を詰め込みません。`,
    },
  };
}

function weekCopy(
  weekIndex: number,
  phase: PlanTemplatePhase,
  sessions: readonly TenKSessionId[],
): PlanTemplateWeek["copy"] {
  const names = sessions.map((id) => sessionName(SESSION_SPECS[id]));
  const join = (locale: PlanTemplateLocale) =>
    names.map((name) => name[locale]).join(locale === "en" ? ", " : "、");
  const phaseNames: Record<
    PlanTemplateLocale,
    Record<PlanTemplatePhase, string>
  > = {
    en: {
      START: "Start",
      BASE: "Base",
      BUILD: "Build",
      RECOVERY: "Consolidate",
      PEAK: "Peak",
      RACE: "10K week",
    },
    zh: {
      START: "起步",
      BASE: "基础",
      BUILD: "构建",
      RECOVERY: "巩固与减量",
      PEAK: "峰值",
      RACE: "10 公里周",
    },
    "zh-hant": {
      START: "起步",
      BASE: "基礎",
      BUILD: "構建",
      RECOVERY: "鞏固與減量",
      PEAK: "峰值",
      RACE: "10 公里週",
    },
    ja: {
      START: "開始",
      BASE: "基礎",
      BUILD: "強化",
      RECOVERY: "定着とテーパー",
      PEAK: "ピーク",
      RACE: "10K週",
    },
  };
  return {
    en: {
      title: `Week ${weekIndex}: ${phaseNames.en[phase]}`,
      description: `${join("en")}. Keep easy and long running conversational; steady work remains controlled rather than threshold effort.`,
    },
    zh: {
      title: `第 ${weekIndex} 周：${phaseNames.zh[phase]}`,
      description: `${join("zh")}。轻松跑和长跑保持可对话；稳定跑保持受控，不进入阈值强度。`,
    },
    "zh-hant": {
      title: `第 ${weekIndex} 週：${phaseNames["zh-hant"][phase]}`,
      description: `${join("zh-hant")}。輕鬆跑和長跑保持可對話；穩定跑保持受控，不進入閾值強度。`,
    },
    ja: {
      title: `${weekIndex}週目：${phaseNames.ja[phase]}`,
      description: `${join("ja")}。イージーとロングは会話できる強度を保ち、ステディ走を閾値強度まで上げません。`,
    },
  };
}

function buildVariant(): PlanTemplateVariant {
  const workouts: PlanTemplateWorkout[] = [];
  WEEK_SESSIONS.forEach((sessions, weekOffset) => {
    const weekIndex = weekOffset + 1;
    sessions.forEach((sessionId, slotOffset) => {
      const spec = SESSION_SPECS[sessionId];
      workouts.push({
        semanticId: `run_10k_finish.w${weekIndex}.s${slotOffset + 1}`,
        weekIndex,
        slotIndex: slotOffset + 1,
        phase: PHASES[weekOffset],
        quality: spec.quality,
        sportType: "RUN",
        intensityKind: spec.kind,
        plannedRpe: spec.plannedRpe,
        plannedRpeRange: spec.plannedRpeRange,
        sourceDsl: sourceDsl(spec),
        definition: workoutDefinition(spec),
        copy: sessionCopy(spec),
      });
    });
  });
  return {
    id: "standard",
    periodWeeks: 10,
    trainingDaysPerWeek: 3,
    weeks: WEEK_SESSIONS.map((sessions, index) => ({
      weekIndex: index + 1,
      phase: PHASES[index],
      copy: weekCopy(index + 1, PHASES[index], sessions),
    })),
    workouts,
  };
}

export function buildRun10kFinishTemplate(): Omit<
  PlanTemplateDefinition,
  "contentHash"
> {
  return {
    key: "RUN_10K_FINISH",
    version: "1.0.0",
    slug: "finish-10k",
    goal: "10K",
    publicVariantId: "standard",
    authoring: {
      source: "OFFLINE_AI_REVIEWED",
      generatedAt: "2026-08-24T04:59:34.310Z",
      model: "deepseek-v4-pro",
      promptContract: "official-running-template-authoring/v2.1",
      candidateSha256:
        "73cef8903c96edfed44e3781d6b62d8c6af6e360f4fc8232024e94a702b3bd36",
    },
    copy: {
      en: {
        title: "First 10K Finish: A Controlled 10-Week Build",
        description:
          "Build from a comfortable 5K or 30–40 minutes of continuous easy running to a controlled first 10K. Three weekly runs keep almost 90% of sessions easy or long, with short steady work only in weeks 4, 6 and 8. Long runs progress to 65 minutes before a two-week reduction and 10K completion week. No threshold, interval, pace, heart-rate, power or zone target is required.",
        eligibility:
          "For runners who have completed 5K or can run easily and continuously for about 30–40 minutes without pain or medical restriction.",
        promise:
          "Reach 10K day with enough endurance to start conservatively, stay controlled and use walk breaks whenever needed.",
      },
      zh: {
        title: "第一个 10 公里：受控推进的 10 周完赛计划",
        description:
          "从能够舒适完成 5 公里或连续轻松跑约 30–40 分钟，逐步发展到受控完成第一个 10 公里。每周 3 次跑步，接近九成训练保持轻松或长跑强度，只在第 4、6、8 周安排短时稳定跑。长跑逐步增加到 65 分钟，再经过两周减量进入 10 公里完赛周。计划不要求阈值、间歇、配速、心率、功率或分区目标。",
        eligibility:
          "适合已经完成 5 公里，或能无疼痛、无医学限制地连续轻松跑约 30–40 分钟的人。",
        promise:
          "在 10 公里当天具备足够耐力，能够保守起步、控制强度，并在需要时主动步行。",
      },
      "zh-hant": {
        title: "第一個 10 公里：受控推進的 10 週完賽計畫",
        description:
          "從能夠舒適完成 5 公里或連續輕鬆跑約 30–40 分鐘，逐步發展到受控完成第一個 10 公里。每週 3 次跑步，接近九成訓練保持輕鬆或長跑強度，只在第 4、6、8 週安排短時穩定跑。長跑逐步增加到 65 分鐘，再經過兩週減量進入 10 公里完賽週。計畫不要求閾值、間歇、配速、心率、功率或分區目標。",
        eligibility:
          "適合已經完成 5 公里，或能無疼痛、無醫學限制地連續輕鬆跑約 30–40 分鐘的人。",
        promise:
          "在 10 公里當天具備足夠耐力，能夠保守起步、控制強度，並在需要時主動步行。",
      },
      ja: {
        title: "はじめての10K：10週間のコントロール完走プラン",
        description:
          "余裕を持って5Kを完走できる、または30〜40分連続でイージーに走れる状態から、最初の10K完走を目指します。週3回のうち約9割をイージーまたはロング走とし、4・6・8週目だけ短いステディ走を行います。ロング走を65分まで伸ばした後、2週間負荷を下げて10K週へ進みます。閾値走、インターバル、ペース、心拍、パワー、ゾーン目標は不要です。",
        eligibility:
          "5Kを完走済み、または痛みや医学的制限なく30〜40分連続で楽に走れる人向けです。",
        promise:
          "10K当日は序盤を抑え、強度を管理し、必要なら歩きながら完走できる持久力を作ります。",
      },
    },
    variants: [buildVariant()],
  };
}
