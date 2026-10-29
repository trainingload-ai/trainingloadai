import type {
  EndurancePlanBlock,
  EnduranceWorkRestStep,
  EnduranceWorkoutIrV1,
} from "../endurance-workout-ir";
import type { WorkoutDefinitionInput } from "../workout-structure";
import {
  computeVdotForDistanceTime,
  isSupportedVdot,
  resolveVdotPaces,
  type VdotZoneKey,
} from "../vdot";
import { buildRun10kFinishTemplate } from "./running/10k-finish.v1";
import { buildGeneratedOfficialRunningTemplates } from "./running/generated-official.v1";
import {
  resolveRunningWorkoutIntensity,
  type RunningCapabilitySnapshot,
  type RunningGoalRaceSnapshot,
} from "./running/intensity-resolver";

export const RUN_PLAN_TEMPLATE_KEYS = [
  "RUN_5K_FIRST",
  "RUN_5K_FINISH",
  "RUN_5K_IMPROVE",
  "RUN_10K_FINISH",
  "RUN_10K_IMPROVE",
  "RUN_10K_TARGET",
  "RUN_HALF_FINISH",
  "RUN_HALF_IMPROVE",
  "RUN_HALF_TARGET",
  "RUN_MARATHON_FINISH",
  "RUN_MARATHON_IMPROVE",
  "RUN_MARATHON_TARGET",
] as const;

export type RunPlanTemplateKey = (typeof RUN_PLAN_TEMPLATE_KEYS)[number];
export type RunPlanTemplateGoal = "5K" | "10K" | "HALF_MARATHON" | "MARATHON";
export type RunPlanTemplateOutcome = "FIRST" | "FINISH" | "IMPROVE" | "TARGET";
export type PlanTemplateLocale = "en" | "zh" | "zh-hant" | "ja";
export type PlanTemplatePhase =
  | "START"
  | "BASE"
  | "BUILD"
  | "RECOVERY"
  | "PEAK"
  | "RACE";

export type LocalizedTemplateText = {
  title: string;
  description: string;
  eligibility: string;
  promise: string;
};

export type LocalizedWorkoutText = {
  name: string;
  notes: string;
};

export type PlanTemplateWorkoutKind =
  | "RUN_WALK"
  | "EASY"
  | "STEADY"
  | "INTERVAL"
  | "TEMPO"
  | "LONG"
  | "RACE";

export type PlanTemplateIntensityGuidance = {
  basis:
    | "RPE_TALK_TEST"
    | "VDOT_RECENT_5K"
    | "PUBLIC_EXAMPLE"
    | "PERSONAL_CAPABILITY"
    | "GOAL_RACE_PACE";
  rpe: { min: number; max: number; display: string };
  talkTest: string;
  summary: string;
  pace?: {
    fastSecPerKm: number;
    slowSecPerKm: number;
    display: string;
    zoneLabel?: string;
    zoneSystem?: string;
    source:
      | "RECENT_5K"
      | "PUBLIC_EXAMPLE"
      | "VO2_MAX"
      | "RECENT_RACE"
      | "TP"
      | "CS"
      | "GOAL_RACE_PACE";
  };
};

export type RunningIntensitySlot = {
  id: string;
  family: string;
  purpose: string;
  basis: string;
  fallbackCue: string;
  rpeRange: { min: number; max: number };
  talkTest: string;
};

export type PlanTemplateCoachFlow = {
  runtimeAiCalled: false;
  aiTokensConsumed: false;
  title: string;
  summary: string;
  stages: Array<{
    id: "TRACK" | "ASSESS" | "ADJUST";
    title: string;
    description: string;
  }>;
};

export type PlanTemplateWorkout = {
  semanticId: string;
  weekIndex: number;
  slotIndex: number;
  phase: PlanTemplatePhase;
  quality: boolean;
  sportType: "RUN";
  intensityKind: PlanTemplateWorkoutKind;
  plannedRpe: number;
  plannedRpeRange: { min: number; max: number };
  /** Frozen authoring DSL used for parser round-trip checks; not exposed in DTOs. */
  sourceDsl: string;
  definition: WorkoutDefinitionInput;
  copy: Record<PlanTemplateLocale, LocalizedWorkoutText>;
  templateId?: string;
  canonicalDayIndex?: number;
  intensitySlotId?: string;
};

export type PlanTemplateWeek = {
  weekIndex: number;
  phase: PlanTemplatePhase;
  copy: Record<PlanTemplateLocale, { title: string; description: string }>;
};

export type PlanTemplateVariant = {
  id: string;
  periodWeeks: number;
  trainingDaysPerWeek: number;
  weeks: PlanTemplateWeek[];
  workouts: PlanTemplateWorkout[];
};

export type PlanTemplateDefinition = {
  key: RunPlanTemplateKey;
  version: "1.0.0" | "1.0.1";
  slug:
    | "first-5k"
    | "finish-5k"
    | "improve-5k"
    | "finish-10k"
    | "improve-10k"
    | "target-10k"
    | "finish-half-marathon"
    | "improve-half-marathon"
    | "target-half-marathon"
    | "finish-marathon"
    | "improve-marathon"
    | "target-marathon";
  goal: RunPlanTemplateGoal;
  outcome?: RunPlanTemplateOutcome;
  methodId?: "TRAININGLOAD_GENERAL";
  copyVersion?: string;
  methodologyVersion?: string;
  resolverVersion?: string;
  scheduleVersion?: string;
  intensitySlots?: readonly RunningIntensitySlot[];
  capabilityRequirements?: readonly string[];
  publicExample?: {
    id: "PUBLIC_EXAMPLE_VDOT_40";
    vdot: 40;
    resolverVersion: string;
  } | null;
  publicVariantId: string;
  contentHash: string;
  authoring?: {
    source: "OFFLINE_AI_REVIEWED";
    generatedAt: string;
    model: string;
    promptContract: string;
    candidateSha256: string;
  };
  copy: Record<PlanTemplateLocale, LocalizedTemplateText>;
  variants: PlanTemplateVariant[];
};

export type PlanTemplatePlanDraft = {
  title: string;
  description: string;
  goal: RunPlanTemplateGoal;
  sourceType: "TEMPLATE";
  periodWeeks: number;
  workouts: Array<{
    weekIndex: number;
    dayIndex: number;
    sportType: "RUN";
    plannedSessionRpe: number;
    name: string;
    notes: string;
    definition: WorkoutDefinitionInput;
  }>;
  generationMetadata: {
    planTemplate: {
      key: RunPlanTemplateKey;
      version: PlanTemplateDefinition["version"];
      slug: string;
      variantId: string;
      contentHash: string;
      locale: PlanTemplateLocale;
      preferredWeekdays: number[];
      requestedStartDate: string;
      recent5kSeconds?: number;
      capabilitySnapshot?: Record<string, unknown>;
      targetRace?: Record<string, unknown>;
      resolverVersion?: string;
      scheduleVersion?: string;
    };
  };
};

const SUPPORTED_LOCALES = new Set<PlanTemplateLocale>([
  "en",
  "zh",
  "zh-hant",
  "ja",
]);

export function normalizePlanTemplateLocale(
  value: unknown,
): PlanTemplateLocale {
  const raw = String(value ?? "en")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (
    raw === "zh-tw" ||
    raw === "zh-hk" ||
    raw === "zh-mo" ||
    raw === "zh-hant"
  ) {
    return "zh-hant";
  }
  if (raw === "zh" || raw.startsWith("zh-")) return "zh";
  const language = raw.split("-")[0] as PlanTemplateLocale;
  return SUPPORTED_LOCALES.has(language) ? language : "en";
}

export function getPlanTemplateCoachFlow(
  localeInput?: unknown,
): PlanTemplateCoachFlow {
  const locale = normalizePlanTemplateLocale(localeInput);
  const content: Record<
    PlanTemplateLocale,
    Omit<PlanTemplateCoachFlow, "runtimeAiCalled" | "aiTokensConsumed">
  > = {
    en: {
      title: "How AI Coach supports you after the plan starts",
      summary:
        "The official plan is your stable starting point. Once training begins, AI Coach uses completed work, load and recovery signals, and schedule changes to suggest adjustments for your approval.",
      stages: [
        {
          id: "TRACK",
          title: "1. Track plan versus reality",
          description:
            "AI Coach compares scheduled sessions with completed, missed or added training, including duration and intensity, so its guidance reflects what you actually did.",
        },
        {
          id: "ASSESS",
          title: "2. Assess load and recovery",
          description:
            "It combines recent workload, perceived effort and available recovery signals to explain whether to continue, ease back or prioritize recovery. It never changes the plan silently.",
        },
        {
          id: "ADJUST",
          title: "3. Propose adjustments for approval",
          description:
            "When fatigue, missed training or schedule changes disrupt the week, AI Coach can propose moving, reducing or replacing sessions, explain the trade-off, and apply changes only after you confirm.",
        },
      ],
    },
    zh: {
      title: "计划开始后，AI 教练如何介入训练",
      summary:
        "官方计划提供稳定的训练起点。开始执行后，AI 教练会结合实际完成情况、负荷与恢复信号和日程变化，提出由你确认的调整建议。",
      stages: [
        {
          id: "TRACK",
          title: "1. 跟踪计划与实际",
          description:
            "AI 教练会对比计划训练与实际完成、错过或额外增加的训练，并关注时长和强度，让后续建议建立在你真正完成的训练上。",
        },
        {
          id: "ASSESS",
          title: "2. 判断负荷与恢复",
          description:
            "它结合近期训练负荷、主观用力程度和已有恢复信号，解释应该继续、降低负荷还是优先恢复；不会在后台静默修改计划。",
        },
        {
          id: "ADJUST",
          title: "3. 提议并确认调整",
          description:
            "当疲劳、漏训或日程变化打乱训练周时，AI 教练可以建议移动、减量或替换训练，说明影响，并且只在你确认后应用调整。",
        },
      ],
    },
    "zh-hant": {
      title: "計畫開始後，AI 教練如何介入訓練",
      summary:
        "官方計畫提供穩定的訓練起點。開始執行後，AI 教練會結合實際完成情況、負荷與恢復訊號和日程變化，提出由你確認的調整建議。",
      stages: [
        {
          id: "TRACK",
          title: "1. 追蹤計畫與實際",
          description:
            "AI 教練會比較計畫訓練與實際完成、錯過或額外增加的訓練，並關注時長和強度，讓後續建議建立在你真正完成的訓練上。",
        },
        {
          id: "ASSESS",
          title: "2. 判斷負荷與恢復",
          description:
            "它結合近期訓練負荷、主觀用力程度和已有恢復訊號，解釋應該繼續、降低負荷還是優先恢復；不會在背景靜默修改計畫。",
        },
        {
          id: "ADJUST",
          title: "3. 提議並確認調整",
          description:
            "當疲勞、漏訓或日程變化打亂訓練週時，AI 教練可以建議移動、減量或替換訓練，說明影響，並且只在你確認後套用調整。",
        },
      ],
    },
    ja: {
      title: "プラン開始後にAIコーチがトレーニングを支える方法",
      summary:
        "公式プランを安定した出発点として、開始後は実際の実施状況、負荷と回復の指標、予定の変化をもとに、確認可能な調整案を提案します。",
      stages: [
        {
          id: "TRACK",
          title: "1. 計画と実績を追跡",
          description:
            "予定した練習と、完了、未実施、追加した練習を時間や強度まで比較し、実際に行った内容に基づいて助言します。",
        },
        {
          id: "ASSESS",
          title: "2. 負荷と回復を判断",
          description:
            "直近の負荷、主観的運動強度、利用可能な回復指標を組み合わせ、継続、負荷軽減、回復優先のどれが適切かを説明します。裏で勝手に変更しません。",
        },
        {
          id: "ADJUST",
          title: "3. 調整案を提示して確認",
          description:
            "疲労、未実施、予定変更で週の流れが崩れたときは、練習の移動、軽減、置換とその影響を提案し、確認後にのみ反映します。",
        },
      ],
    },
  };
  return {
    runtimeAiCalled: false,
    aiTokensConsumed: false,
    ...content[locale],
  };
}

function timeStep(
  minutes: number,
  stepKind: EnduranceWorkRestStep["stepKind"],
): EnduranceWorkRestStep {
  const seconds = Math.round(minutes * 60);
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
  const wholeKilometers = meters % 1000 === 0;
  return {
    duration: wholeKilometers ? 0 : meters,
    stepKind,
    durationMeta: {
      kind: "DISTANCE",
      value: wholeKilometers ? meters / 1000 : meters,
      unit: wholeKilometers ? "KILOMETERS" : "METERS",
    },
  };
}

function definition(blocks: EndurancePlanBlock[]): WorkoutDefinitionInput {
  const structure: EnduranceWorkoutIrV1 = {
    kind: "ENDURANCE",
    version: 1,
    blocks,
  };
  return { kind: "ENDURANCE", version: 1, source: "STRUCTURE", structure };
}

function simpleRun(minutes: number): WorkoutDefinitionInput {
  return definition([
    { type: "work", steps: [timeStep(5, "WARMUP")] },
    { type: "work", steps: [timeStep(minutes, "WORK")] },
    { type: "work", steps: [timeStep(5, "COOLDOWN")] },
  ]);
}

function tempoRun(minutes: number): WorkoutDefinitionInput {
  return definition([
    { type: "work", steps: [timeStep(10, "WARMUP")] },
    { type: "work", steps: [timeStep(minutes, "WORK")] },
    { type: "work", steps: [timeStep(10, "COOLDOWN")] },
  ]);
}

function runWalk(
  repeats: number,
  runMinutes: number,
  walkMinutes: number,
): WorkoutDefinitionInput {
  return definition([
    { type: "work", steps: [timeStep(5, "WARMUP")] },
    {
      type: "repeat",
      count: repeats,
      until: undefined,
      children: [
        { type: "work", steps: [timeStep(runMinutes, "WORK")] },
        { type: "rest", steps: [timeStep(walkMinutes, "RECOVERY")] },
      ],
    },
    { type: "work", steps: [timeStep(5, "COOLDOWN")] },
  ]);
}

function qualityRun(
  repeats: number,
  workMinutes: number,
  recoveryMinutes: number,
): WorkoutDefinitionInput {
  return definition([
    { type: "work", steps: [timeStep(10, "WARMUP")] },
    {
      type: "repeat",
      count: repeats,
      until: undefined,
      children: [
        { type: "work", steps: [timeStep(workMinutes, "WORK")] },
        { type: "rest", steps: [timeStep(recoveryMinutes, "RECOVERY")] },
      ],
    },
    { type: "work", steps: [timeStep(10, "COOLDOWN")] },
  ]);
}

function race5k(): WorkoutDefinitionInput {
  return definition([
    { type: "work", steps: [timeStep(10, "WARMUP")] },
    { type: "work", steps: [distanceStep(5_000, "WORK")] },
    { type: "work", steps: [timeStep(10, "COOLDOWN")] },
  ]);
}

function workoutSourceDsl(input: WorkoutDefinitionInput): string {
  if (input.source !== "STRUCTURE" || input.structure.kind !== "ENDURANCE") {
    throw new Error("Template source DSL requires structured endurance input");
  }
  const stepLine = (step: EnduranceWorkRestStep) => {
    const keyword =
      step.stepKind === "WARMUP"
        ? "warmup"
        : step.stepKind === "RECOVERY" || step.stepKind === "REST"
          ? "recovery"
          : step.stepKind === "COOLDOWN"
            ? "cooldown"
            : "work";
    const duration = step.durationMeta;
    if (duration?.kind === "DISTANCE") {
      if (duration.unit === "KILOMETERS") {
        return `${keyword} ${Number(duration.value)}km`;
      }
      const meters = Number(duration.value ?? step.duration);
      return `${keyword} ${meters % 1000 === 0 ? `${meters / 1000}km` : `${meters}m`}`;
    }
    if (duration?.kind !== "TIME") {
      throw new Error("Template source DSL supports time or distance only");
    }
    const seconds = Number(duration.value ?? step.duration);
    return `${keyword} ${seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`}`;
  };
  const lines: string[] = [];
  for (const block of input.structure.blocks) {
    if (block.type === "repeat") {
      lines.push(`repeat ${block.count} {`);
      for (const child of block.children) {
        for (const step of child.steps) lines.push(`  ${stepLine(step)}`);
      }
      lines.push("}");
      continue;
    }
    for (const step of block.steps) lines.push(stepLine(step));
  }
  return lines.join("\n");
}

const templateCopy: Record<
  Extract<
    RunPlanTemplateKey,
    "RUN_5K_FIRST" | "RUN_5K_FINISH" | "RUN_5K_IMPROVE"
  >,
  Record<PlanTemplateLocale, LocalizedTemplateText>
> = {
  RUN_5K_FIRST: {
    en: {
      title: "First 5K: From Run-Walk Foundations to Continuous Running",
      description:
        "This nine-week plan uses three weekly sessions to help a true beginner complete a first 5K. Weeks 1–6 progressively lengthen relaxed run-walk intervals before weeks 7–8 introduce varied continuous easy runs. Week 9 tapers with two short runs before the final 5K completion session. Keep every run near RPE 3–4 and able to speak in full sentences; slow down or walk when that changes. No pace, heart-rate, power or zone target is required.",
      eligibility:
        "For new or returning runners who cannot yet run continuously for 20 minutes.",
      promise:
        "Finish with durable easy-running habits, not a one-day test of willpower.",
    },
    zh: {
      title: "第一个 5K：从跑走基础到连续跑",
      description:
        "这是一个面向零基础跑者的 9 周计划，每周训练 3 次，目标是完成第一个 5K。第 1–6 周通过轻松跑走交替逐步延长跑步段，第 7–8 周再进入长短不同的连续轻松跑。第 9 周先用两次短时轻松跑减量，再完成最终 5K。所有跑步保持在 RPE 3–4 和能说完整句子的强度；无法完整说话时应降速或步行。计划不要求配速、心率、功率或分区目标。",
      eligibility: "适合零基础、重新开始跑步，或暂时无法连续跑满 20 分钟的人。",
      promise: "目标是建立可持续的轻松跑习惯，而不是靠意志硬撑一次。",
    },
    "zh-hant": {
      title: "第一個 5K：從跑走基礎到連續跑",
      description:
        "這是一個面向零基礎跑者的 9 週計畫，每週訓練 3 次，目標是完成第一個 5K。第 1–6 週透過輕鬆跑走交替逐步延長跑步段，第 7–8 週再進入長短不同的連續輕鬆跑。第 9 週先用兩次短時輕鬆跑減量，再完成最終 5K。所有跑步保持在 RPE 3–4 和能說完整句子的強度；無法完整說話時應降速或步行。計畫不要求配速、心率、功率或分區目標。",
      eligibility: "適合零基礎、重新開始跑步，或暫時無法連續跑滿 20 分鐘的人。",
      promise: "目標是建立可持續的輕鬆跑習慣，而不是靠意志硬撐一次。",
    },
    ja: {
      title: "はじめての5K：ラン・ウォークから連続走へ",
      description:
        "ランニング初心者が最初の5Kを完走するための、週3回・9週間のプランです。1〜6週目は余裕のあるラン・ウォークで走る区間を少しずつ延ばし、7〜8週目に長さの異なる連続イージーランへ移ります。9週目は短い2回のランでテーパーしてから、最後の5K完走セッションを行います。すべてRPE 3〜4で、文章で会話できる余裕を保ち、それが崩れたら速度を落とすか歩きます。ペース、心拍、パワー、ゾーン目標は不要です。",
      eligibility: "初心者、再開ランナー、まだ20分連続で走れない人向けです。",
      promise:
        "一度だけ頑張るのではなく、続けられるイージーラン習慣を作ります。",
    },
  },
  RUN_5K_FINISH: {
    en: {
      title: "Finish Your 5K with an 8-Week Foundation",
      description:
        "Turn an existing 20–30 minute continuous run into a comfortable, confident 5K finish. Each week combines two easy or recovery runs, one controlled steady session and one long run to build aerobic endurance without stacking hard work. The long run builds through weeks 1–3, reduces in week 4, builds again in weeks 5–6 and tapers in week 7 before the final 5K. Use repeatable RPE and talk-test cues when athlete-specific pace or heart-rate evidence is incomplete.",
      eligibility:
        "For runners who can already run continuously for 20–30 minutes and want to complete 5K comfortably.",
      promise:
        "Arrive at 5K day familiar with the distance and able to control the opening effort.",
    },
    zh: {
      title: "8 周打好基础，稳定完成 5K",
      description:
        "把已经具备的 20–30 分钟连续跑能力，发展成舒适、有把握的 5K 完赛能力。每周用两次轻松或恢复跑、一次受控稳定跑和一次长跑构建有氧耐力，同时避免堆叠高强度。长跑在第 1–3 周递增，第 4 周恢复，第 5–6 周再次构建，第 7 周减量，然后完成最终 5K。缺少个人配速或心率证据时，使用可重复的 RPE 和谈话测试。",
      eligibility: "适合已经能连续跑 20–30 分钟，希望舒适完成 5K 的跑者。",
      promise: "在 5K 当天熟悉距离，并能主动控制开局强度。",
    },
    "zh-hant": {
      title: "8 週打好基礎，穩定完成 5K",
      description:
        "把已具備的 20–30 分鐘連續跑能力，發展成舒適、有把握的 5K 完賽能力。每週用兩次輕鬆或恢復跑、一次受控穩定跑和一次長跑構建有氧耐力，同時避免堆疊高強度。長跑在第 1–3 週遞增，第 4 週恢復，第 5–6 週再次構建，第 7 週減量，然後完成最終 5K。缺少個人配速或心率證據時，使用可重複的 RPE 和談話測試。",
      eligibility: "適合已能連續跑 20–30 分鐘，希望舒適完成 5K 的跑者。",
      promise: "在 5K 當天熟悉距離，並能主動控制開局強度。",
    },
    ja: {
      title: "8週間の土台で、5Kを安定して完走",
      description:
        "すでに走れる20〜30分の連続走を、余裕と自信を持って5Kを完走する力へつなげます。週2回のイージーまたはリカバリー走、1回のコントロールしたステディ走、1回のロング走で、ハードな負荷を重ねずに有酸素持久力を伸ばします。ロング走は1〜3週目に伸ばし、4週目に回復、5〜6週目に再構築、7週目にテーパーして最後の5Kへ進みます。個人のペースや心拍の根拠が弱い場合は、再現できるRPEと会話テストを使います。",
      eligibility:
        "すでに20〜30分連続で走れ、5Kを余裕を持って完走したい人向けです。",
      promise:
        "5K当日は距離に慣れ、序盤の強度を自分で管理できる状態を目指します。",
    },
  },
  RUN_5K_IMPROVE: {
    en: {
      title: "8-Week 5K Performance Builder",
      description:
        "Build a stronger 5K with two easy aerobic runs, one controlled quality session and one long run each week. Odd weeks use repeatable intervals and even weeks use controlled tempo running, with an easy day separating quality from the long run. Week 4 reduces load, weeks 5–6 rebuild, week 7 tapers and week 8 ends with a 5K effort. A reliable recent 5K result may anchor training pace through the existing VDOT model; without that evidence, the plan uses RPE instead of invented targets.",
      eligibility:
        "For consistent runners with a recent 5K benchmark who can train four days per week.",
      promise:
        "Improve the ability to hold a controlled hard effort without sacrificing aerobic consistency.",
    },
    zh: {
      title: "8 周 5K 进阶计划",
      description:
        "每周用两次轻松有氧跑、一次受控质量课和一次长跑提升 5K 表现。单数周安排可重复间歇，双数周安排受控节奏跑，并用轻松日隔开质量课和长跑。第 4 周降低负荷，第 5–6 周重新构建，第 7 周减量，第 8 周完成 5K。有可靠近期 5K 成绩时，可沿用现有 VDOT 模型生成训练配速；证据不足时使用 RPE，不编造目标。",
      eligibility: "适合训练稳定、有近期 5K 成绩，并能每周跑四天的跑者。",
      promise: "在不牺牲有氧连续性的前提下，提高维持受控高强度的能力。",
    },
    "zh-hant": {
      title: "8 週 5K 表現提升計畫",
      description:
        "每週用兩次輕鬆有氧跑、一次受控品質課和一次長跑提升 5K 表現。單數週安排可重複間歇，雙數週安排受控節奏跑，並用輕鬆日隔開品質課和長跑。第 4 週降低負荷，第 5–6 週重新構建，第 7 週減量，第 8 週完成 5K。有可靠近期 5K 成績時，可沿用既有 VDOT 模型生成訓練配速；證據不足時使用 RPE，不編造目標。",
      eligibility: "適合訓練穩定、有近期 5K 成績，並能每週跑四天的跑者。",
      promise: "在不犧牲有氧連續性的前提下，提高維持受控高強度的能力。",
    },
    ja: {
      title: "8週間 5Kパフォーマンス向上プラン",
      description:
        "週2回のイージー有酸素走、1回のコントロールした質の高い練習、1回のロング走で5Kの走力を伸ばします。奇数週は再現できるインターバル、偶数週はコントロールしたテンポ走を行い、質の高い練習とロング走の間にはイージー日を置きます。4週目に負荷を下げ、5〜6週目に再構築、7週目にテーパーし、8週目に5Kを走ります。信頼できる最近の5K結果があれば既存VDOTモデルでペースを設定し、根拠がなければ架空の目標を作らずRPEを使います。",
      eligibility:
        "継続的に走っており、最近の5K記録があり、週4日走れる人向けです。",
      promise:
        "有酸素の継続性を失わず、コントロールした高強度を維持する力を伸ばします。",
    },
  },
};

const phaseText: Record<
  PlanTemplateLocale,
  Record<PlanTemplatePhase, string>
> = {
  en: {
    START: "Start",
    BASE: "Base",
    BUILD: "Build",
    RECOVERY: "Recovery",
    PEAK: "Peak",
    RACE: "5K week",
  },
  zh: {
    START: "起步",
    BASE: "基础",
    BUILD: "构建",
    RECOVERY: "恢复",
    PEAK: "峰值",
    RACE: "5K 周",
  },
  "zh-hant": {
    START: "起步",
    BASE: "基礎",
    BUILD: "構建",
    RECOVERY: "恢復",
    PEAK: "峰值",
    RACE: "5K 週",
  },
  ja: {
    START: "開始",
    BASE: "基礎",
    BUILD: "強化",
    RECOVERY: "回復",
    PEAK: "ピーク",
    RACE: "5K週",
  },
};

type WorkoutKind = PlanTemplateWorkoutKind;

function rpeRangeFor(
  key: RunPlanTemplateKey,
  kind: WorkoutKind,
): { min: number; max: number } {
  if (kind === "RUN_WALK" || kind === "EASY" || kind === "LONG") {
    return { min: 3, max: 4 };
  }
  if (kind === "STEADY") return { min: 5, max: 6 };
  if (kind === "TEMPO") return { min: 6, max: 7 };
  if (kind === "INTERVAL") return { min: 7, max: 8 };
  if (key === "RUN_5K_FIRST") return { min: 3, max: 4 };
  if (key === "RUN_5K_FINISH") return { min: 5, max: 6 };
  return { min: 8, max: 9 };
}

function rpeRangeLabel(range: { min: number; max: number }) {
  return range.min === range.max
    ? String(range.min)
    : `${range.min}–${range.max}`;
}

function minutesLabel(seconds: number, locale: PlanTemplateLocale) {
  const minutes = Math.round((seconds / 60) * 10) / 10;
  return locale === "en"
    ? `${minutes} min`
    : locale === "ja"
      ? `${minutes}分`
      : locale === "zh-hant"
        ? `${minutes} 分鐘`
        : `${minutes} 分钟`;
}

function workoutPrescription(
  definition: WorkoutDefinitionInput,
  kind: WorkoutKind,
  locale: PlanTemplateLocale,
) {
  if (
    definition.source !== "STRUCTURE" ||
    definition.structure.kind !== "ENDURANCE"
  )
    return "";
  const blocks = definition.structure.blocks;
  const repeat = blocks.find((block) => block.type === "repeat");
  if (repeat?.type === "repeat") {
    const work = repeat.children.find((block) => block.type === "work")
      ?.steps[0];
    const recovery = repeat.children.find((block) => block.type === "rest")
      ?.steps[0];
    if (work && recovery) {
      const workText = minutesLabel(work.duration, locale);
      const recoveryText = minutesLabel(recovery.duration, locale);
      if (locale === "en")
        return `${repeat.count}×(${workText} work / ${recoveryText} recovery)`;
      if (locale === "ja")
        return `${repeat.count}×（${workText}走る／${recoveryText}回復）`;
      return `${repeat.count}×（跑 ${workText} / 恢复 ${recoveryText}）`;
    }
  }
  const main = blocks
    .flatMap((block) => (block.type === "work" ? block.steps : []))
    .find((step) => step.stepKind === "WORK");
  if (!main) return "";
  if (main.durationMeta?.kind === "DISTANCE") return "5K";
  const duration = minutesLabel(main.duration, locale);
  if (kind === "RACE") return "5K";
  return duration;
}

function workoutExecution(
  definition: WorkoutDefinitionInput,
  kind: WorkoutKind,
  locale: PlanTemplateLocale,
) {
  const prescription = workoutPrescription(definition, kind, locale);
  const warmup =
    kind === "INTERVAL" || kind === "TEMPO" ? 10 : kind === "RACE" ? 10 : 5;
  const cooldown = warmup;
  if (locale === "en")
    return `Warm up easily for ${warmup} minutes, complete ${prescription}, then cool down easily for ${cooldown} minutes.`;
  if (locale === "ja")
    return `${warmup}分イージーにウォームアップし、${prescription}を行い、最後に${cooldown}分イージーにクールダウンします。`;
  if (locale === "zh-hant")
    return `先輕鬆熱身 ${warmup} 分鐘，完成 ${prescription}，最後輕鬆冷身 ${cooldown} 分鐘。`;
  return `先轻松热身 ${warmup} 分钟，完成 ${prescription}，最后轻松冷身 ${cooldown} 分钟。`;
}

function workoutCopy(
  kind: WorkoutKind,
  week: number,
  slot: number,
  rpeRange: { min: number; max: number },
  definition: WorkoutDefinitionInput,
): Record<PlanTemplateLocale, LocalizedWorkoutText> {
  const rpe = rpeRangeLabel(rpeRange);
  const names: Record<PlanTemplateLocale, Record<WorkoutKind, string>> = {
    en: {
      RUN_WALK: "Easy run-walk",
      EASY: "Conversational easy run",
      STEADY: "Controlled steady run",
      INTERVAL: "Repeatable intervals",
      TEMPO: "Controlled tempo",
      LONG: "Long easy run",
      RACE: "5K completion run",
    },
    zh: {
      RUN_WALK: "轻松跑走交替",
      EASY: "对话强度轻松跑",
      STEADY: "受控稳定跑",
      INTERVAL: "可重复间歇跑",
      TEMPO: "受控节奏跑",
      LONG: "长距离轻松跑",
      RACE: "5K 完赛跑",
    },
    "zh-hant": {
      RUN_WALK: "輕鬆跑走交替",
      EASY: "對話強度輕鬆跑",
      STEADY: "受控穩定跑",
      INTERVAL: "可重複間歇跑",
      TEMPO: "受控節奏跑",
      LONG: "長距離輕鬆跑",
      RACE: "5K 完賽跑",
    },
    ja: {
      RUN_WALK: "イージー・ランウォーク",
      EASY: "会話できるイージーラン",
      STEADY: "コントロール・ステディ走",
      INTERVAL: "再現できるインターバル",
      TEMPO: "コントロール・テンポ走",
      LONG: "ロング・イージーラン",
      RACE: "5K完走ラン",
    },
  };
  const detail =
    kind === "RUN_WALK"
      ? {
          en: `Keep every run segment at RPE ${rpe}/10 and able to speak in full sentences. Walk briskly during recovery, finish with energy in reserve, and stop if pain changes your stride.`,
          zh: `跑段保持 RPE ${rpe}/10，并能说出完整句子；恢复段快走。结束时应保留余力；如果疼痛改变跑姿，应停止训练。`,
          "zh-hant": `跑段保持 RPE ${rpe}/10，並能說出完整句子；恢復段快走。結束時應保留餘力；如果疼痛改變跑姿，應停止訓練。`,
          ja: `走る区間はRPE ${rpe}/10で、文章で会話できる余裕を保ちます。回復は速歩きにし、余力を残して終え、痛みでフォームが変わる場合は中止します。`,
        }
      : kind === "INTERVAL" || kind === "TEMPO" || kind === "STEADY"
        ? {
            en: `Hold a controlled RPE ${rpe}/10 rather than racing the workout. Keep the final repeat as smooth as the first; use RPE when no reliable pace anchor is available.`,
            zh: `保持受控的 RPE ${rpe}/10，不要把训练当比赛。最后一组应与第一组同样流畅；没有可靠配速锚点时以 RPE 为准。`,
            "zh-hant": `保持受控的 RPE ${rpe}/10，不要把訓練當比賽。最後一組應與第一組同樣流暢；沒有可靠配速錨點時以 RPE 為準。`,
            ja: `練習をレースにせず、RPE ${rpe}/10に抑えます。最後の反復も最初と同じ滑らかさを保ち、信頼できるペース基準がなければRPEを使います。`,
          }
        : {
            en: `Stay near RPE ${rpe}/10 and keep breathing conversational. Slow down for heat, hills or accumulated fatigue, and do not make up missed training by stacking sessions.`,
            zh: `保持约 RPE ${rpe}/10 和可对话呼吸。炎热、坡度或累积疲劳时主动降速，不要通过连续堆叠训练补课。`,
            "zh-hant": `保持約 RPE ${rpe}/10 和可對話呼吸。炎熱、坡度或累積疲勞時主動降速，不要透過連續堆疊訓練補課。`,
            ja: `RPE ${rpe}/10前後で会話できる呼吸を保ちます。暑さ、坂、蓄積疲労に合わせて落とし、欠けた練習を連続で詰め込みません。`,
          };
  return {
    en: {
      name: `${names.en[kind]} · ${workoutPrescription(definition, kind, "en")}`,
      notes: `${workoutExecution(definition, kind, "en")} ${detail.en}`,
    },
    zh: {
      name: `${names.zh[kind]} · ${workoutPrescription(definition, kind, "zh")}`,
      notes: `${workoutExecution(definition, kind, "zh")} ${detail.zh}`,
    },
    "zh-hant": {
      name: `${names["zh-hant"][kind]} · ${workoutPrescription(definition, kind, "zh-hant")}`,
      notes: `${workoutExecution(definition, kind, "zh-hant")} ${detail["zh-hant"]}`,
    },
    ja: {
      name: `${names.ja[kind]} · ${workoutPrescription(definition, kind, "ja")}`,
      notes: `${workoutExecution(definition, kind, "ja")} ${detail.ja}`,
    },
  };
}

function workout(args: {
  key: RunPlanTemplateKey;
  week: number;
  slot: number;
  phase: PlanTemplatePhase;
  kind: WorkoutKind;
  rpe: number;
  definition: WorkoutDefinitionInput;
  quality?: boolean;
}): PlanTemplateWorkout {
  const plannedRpeRange = rpeRangeFor(args.key, args.kind);
  return {
    semanticId: `${args.key.toLowerCase()}.w${args.week}.s${args.slot}`,
    weekIndex: args.week,
    slotIndex: args.slot,
    phase: args.phase,
    quality: args.quality === true,
    sportType: "RUN",
    intensityKind: args.kind,
    plannedRpe: args.rpe,
    plannedRpeRange,
    sourceDsl: workoutSourceDsl(args.definition),
    definition: args.definition,
    copy: workoutCopy(
      args.kind,
      args.week,
      args.slot,
      plannedRpeRange,
      args.definition,
    ),
  };
}

function formatPaceSeconds(seconds: number) {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function speedTargetFromDefinition(input: WorkoutDefinitionInput) {
  if (input.source !== "STRUCTURE" || input.structure.kind !== "ENDURANCE") {
    return null;
  }
  const visit = (
    blocks: EndurancePlanBlock[],
  ): EnduranceWorkRestStep["primaryTargetMeta"] | null => {
    for (const block of blocks) {
      if (block.type === "repeat") {
        const nested = visit(block.children);
        if (nested) return nested;
        continue;
      }
      for (const step of block.steps) {
        if (
          step.stepKind === "WORK" &&
          step.primaryTargetMeta?.kind === "SPEED" &&
          Number.isFinite(step.primaryTargetMeta.value) &&
          Number.isFinite(step.primaryTargetMeta.valueHigh)
        ) {
          return step.primaryTargetMeta;
        }
      }
    }
    return null;
  };
  return visit(input.structure.blocks);
}

export function getPlanTemplateIntensityGuidance(args: {
  workout: PlanTemplateWorkout;
  locale?: unknown;
  definition?: WorkoutDefinitionInput;
}): PlanTemplateIntensityGuidance {
  const locale = normalizePlanTemplateLocale(args.locale);
  const range = args.workout.plannedRpeRange;
  const rpeDisplay = `RPE ${rpeRangeLabel(range)}`;
  const speed = speedTargetFromDefinition(
    args.definition ?? args.workout.definition,
  );
  const rawSpeedSource = String(speed?.zoneBasis?.source ?? "RECENT_5K");
  // Old generated workouts may have persisted VDOT as a source label. VDOT
  // is now the display/model name for the canonical VO2_MAX profile metric,
  // so never expose it as a second plan-capability source.
  const speedSource = (rawSpeedSource === "VDOT"
    ? "VO2_MAX"
    : rawSpeedSource) as
    | "RECENT_5K"
    | "PUBLIC_EXAMPLE"
    | "VO2_MAX"
    | "RECENT_RACE"
    | "TP"
    | "CS"
    | "GOAL_RACE_PACE";
  const fullSentence =
    range.max <= 4 ||
    args.workout.intensityKind === "RUN_WALK" ||
    args.workout.intensityKind === "LONG";
  const shortSentence = range.max <= 6;
  const talkTest: Record<PlanTemplateLocale, string> = fullSentence
    ? {
        en: "You should be able to speak in full sentences.",
        zh: "应能说出完整句子；做不到就降速或步行。",
        "zh-hant": "應能說出完整句子；做不到就降速或步行。",
        ja: "文章で会話できる余裕を保ち、難しければ速度を落とすか歩きます。",
      }
    : shortSentence
      ? {
          en: "Short sentences should remain possible while effort stays controlled.",
          zh: "应还能说出短句，并始终保持受控。",
          "zh-hant": "應還能說出短句，並始終保持受控。",
          ja: "短い文で話せる範囲に保ち、強度をコントロールします。",
        }
      : {
          en: "Only a few words should be comfortable during work; recover enough to repeat the effort smoothly.",
          zh: "工作段通常只能说少量词语；恢复要足以让下一组保持流畅。",
          "zh-hant": "工作段通常只能說少量詞語；恢復要足以讓下一組保持流暢。",
          ja: "疾走中は数語だけ話せる強度にし、次も滑らかに反復できるまで回復します。",
        };
  const fallbackSummary: Record<PlanTemplateLocale, string> =
    args.workout.semanticId.startsWith("run_5k_improve") && args.workout.quality
      ? {
          en: "No reliable recent 5K anchor is available, so this quality session uses RPE and the talk test instead of an invented pace.",
          zh: "当前没有可靠的近期 5K 配速锚点，因此这节质量课使用 RPE 和谈话测试，不编造配速。",
          "zh-hant":
            "目前沒有可靠的近期 5K 配速錨點，因此這節品質課使用 RPE 和談話測試，不編造配速。",
          ja: "信頼できる直近5Kの基準がないため、架空のペースではなくRPEと会話テストを使います。",
        }
      : {
          en: "Use RPE and the talk test as the primary intensity controls.",
          zh: "以 RPE 和谈话测试共同控制强度。",
          "zh-hant": "以 RPE 和談話測試共同控制強度。",
          ja: "RPEと会話テストを主な強度基準にします。",
        };
  const guidance: PlanTemplateIntensityGuidance = {
    basis: !speed
      ? "RPE_TALK_TEST"
      : speedSource === "PUBLIC_EXAMPLE"
        ? "PUBLIC_EXAMPLE"
        : speedSource === "GOAL_RACE_PACE"
          ? "GOAL_RACE_PACE"
          : speedSource === "RECENT_5K"
            ? "VDOT_RECENT_5K"
            : "PERSONAL_CAPABILITY",
    rpe: { ...range, display: rpeDisplay },
    talkTest: talkTest[locale],
    summary: fallbackSummary[locale],
  };
  if (!speed?.value || !speed.valueHigh) return guidance;
  const fastSecPerKm = Number(speed.value);
  const slowSecPerKm = Number(speed.valueHigh);
  const paceLabel = `${formatPaceSeconds(fastSecPerKm)}–${formatPaceSeconds(slowSecPerKm)}`;
  const display =
    locale === "en"
      ? `${paceLabel} min/km`
      : locale === "ja"
        ? `${paceLabel} 分/km`
        : `${paceLabel} 分/公里`;
  const zone = [speed.zoneSystem, speed.zoneLabel].filter(Boolean).join(" ");
  const sourceLabels: Record<
    typeof speedSource,
    Record<PlanTemplateLocale, string>
  > = {
    RECENT_5K: {
      en: "a recent 5K result",
      zh: "近期 5K 成绩",
      "zh-hant": "近期 5K 成績",
      ja: "直近5K",
    },
    PUBLIC_EXAMPLE: {
      en: "the public VO₂max 40 example",
      zh: "公开最大摄氧量 40 示例",
      "zh-hant": "公開最大攝氧量 40 範例",
      ja: "公開VO₂max 40例",
    },
    VO2_MAX: {
      en: "the latest VO₂max estimate",
      zh: "最新最大摄氧量估算值",
      "zh-hant": "最新最大攝氧量估算值",
      ja: "最新のVO₂max推定値",
    },
    RECENT_RACE: {
      en: "a recent race or test",
      zh: "近期比赛或测试",
      "zh-hant": "近期比賽或測試",
      ja: "直近のレースまたはテスト",
    },
    TP: {
      en: "the saved threshold pace",
      zh: "已保存的阈值配速",
      "zh-hant": "已儲存的閾值配速",
      ja: "保存済み閾値ペース",
    },
    CS: {
      en: "the saved critical speed",
      zh: "已保存的临界速度",
      "zh-hant": "已儲存的臨界速度",
      ja: "保存済みクリティカルスピード",
    },
    GOAL_RACE_PACE: {
      en: "the qualified goal race",
      zh: "已通过支持性校验的目标赛事",
      "zh-hant": "已通過支持性校驗的目標賽事",
      ja: "適格と判定された目標レース",
    },
  };
  const paceSummary: Record<PlanTemplateLocale, string> = {
    en: `The work segments use ${zone || "running"} pace resolved from ${sourceLabels[speedSource].en}; RPE remains a safety check for heat, hills and fatigue.`,
    zh: `工作段采用根据${sourceLabels[speedSource].zh}解析的${zone || "跑步"}配速；遇到高温、坡度或疲劳时，仍以 RPE 作为安全校验。`,
    "zh-hant": `工作段採用根據${sourceLabels[speedSource]["zh-hant"]}解析的${zone || "跑步"}配速；遇到高溫、坡度或疲勞時，仍以 RPE 作為安全校驗。`,
    ja: `疾走区間は${sourceLabels[speedSource].ja}から解決した${zone || "ランニング"}ペースを使い、暑さ、坂、疲労時はRPEを安全基準にします。`,
  };
  return {
    ...guidance,
    summary: paceSummary[locale],
    pace: {
      fastSecPerKm,
      slowSecPerKm,
      display,
      zoneLabel: speed.zoneLabel,
      zoneSystem: speed.zoneSystem,
      source: speedSource,
    },
  };
}

type FirstWeekSpec =
  | {
      type: "rw";
      repeats: number;
      run: number;
      walk: number;
      phase: PlanTemplatePhase;
    }
  | {
      type: "run";
      minutes: number | readonly [number, number, number];
      phase: PlanTemplatePhase;
    }
  | {
      type: "race";
      taperMinutes?: readonly [number, number];
      phase: PlanTemplatePhase;
    };

const firstProfiles: Record<string, FirstWeekSpec[]> = {
  "8-week": [
    { type: "rw", repeats: 8, run: 1, walk: 1.5, phase: "START" },
    { type: "rw", repeats: 6, run: 2, walk: 2, phase: "START" },
    { type: "rw", repeats: 5, run: 3, walk: 2, phase: "BASE" },
    { type: "rw", repeats: 4, run: 5, walk: 2, phase: "BASE" },
    { type: "rw", repeats: 3, run: 8, walk: 2, phase: "BUILD" },
    { type: "run", minutes: 22, phase: "BUILD" },
    { type: "run", minutes: 30, phase: "PEAK" },
    { type: "race", phase: "RACE" },
  ],
  "9-week": [
    { type: "rw", repeats: 6, run: 1, walk: 2, phase: "START" },
    { type: "rw", repeats: 7, run: 1, walk: 2, phase: "START" },
    { type: "rw", repeats: 6, run: 2, walk: 2, phase: "BASE" },
    { type: "rw", repeats: 5, run: 3, walk: 2, phase: "BASE" },
    { type: "rw", repeats: 4, run: 4, walk: 2, phase: "BUILD" },
    { type: "rw", repeats: 4, run: 5, walk: 2, phase: "BUILD" },
    { type: "run", minutes: [15, 20, 25], phase: "BUILD" },
    { type: "run", minutes: [20, 25, 30], phase: "PEAK" },
    { type: "race", taperMinutes: [15, 15], phase: "RACE" },
  ],
  "10-week": [
    { type: "rw", repeats: 8, run: 1, walk: 2, phase: "START" },
    { type: "rw", repeats: 7, run: 1.5, walk: 2, phase: "START" },
    { type: "rw", repeats: 6, run: 2, walk: 2, phase: "BASE" },
    { type: "rw", repeats: 5, run: 3, walk: 2, phase: "BASE" },
    { type: "rw", repeats: 4, run: 4, walk: 2, phase: "BASE" },
    { type: "rw", repeats: 4, run: 5, walk: 2.5, phase: "BUILD" },
    { type: "rw", repeats: 3, run: 8, walk: 3, phase: "BUILD" },
    { type: "run", minutes: 22, phase: "BUILD" },
    { type: "run", minutes: 30, phase: "PEAK" },
    { type: "race", phase: "RACE" },
  ],
  "12-week": [
    { type: "rw", repeats: 8, run: 0.5, walk: 2, phase: "START" },
    { type: "rw", repeats: 8, run: 1, walk: 2, phase: "START" },
    { type: "rw", repeats: 7, run: 1.5, walk: 2, phase: "START" },
    { type: "rw", repeats: 6, run: 2, walk: 2, phase: "BASE" },
    { type: "rw", repeats: 5, run: 3, walk: 2, phase: "BASE" },
    { type: "rw", repeats: 4, run: 4, walk: 2, phase: "BASE" },
    { type: "rw", repeats: 4, run: 5, walk: 2.5, phase: "BUILD" },
    { type: "rw", repeats: 3, run: 7, walk: 3, phase: "BUILD" },
    { type: "rw", repeats: 3, run: 9, walk: 3, phase: "BUILD" },
    { type: "run", minutes: 22, phase: "BUILD" },
    { type: "run", minutes: 30, phase: "PEAK" },
    { type: "race", phase: "RACE" },
  ],
};

function firstRunMinutes(
  spec: Extract<FirstWeekSpec, { type: "run" }>,
): readonly [number, number, number] {
  if (Array.isArray(spec.minutes)) {
    return spec.minutes as readonly [number, number, number];
  }
  const longest = spec.minutes as number;
  return [Math.max(15, longest - 6), Math.max(15, longest - 3), longest];
}

function firstWeekCopy(
  weekIndex: number,
  spec: FirstWeekSpec,
): PlanTemplateWeek["copy"] {
  if (spec.type === "rw") {
    return {
      en: {
        title: `Week ${weekIndex}: ${spec.run}-minute run-walk blocks`,
        description: `Complete ${spec.repeats} relaxed rounds of ${spec.run} minutes running and ${spec.walk} minutes walking. Keep every run segment at RPE 3–4 and able to speak in full sentences.`,
      },
      zh: {
        title: `第 ${weekIndex} 周：${spec.run} 分钟跑走训练`,
        description: `轻松完成 ${spec.repeats} 组跑 ${spec.run} 分钟、走 ${spec.walk} 分钟。跑步段保持 RPE 3–4，并能说出完整句子。`,
      },
      "zh-hant": {
        title: `第 ${weekIndex} 週：${spec.run} 分鐘跑走訓練`,
        description: `輕鬆完成 ${spec.repeats} 組跑 ${spec.run} 分鐘、走 ${spec.walk} 分鐘。跑步段保持 RPE 3–4，並能說出完整句子。`,
      },
      ja: {
        title: `${weekIndex}週目：${spec.run}分のラン・ウォーク`,
        description: `${spec.run}分走って${spec.walk}分歩くセットを、余裕を保って${spec.repeats}回行います。走る区間はRPE 3〜4で、文章で会話できる強度を守ります。`,
      },
    };
  }
  if (spec.type === "run") {
    const minutes = firstRunMinutes(spec);
    return {
      en: {
        title: `Week ${weekIndex}: Continuous easy running`,
        description: `Run continuously for ${minutes.join(", ")} minutes across the three sessions, shortest to longest. Stay at RPE 3–4 and add a short walk if full-sentence conversation becomes difficult.`,
      },
      zh: {
        title: `第 ${weekIndex} 周：连续轻松跑`,
        description: `三次训练依次连续跑 ${minutes.join("、")} 分钟，由短到长。保持 RPE 3–4；无法说完整句子时可以短暂步行。`,
      },
      "zh-hant": {
        title: `第 ${weekIndex} 週：連續輕鬆跑`,
        description: `三次訓練依次連續跑 ${minutes.join("、")} 分鐘，由短到長。保持 RPE 3–4；無法說完整句子時可以短暫步行。`,
      },
      ja: {
        title: `${weekIndex}週目：連続イージーラン`,
        description: `3回の練習で${minutes.join("・")}分を短い順に連続して走ります。RPE 3〜4を守り、文章で会話しにくくなったら短く歩いて構いません。`,
      },
    };
  }
  const taper = spec.taperMinutes ?? [18, 18];
  return {
    en: {
      title: `Week ${weekIndex}: Taper and first 5K`,
      description: `Run easily for ${taper[0]} and ${taper[1]} minutes, then complete 5K at RPE 3–4. Walking breaks are allowed; finishing the distance comfortably matters more than pace.`,
    },
    zh: {
      title: `第 ${weekIndex} 周：减量并完成第一个 5K`,
      description: `先轻松跑 ${taper[0]} 和 ${taper[1]} 分钟，再以 RPE 3–4 完成 5K。允许步行恢复；舒适完成距离比配速更重要。`,
    },
    "zh-hant": {
      title: `第 ${weekIndex} 週：減量並完成第一個 5K`,
      description: `先輕鬆跑 ${taper[0]} 和 ${taper[1]} 分鐘，再以 RPE 3–4 完成 5K。允許步行恢復；舒適完成距離比配速更重要。`,
    },
    ja: {
      title: `${weekIndex}週目：テーパーとはじめての5K`,
      description: `先に${taper[0]}分と${taper[1]}分のイージーランを行い、その後RPE 3〜4で5Kを完走します。歩きを入れてもよく、ペースより余裕を持って距離を終えることを優先します。`,
    },
  };
}

function buildFirstVariant(
  id: string,
  profile: FirstWeekSpec[],
): PlanTemplateVariant {
  const workouts: PlanTemplateWorkout[] = [];
  profile.forEach((spec, index) => {
    const week = index + 1;
    for (let slot = 1; slot <= 3; slot += 1) {
      const isRace = spec.type === "race" && slot === 3;
      const workoutDefinition = isRace
        ? race5k()
        : spec.type === "rw"
          ? runWalk(spec.repeats, spec.run, spec.walk)
          : simpleRun(
              spec.type === "run"
                ? firstRunMinutes(spec)[slot - 1]
                : (spec.taperMinutes?.[slot - 1] ?? 18),
            );
      workouts.push(
        workout({
          key: "RUN_5K_FIRST",
          week,
          slot,
          phase: spec.phase,
          kind: isRace ? "RACE" : spec.type === "rw" ? "RUN_WALK" : "EASY",
          rpe: 4,
          definition: workoutDefinition,
        }),
      );
    }
  });
  return {
    id,
    periodWeeks: profile.length,
    trainingDaysPerWeek: 3,
    weeks: profile.map((spec, index) => ({
      weekIndex: index + 1,
      phase: spec.phase,
      copy: firstWeekCopy(index + 1, spec),
    })),
    workouts,
  };
}

function finishWeekCopy(args: {
  weekIndex: number;
  phase: PlanTemplatePhase;
  easyMinutes: number;
  steadyMinutes: number;
  longMinutes: number;
}): PlanTemplateWeek["copy"] {
  const finalWeek = args.weekIndex === 8;
  const enSessions = finalWeek
    ? `${args.easyMinutes}-minute easy run, ${args.steadyMinutes}-minute controlled run, 20-minute recovery run, then 5K`
    : `${args.easyMinutes}-minute easy run, ${args.steadyMinutes}-minute controlled run, 20-minute recovery run and ${args.longMinutes}-minute long run`;
  const zhSessions = finalWeek
    ? `${args.easyMinutes} 分钟轻松跑、${args.steadyMinutes} 分钟受控跑、20 分钟恢复跑，然后完成 5K`
    : `${args.easyMinutes} 分钟轻松跑、${args.steadyMinutes} 分钟受控跑、20 分钟恢复跑和 ${args.longMinutes} 分钟长跑`;
  const zhHantSessions = finalWeek
    ? `${args.easyMinutes} 分鐘輕鬆跑、${args.steadyMinutes} 分鐘受控跑、20 分鐘恢復跑，然後完成 5K`
    : `${args.easyMinutes} 分鐘輕鬆跑、${args.steadyMinutes} 分鐘受控跑、20 分鐘恢復跑和 ${args.longMinutes} 分鐘長跑`;
  const jaSessions = finalWeek
    ? `${args.easyMinutes}分イージー、${args.steadyMinutes}分コントロール、20分リカバリーの後に5K`
    : `${args.easyMinutes}分イージー、${args.steadyMinutes}分コントロール、20分リカバリー、${args.longMinutes}分ロング`;
  return {
    en: {
      title: `Week ${args.weekIndex}: ${phaseText.en[args.phase]}`,
      description: `Complete a ${enSessions}. Keep easy and long running conversational; the controlled session should stay repeatable rather than all-out.`,
    },
    zh: {
      title: `第 ${args.weekIndex} 周：${phaseText.zh[args.phase]}`,
      description: `完成${zhSessions}。轻松跑和长跑保持可对话；受控训练应能稳定重复，而不是全力完成。`,
    },
    "zh-hant": {
      title: `第 ${args.weekIndex} 週：${phaseText["zh-hant"][args.phase]}`,
      description: `完成${zhHantSessions}。輕鬆跑和長跑保持可對話；受控訓練應能穩定重複，而不是全力完成。`,
    },
    ja: {
      title: `${args.weekIndex}週目：${phaseText.ja[args.phase]}`,
      description: `${jaSessions}を行います。イージーとロングは会話できる強度を守り、コントロール走は全力にせず再現できる余裕を残します。`,
    },
  };
}

function buildFinishVariant(): PlanTemplateVariant {
  const phases: PlanTemplatePhase[] = [
    "BASE",
    "BASE",
    "BUILD",
    "RECOVERY",
    "BUILD",
    "PEAK",
    "PEAK",
    "RACE",
  ];
  const easy = [20, 25, 25, 20, 30, 30, 25, 20];
  const steady = [20, 20, 25, 20, 25, 20, 20, 20];
  const recovery = [20, 20, 20, 20, 20, 20, 20, 20];
  const long = [25, 30, 35, 30, 40, 45, 30, 0];
  const workouts: PlanTemplateWorkout[] = [];
  phases.forEach((phase, index) => {
    const week = index + 1;
    const specs: Array<[WorkoutKind, number, WorkoutDefinitionInput, boolean]> =
      [
        ["EASY", 3, simpleRun(easy[index]), false],
        ["STEADY", 5, simpleRun(steady[index]), true],
        ["EASY", 3, simpleRun(recovery[index]), false],
        [
          week === 8 ? "RACE" : "LONG",
          week === 8 ? 6 : 4,
          week === 8 ? race5k() : simpleRun(long[index]),
          week === 8,
        ],
      ];
    specs.forEach(([kind, rpe, workoutDefinition, quality], slotIndex) =>
      workouts.push(
        workout({
          key: "RUN_5K_FINISH",
          week,
          slot: slotIndex + 1,
          phase,
          kind,
          rpe,
          definition: workoutDefinition,
          quality,
        }),
      ),
    );
  });
  return {
    id: "standard",
    periodWeeks: 8,
    trainingDaysPerWeek: 4,
    weeks: phases.map((phase, index) => ({
      weekIndex: index + 1,
      phase,
      copy: finishWeekCopy({
        weekIndex: index + 1,
        phase,
        easyMinutes: easy[index],
        steadyMinutes: steady[index],
        longMinutes: long[index],
      }),
    })),
    workouts,
  };
}

type ImproveQualitySpec =
  | { kind: "INTERVAL"; repeats: number; work: number; recovery: number }
  | { kind: "TEMPO"; minutes: number };

function improveWeekCopy(args: {
  weekIndex: number;
  phase: PlanTemplatePhase;
  easyMinutes: number;
  recoveryMinutes: number;
  longMinutes: number;
  quality: ImproveQualitySpec;
}): PlanTemplateWeek["copy"] {
  const finalWeek = args.weekIndex === 8;
  const qualityEn =
    args.quality.kind === "INTERVAL"
      ? `${args.quality.repeats}×(${args.quality.work}-minute interval / ${args.quality.recovery}-minute recovery)`
      : `${args.quality.minutes}-minute tempo`;
  const qualityZh =
    args.quality.kind === "INTERVAL"
      ? `${args.quality.repeats}×（${args.quality.work} 分钟间歇 / ${args.quality.recovery} 分钟恢复）`
      : `${args.quality.minutes} 分钟节奏跑`;
  const qualityZhHant =
    args.quality.kind === "INTERVAL"
      ? `${args.quality.repeats}×（${args.quality.work} 分鐘間歇 / ${args.quality.recovery} 分鐘恢復）`
      : `${args.quality.minutes} 分鐘節奏跑`;
  const qualityJa =
    args.quality.kind === "INTERVAL"
      ? `${args.quality.repeats}×（${args.quality.work}分インターバル／${args.quality.recovery}分回復）`
      : `${args.quality.minutes}分テンポ走`;
  const finalEn = finalWeek
    ? "then the final 5K"
    : `${args.longMinutes}-minute long run`;
  const finalZh = finalWeek
    ? "然后完成最终 5K"
    : `${args.longMinutes} 分钟长跑`;
  const finalZhHant = finalWeek
    ? "然後完成最終 5K"
    : `${args.longMinutes} 分鐘長跑`;
  const finalJa = finalWeek ? "最後に5K" : `${args.longMinutes}分ロング走`;
  return {
    en: {
      title: `Week ${args.weekIndex}: ${phaseText.en[args.phase]}`,
      description: `Run ${args.easyMinutes} minutes easily, complete ${qualityEn}, recover with ${args.recoveryMinutes} easy minutes, and ${finalEn}. Keep easy running conversational and quality work controlled rather than all-out.`,
    },
    zh: {
      title: `第 ${args.weekIndex} 周：${phaseText.zh[args.phase]}`,
      description: `先轻松跑 ${args.easyMinutes} 分钟，完成${qualityZh}，再用 ${args.recoveryMinutes} 分钟轻松跑恢复，${finalZh}。轻松跑保持可对话，质量课保持受控，不要全力完成。`,
    },
    "zh-hant": {
      title: `第 ${args.weekIndex} 週：${phaseText["zh-hant"][args.phase]}`,
      description: `先輕鬆跑 ${args.easyMinutes} 分鐘，完成${qualityZhHant}，再用 ${args.recoveryMinutes} 分鐘輕鬆跑恢復，${finalZhHant}。輕鬆跑保持可對話，品質課保持受控，不要全力完成。`,
    },
    ja: {
      title: `${args.weekIndex}週目：${phaseText.ja[args.phase]}`,
      description: `${args.easyMinutes}分イージー、${qualityJa}、${args.recoveryMinutes}分リカバリー、${finalJa}を行います。イージー走は会話できる強度を守り、質の高い練習は全力にせずコントロールします。`,
    },
  };
}

function buildImproveVariant(): PlanTemplateVariant {
  const phases: PlanTemplatePhase[] = [
    "BASE",
    "BASE",
    "BUILD",
    "RECOVERY",
    "BUILD",
    "PEAK",
    "PEAK",
    "RACE",
  ];
  const easy = [30, 35, 35, 25, 35, 40, 30, 25];
  const recovery = [20, 25, 25, 20, 25, 25, 20, 15];
  const long = [40, 45, 50, 35, 45, 55, 30, 0];
  const qualitySpecs: ImproveQualitySpec[] = [
    { kind: "INTERVAL", repeats: 6, work: 1, recovery: 2 },
    { kind: "TEMPO", minutes: 15 },
    { kind: "INTERVAL", repeats: 5, work: 2, recovery: 2 },
    { kind: "TEMPO", minutes: 12 },
    { kind: "INTERVAL", repeats: 6, work: 2, recovery: 2 },
    { kind: "TEMPO", minutes: 20 },
    { kind: "INTERVAL", repeats: 4, work: 1, recovery: 2 },
    { kind: "TEMPO", minutes: 10 },
  ];
  const quality = qualitySpecs.map((spec) =>
    spec.kind === "INTERVAL"
      ? qualityRun(spec.repeats, spec.work, spec.recovery)
      : tempoRun(spec.minutes),
  );
  const workouts: PlanTemplateWorkout[] = [];
  phases.forEach((phase, index) => {
    const week = index + 1;
    const qualityKind: WorkoutKind = index % 2 === 0 ? "INTERVAL" : "TEMPO";
    const specs: Array<[WorkoutKind, number, WorkoutDefinitionInput, boolean]> =
      [
        ["EASY", 3, simpleRun(easy[index]), false],
        [qualityKind, qualityKind === "INTERVAL" ? 7 : 6, quality[index], true],
        ["EASY", 3, simpleRun(recovery[index]), false],
        [
          week === 8 ? "RACE" : "LONG",
          week === 8 ? 8 : 4,
          week === 8 ? race5k() : simpleRun(long[index]),
          week === 8,
        ],
      ];
    specs.forEach(([kind, rpe, workoutDefinition, isQuality], slotIndex) =>
      workouts.push(
        workout({
          key: "RUN_5K_IMPROVE",
          week,
          slot: slotIndex + 1,
          phase,
          kind,
          rpe,
          definition: workoutDefinition,
          quality: isQuality,
        }),
      ),
    );
  });
  return {
    id: "standard",
    periodWeeks: 8,
    trainingDaysPerWeek: 4,
    weeks: phases.map((phase, index) => ({
      weekIndex: index + 1,
      phase,
      copy: improveWeekCopy({
        weekIndex: index + 1,
        phase,
        easyMinutes: easy[index],
        recoveryMinutes: recovery[index],
        longMinutes: long[index],
        quality: qualitySpecs[index],
      }),
    })),
    workouts,
  };
}

function stableHash(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function withHash(
  input: Omit<PlanTemplateDefinition, "contentHash">,
  frozenContentHash?: string,
): PlanTemplateDefinition {
  return { ...input, contentHash: frozenContentHash ?? stableHash(input) };
}

const firstVariants = Object.entries(firstProfiles).map(([id, profile]) =>
  buildFirstVariant(id, profile),
);

export const RUN_PLAN_TEMPLATES: readonly PlanTemplateDefinition[] = [
  withHash(
    {
      key: "RUN_5K_FIRST",
      version: "1.0.1",
      slug: "first-5k",
      goal: "5K",
      copyVersion: "1.0.1",
      publicVariantId: "9-week",
      authoring: {
        source: "OFFLINE_AI_REVIEWED",
        generatedAt: "2026-08-20T13:30:22.461Z",
        model: "deepseek-v4-pro",
        promptContract: "plan-builder/current",
        candidateSha256:
          "6eda207b84e257f21a55e4e7b4153c5e3250ed6dd044067c569e174e15eeaa84",
      },
      copy: templateCopy.RUN_5K_FIRST,
      variants: firstVariants,
    },
    "fnv1a-878da2ef",
  ),
  withHash(
    {
      key: "RUN_5K_FINISH",
      version: "1.0.0",
      copyVersion: "1.0.1",
      slug: "finish-5k",
      goal: "5K",
      publicVariantId: "standard",
      authoring: {
        source: "OFFLINE_AI_REVIEWED",
        generatedAt: "2026-08-20T13:58:52.990Z",
        model: "deepseek-v4-pro",
        promptContract: "plan-builder/current",
        candidateSha256:
          "c8263d9ff7d0f1118349527b8b57e6959180096a162642661f94d670bbdc1a73",
      },
      copy: templateCopy.RUN_5K_FINISH,
      variants: [buildFinishVariant()],
    },
    "fnv1a-90288714",
  ),
  withHash(
    {
      key: "RUN_5K_IMPROVE",
      version: "1.0.0",
      copyVersion: "1.0.1",
      slug: "improve-5k",
      goal: "5K",
      publicVariantId: "standard",
      authoring: {
        source: "OFFLINE_AI_REVIEWED",
        generatedAt: "2026-08-20T14:09:04.876Z",
        model: "deepseek-v4-pro",
        promptContract: "plan-builder/current",
        candidateSha256:
          "0c69c3e94fb095d44e81e30f36260287663718ba2c73e141a2d034a60c62c292",
      },
      copy: templateCopy.RUN_5K_IMPROVE,
      variants: [buildImproveVariant()],
    },
    "fnv1a-37d1d7f3",
  ),
  withHash(buildRun10kFinishTemplate()),
  ...buildGeneratedOfficialRunningTemplates(),
] as const;

export function getRunPlanTemplate(
  slugOrKey: string,
): PlanTemplateDefinition | null {
  const normalized = String(slugOrKey ?? "")
    .trim()
    .toLowerCase();
  return (
    RUN_PLAN_TEMPLATES.find(
      (template) =>
        template.slug === normalized ||
        template.key.toLowerCase() === normalized,
    ) ?? null
  );
}

export function getPlanTemplateVariant(
  template: PlanTemplateDefinition,
  variantId?: string | null,
): PlanTemplateVariant | null {
  const id = variantId?.trim() || template.publicVariantId;
  return template.variants.find((variant) => variant.id === id) ?? null;
}

export function chooseFirst5kVariant(
  continuousRunMinutes: number | null | undefined,
): string {
  if (continuousRunMinutes == null || continuousRunMinutes <= 5)
    return "12-week";
  if (continuousRunMinutes <= 10) return "10-week";
  if (continuousRunMinutes <= 20) return "9-week";
  return "8-week";
}

export function resolvePlanTemplateWorkoutDefinitions(args: {
  template: PlanTemplateDefinition;
  variant: PlanTemplateVariant;
  recent5kSeconds?: number;
  capabilitySnapshot?: RunningCapabilitySnapshot;
  targetRace?: RunningGoalRaceSnapshot | null;
}) {
  const vdot =
    args.template.key === "RUN_5K_IMPROVE" && args.recent5kSeconds
      ? computeVdotForDistanceTime(5_000, args.recent5kSeconds)
      : null;
  const paceSnapshot =
    vdot != null && isSupportedVdot(vdot) ? resolveVdotPaces(vdot) : null;

  const definitionWithPace = (
    item: PlanTemplateWorkout,
  ): WorkoutDefinitionInput => {
    if (args.template.intensitySlots?.length && args.capabilitySnapshot) {
      return resolveRunningWorkoutIntensity({
        template: args.template,
        workout: item,
        capability: args.capabilitySnapshot,
        goalRace: args.targetRace,
      }).definition;
    }
    const original = item.definition;
    if (
      !paceSnapshot ||
      !item.quality ||
      original.source !== "STRUCTURE" ||
      original.structure.kind !== "ENDURANCE" ||
      original.structure.blocks.some(
        (block) =>
          block.type !== "repeat" &&
          block.steps.some((step) => step.durationMeta?.kind === "DISTANCE"),
      )
    ) {
      return item.definition;
    }
    const cloned = JSON.parse(JSON.stringify(original)) as typeof original;
    if (cloned.structure.kind !== "ENDURANCE") return cloned;
    const zone: VdotZoneKey = item.weekIndex % 2 === 0 ? "T" : "I";
    const range = paceSnapshot.zones[zone];
    const apply = (blocks: EndurancePlanBlock[]) => {
      for (const block of blocks) {
        if (block.type === "repeat") {
          apply(block.children);
        } else if (block.type === "work") {
          for (const step of block.steps) {
            if (step.stepKind !== "WORK") continue;
            step.primaryTargetMeta = {
              kind: "SPEED",
              value: range.fastSecPerKm,
              valueHigh: range.slowSecPerKm,
              zoneLabel: zone,
              zoneSystem: "VDOT",
              zoneSource: "RUN_5K_IMPROVE",
              zoneBasis: {
                vdot: paceSnapshot.vdot,
                recent5kSeconds: args.recent5kSeconds,
              },
              unit: "sec/km",
            };
          }
        }
      }
    };
    apply(cloned.structure.blocks);
    return cloned;
  };

  return new Map(
    args.variant.workouts.map((item) => [
      item.semanticId,
      definitionWithPace(item),
    ]),
  );
}

export function buildPlanTemplateDraft(args: {
  template: PlanTemplateDefinition;
  variant: PlanTemplateVariant;
  locale?: unknown;
  preferredWeekdays: number[];
  requestedStartDate: string;
  recent5kSeconds?: number;
  capabilitySnapshot?: RunningCapabilitySnapshot;
  targetRace?: RunningGoalRaceSnapshot | null;
}): PlanTemplatePlanDraft {
  const locale = normalizePlanTemplateLocale(args.locale);
  if (args.preferredWeekdays.length !== args.variant.trainingDaysPerWeek) {
    throw new Error(
      `Expected ${args.variant.trainingDaysPerWeek} preferred weekdays`,
    );
  }
  if (new Set(args.preferredWeekdays).size !== args.preferredWeekdays.length) {
    throw new Error("Preferred weekdays must be unique");
  }
  if (
    args.preferredWeekdays.some(
      (day) => !Number.isInteger(day) || day < 1 || day > 7,
    )
  ) {
    throw new Error("Preferred weekdays must be integers from 1 to 7");
  }
  const preferredWeekdays = [...args.preferredWeekdays].sort(
    (left, right) => left - right,
  );
  const start = new Date(`${args.requestedStartDate}T00:00:00.000Z`);
  if (
    Number.isNaN(start.getTime()) ||
    start.toISOString().slice(0, 10) !== args.requestedStartDate
  ) {
    throw new Error("requestedStartDate must be a real YYYY-MM-DD date");
  }
  const startIsoWeekday = start.getUTCDay() === 0 ? 7 : start.getUTCDay();
  const dayIndexes = preferredWeekdays
    .map((weekday) => ((weekday - startIsoWeekday + 7) % 7) + 1)
    .sort((left, right) => left - right);
  const copy = args.template.copy[locale];
  const workoutDefinitions = resolvePlanTemplateWorkoutDefinitions(args);
  return {
    title: copy.title,
    description: copy.description,
    goal: args.template.goal,
    sourceType: "TEMPLATE",
    periodWeeks: args.variant.periodWeeks,
    workouts: args.variant.workouts.map((item) => ({
      weekIndex: item.weekIndex,
      dayIndex: dayIndexes[item.slotIndex - 1],
      sportType: "RUN",
      plannedSessionRpe: item.plannedRpe,
      name: item.copy[locale].name,
      notes: item.copy[locale].notes,
      definition: workoutDefinitions.get(item.semanticId) ?? item.definition,
    })),
    generationMetadata: {
      planTemplate: {
        key: args.template.key,
        version: args.template.version,
        slug: args.template.slug,
        variantId: args.variant.id,
        contentHash: args.template.contentHash,
        locale,
        preferredWeekdays,
        requestedStartDate: args.requestedStartDate,
        ...(args.recent5kSeconds
          ? { recent5kSeconds: args.recent5kSeconds }
          : {}),
        ...(args.capabilitySnapshot
          ? {
              capabilitySnapshot: args.capabilitySnapshot as unknown as Record<
                string,
                unknown
              >,
              resolverVersion: args.template.resolverVersion,
            }
          : {}),
        ...(args.targetRace
          ? {
              targetRace: args.targetRace as unknown as Record<string, unknown>,
            }
          : {}),
        ...(args.template.scheduleVersion
          ? { scheduleVersion: args.template.scheduleVersion }
          : {}),
      },
    },
  };
}

export function validateRunPlanTemplates(): string[] {
  const issues: string[] = [];
  const semanticIds = new Set<string>();
  const versions = new Set<string>();
  for (const template of RUN_PLAN_TEMPLATES) {
    const versionId = `${template.key}@${template.version}`;
    if (versions.has(versionId)) issues.push(`${versionId}: duplicate version`);
    versions.add(versionId);
    if (!template.authoring) {
      issues.push(`${template.key}: missing reviewed authoring provenance`);
    }
    for (const variant of template.variants) {
      if (variant.weeks.length !== variant.periodWeeks)
        issues.push(`${template.key}/${variant.id}: week count mismatch`);
      for (let week = 1; week <= variant.periodWeeks; week += 1) {
        const weekWorkouts = variant.workouts.filter(
          (item) => item.weekIndex === week,
        );
        const raceWeekReduction =
          week === variant.periodWeeks &&
          weekWorkouts.length === variant.trainingDaysPerWeek - 1;
        if (
          weekWorkouts.length !== variant.trainingDaysPerWeek &&
          !raceWeekReduction
        )
          issues.push(
            `${template.key}/${variant.id}/w${week}: frequency mismatch`,
          );
        const qualitySlots = weekWorkouts
          .filter((item) => item.quality)
          .map((item) => item.slotIndex);
        if (qualitySlots.length > 2)
          issues.push(
            `${template.key}/${variant.id}/w${week}: too many quality sessions`,
          );
        if (
          qualitySlots.some(
            (slot, index) => index > 0 && slot - qualitySlots[index - 1] === 1,
          )
        )
          issues.push(
            `${template.key}/${variant.id}/w${week}: adjacent quality sessions`,
          );
      }
      for (const item of variant.workouts) {
        const scopedId = `${template.key}/${variant.id}/${item.semanticId}`;
        if (semanticIds.has(scopedId))
          issues.push(`${scopedId}: duplicate semantic id`);
        semanticIds.add(scopedId);
        if (
          item.definition.source !== "STRUCTURE" ||
          item.definition.structure.kind !== "ENDURANCE"
        )
          issues.push(`${scopedId}: workout is not structured endurance IR`);
        if (!item.sourceDsl) {
          issues.push(`${scopedId}: missing frozen source DSL`);
        }
        if (
          item.plannedRpeRange.min < 1 ||
          item.plannedRpeRange.max > 10 ||
          item.plannedRpeRange.min > item.plannedRpeRange.max
        ) {
          issues.push(`${scopedId}: invalid RPE range`);
        }
        if (
          (template.key === "RUN_5K_FIRST" ||
            template.key === "RUN_10K_FINISH") &&
          item.definition.source === "STRUCTURE"
        ) {
          const structure = item.definition.structure as EnduranceWorkoutIrV1;
          const targets = structure.blocks
            .flatMap((block) =>
              block.type === "repeat"
                ? block.children.flatMap((child) => child.steps)
                : block.steps,
            )
            .map((step) => step.primaryTargetMeta?.kind ?? "NONE");
          if (targets.some((kind) => kind !== "NONE"))
            issues.push(
              `${scopedId}: completion template must not prescribe pace/HR/power`,
            );
        }
      }
      if (template.key === "RUN_10K_FINISH") {
        const steadyWeeks = variant.workouts
          .filter((item) => item.intensityKind === "STEADY")
          .map((item) => item.weekIndex);
        if (JSON.stringify(steadyWeeks) !== JSON.stringify([4, 6, 8])) {
          issues.push(`${template.key}/${variant.id}: steady weeks changed`);
        }
        if (variant.workouts.at(-1)?.sourceDsl.split("\n")[1] !== "work 10km") {
          issues.push(
            `${template.key}/${variant.id}: final workout is not 10km`,
          );
        }
      }
      if (template.goal !== "5K") {
        const expectedDistance =
          template.goal === "10K"
            ? "work 10km"
            : template.goal === "HALF_MARATHON"
              ? "work 21.0975km"
              : "work 42.195km";
        if (!variant.workouts.at(-1)?.sourceDsl.includes(expectedDistance)) {
          issues.push(
            `${template.key}/${variant.id}: final workout is not ${expectedDistance.slice(5)}`,
          );
        }
      }
    }
  }
  return issues;
}
