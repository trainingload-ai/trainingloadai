/**
 * 从日历「AI 生成计划」跳转到教练页时的结构化参数 ↔ 首条用户提示文案。
 * URL 只带短参数，由教练页按当前 locale 组装完整 prompt。
 */

export type AiPlanSeedIntent =
  | "healthFatLoss"
  | "fitnessBuild"
  | "racePrep"
  | "skillFocus"
  | "returnToTraining";

export type AiPlanSeedSport = "run" | "cycle" | "swim" | "strength";

export type AiPlanSeedRaceDiscipline = "run" | "tri" | "cycle";

export type AiPlanSeedRaceDistance =
  | "5k"
  | "10k"
  | "half"
  | "full"
  | "sprint"
  | "olympic"
  | "halfIron"
  | "fullIron"
  | "criterium"
  | "road";

export type AiPlanSeedStrengthPreference = "AUTO" | "INCLUDE" | "EXCLUDE";

export type AiPlanSeedStrengthBrief = {
  preference: AiPlanSeedStrengthPreference;
  weeklySessions: number;
  sessionMinutes: number;
  equipment: string[];
};

export type AiPlanSeedPayload = {
  sportTypes: AiPlanSeedSport[];
  intent: AiPlanSeedIntent;
  raceDiscipline?: AiPlanSeedRaceDiscipline;
  raceDistance?: AiPlanSeedRaceDistance;
  cycleWeeks: number;
  weeklyDays: number;
  dailyMinutes: number;
  strength: AiPlanSeedStrengthBrief;
};

export type AiPlanSeedToolResultPayload = {
  kind: "ai_plan_seed";
  version: 3;
  payload: AiPlanSeedPayload;
};

const INTENTS: AiPlanSeedIntent[] = [
  "healthFatLoss",
  "fitnessBuild",
  "racePrep",
  "skillFocus",
  "returnToTraining",
];

const SPORTS: AiPlanSeedSport[] = ["run", "cycle", "swim", "strength"];

const RACE_D: AiPlanSeedRaceDiscipline[] = ["run", "tri", "cycle"];

const RACE_DIST: AiPlanSeedRaceDistance[] = [
  "5k",
  "10k",
  "half",
  "full",
  "sprint",
  "olympic",
  "halfIron",
  "fullIron",
  "criterium",
  "road",
];

function parsePositiveInt(raw: string | null, fallback: number, max: number) {
  // URL 参数来自外部跳转入口，统一限制为正整数并设置上限，避免生成离谱计划。
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

/** 从 `/ai-coach?...` 解析日历传来的短参数；不完整或非法则返回 null */
export function parseAiPlanSeedFromSearchParams(
  searchParams: URLSearchParams,
): AiPlanSeedPayload | null {
  const planIntent = searchParams.get("planIntent")?.trim() ?? "";
  if (!planIntent || !INTENTS.includes(planIntent as AiPlanSeedIntent)) {
    return null;
  }
  const intent = planIntent as AiPlanSeedIntent;

  const weeksRaw = searchParams.get("weeks");
  const daysRaw = searchParams.get("days");
  const minsRaw = searchParams.get("mins");
  if (weeksRaw == null || daysRaw == null || minsRaw == null) return null;

  const cycleWeeks = parsePositiveInt(weeksRaw, 8, 52);
  const weeklyDays = parsePositiveInt(daysRaw, 5, 7);
  const dailyMinutes = parsePositiveInt(minsRaw, 60, 24 * 60);
  const strengthPreference = (() => {
    const raw = searchParams.get("strength")?.trim().toUpperCase();
    return raw === "INCLUDE" || raw === "EXCLUDE" ? raw : "AUTO";
  })();
  const strength = {
    preference: strengthPreference,
    weeklySessions: parsePositiveInt(searchParams.get("strengthDays"), 2, 7),
    sessionMinutes: parsePositiveInt(searchParams.get("strengthMins"), 40, 180),
    equipment: (searchParams.get("equipment") ?? "bodyweight")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 12),
  } satisfies AiPlanSeedStrengthBrief;

  const sportsRaw = searchParams.get("sports")?.trim() ?? "run";
  const sportTypes = sportsRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is AiPlanSeedSport => SPORTS.includes(s as AiPlanSeedSport));
  if (sportTypes.length === 0) return null;

  const raceDRaw = searchParams.get("raceD")?.trim();
  const raceDistRaw = searchParams.get("raceDist")?.trim();
  let raceDiscipline: AiPlanSeedRaceDiscipline | undefined;
  let raceDistance: AiPlanSeedRaceDistance | undefined;
  if (intent === "racePrep" && raceDRaw && raceDistRaw) {
    if (RACE_D.includes(raceDRaw as AiPlanSeedRaceDiscipline)) {
      raceDiscipline = raceDRaw as AiPlanSeedRaceDiscipline;
    }
    if (RACE_DIST.includes(raceDistRaw as AiPlanSeedRaceDistance)) {
      raceDistance = raceDistRaw as AiPlanSeedRaceDistance;
    }
  }

  return {
    sportTypes,
    intent,
    raceDiscipline,
    raceDistance,
    cycleWeeks,
    weeklyDays,
    dailyMinutes,
    strength,
  };
}

/** 用于去重：同一次跳转不要触发两次 seed */
export function aiPlanSeedDedupeKey(payload: AiPlanSeedPayload): string {
  return [
    "ap",
    payload.intent,
    payload.sportTypes.slice().sort().join(","),
    payload.cycleWeeks,
    payload.weeklyDays,
    payload.dailyMinutes,
    payload.strength.preference,
    payload.strength.weeklySessions,
    payload.strength.sessionMinutes,
    payload.strength.equipment.slice().sort().join(","),
    payload.raceDiscipline ?? "",
    payload.raceDistance ?? "",
  ].join("::");
}

export function buildAiPlanPromptFromSeed(
  payload: AiPlanSeedPayload,
  locale: string,
): string {
  // 首条 prompt 是给用户和模型都能读懂的自然语言，结构化 payload 另走 tool_result 传给模型。
  const sportLabel = {
    zh: { run: "跑步", cycle: "骑行", swim: "游泳", strength: "健身训练" },
    en: {
      run: "running",
      cycle: "cycling",
      swim: "swimming",
      strength: "strength training",
    },
  };
  const intentLabel = {
    zh: {
      healthFatLoss: "健康减脂",
      fitnessBuild: "综合体能提升",
      racePrep: "比赛备战",
      skillFocus: "专项能力强化",
      returnToTraining: "恢复与回归训练",
    },
    en: {
      healthFatLoss: "health and fat loss",
      fitnessBuild: "general fitness build",
      racePrep: "race preparation",
      skillFocus: "skill focus",
      returnToTraining: "return to training",
    },
  };

  if (locale.startsWith("zh")) {
    const lines = [
      "帮我设计一个运动训练计划。",
      "请启用 plan-builder 工作流。必须先调用 training.baseline（比赛备战时配合 bests.summary）读取我系统中的近期训练基线：周跑量、训练次数、最长单次等；这些数据若已在工具结果里，不要再用多选问题让我重复填写。",
      "请同时调用 workout.intensity_strategy（必要时配合 profile.current / bests.summary）：让 AI 根据我近期数据覆盖和已配置区间来决定每类训练用区间还是具体数值、用配速/心率/功率哪个指标；直接使用该工具返回的 selectedZoneRanges，不要为同一数据再单独调用 profile.zone_ranges；没有可靠锚点时保持时长 DSL。每节课的 notes 必须用中文自然语言完整说明怎么练，包括热身、主训练、重复与恢复、放松以及适用的时长、距离和强度提示，让不懂 workout DSL 的人只看备注也能执行。",
      "先结合表单、系统训练基线和必要的用户回答，判断整组条件能否形成适合我的计划。缺少会改变判断的事实时再补问；条件组合不合适时，即使已有活动数据，也要先提供 2–3 套完整调整方案并推荐最合适的一套，让我选择后重新评估。不要为了出稿只改一个字段，也不能直接凭下方表单条件出稿。",
      "表单里的比赛项目和距离只是计划 brief，不是带日期的赛事事实。出稿前读取独立赛事；如果我后续提供具体日期和重要程度，必须先让我确认完整赛事信息，再创建赛事。",
      "",
      "已知条件：",
      `- 训练意图：${intentLabel.zh[payload.intent]}`,
      `- 计划运动组成（可多选）：${payload.sportTypes.map((item) => sportLabel.zh[item]).join("、")}`,
      `- 周期：${payload.cycleWeeks} 周`,
      `- 每周训练天数：${payload.weeklyDays} 天`,
      `- 每天可训练时长：${payload.dailyMinutes} 分钟`,
      `- 力量训练偏好：${payload.strength.preference === "INCLUDE" ? "必须作为独立辅助课纳入计划" : payload.strength.preference === "EXCLUDE" ? "不包含" : "由 AI 根据目标和恢复空间建议"}`,
      ...(payload.strength.preference !== "EXCLUDE"
        ? [
            `- 力量训练期望：每周 ${payload.strength.weeklySessions} 节，每节约 ${payload.strength.sessionMinutes} 分钟`,
            `- 可用器械：${payload.strength.equipment.join("、") || "徒手"}`,
          ]
        : []),
    ];
    if (
      payload.intent === "racePrep" &&
      payload.raceDiscipline &&
      payload.raceDistance
    ) {
      lines.push(`- 比赛项目：${payload.raceDiscipline}`);
      lines.push(`- 比赛距离：${payload.raceDistance}`);
    }
    return lines.join("\n");
  }

  const lines = [
    "Help me design a training plan.",
    "Please activate the plan-builder workflow. You must call training.baseline first (and bests.summary for race prep) to read weekly volume, session count, and longest recent session from my synced data — never re-ask the user for facts already returned by tools.",
    "Also call workout.intensity_strategy (with profile.current / bests.summary when needed) so the AI chooses zone vs fixed values and pace vs heart-rate vs power from my recent metric coverage and configured zones. Use selectedZoneRanges from that result instead of making a duplicate profile.zone_ranges call; when no reliable anchor exists, keep duration-only DSL. Every workout's notes must explain the complete session in plain English—including warm-up, main work, repeats and recoveries, cool-down, and applicable duration, distance, and effort cues—so someone who does not understand workout DSL can execute it from the notes alone.",
    "First judge whether the whole combination of form inputs, training baseline, and any required user answers can produce a suitable plan. Ask for facts that could change that judgment. If the combined conditions are unsuitable, even when activity data exists, offer two or three coherent adjustment scenarios, recommend the best fit, and reassess after I choose. Do not change one field merely to make generation pass, and do not draft from schedule fields alone.",
    "Treat the race discipline and distance below as a plan brief, not a dated race fact. Read independent race events before drafting. If I later provide a concrete date and importance, ask me to confirm the exact event before creating it.",
    "",
    "Known brief:",
    `- Training intent: ${intentLabel.en[payload.intent]}`,
    `- Plan sport mix (multi-select): ${payload.sportTypes.map((item) => sportLabel.en[item]).join(", ")}`,
    `- Duration: ${payload.cycleWeeks} weeks`,
    `- Weekly training days: ${payload.weeklyDays}`,
    `- Daily training time: ${payload.dailyMinutes} minutes`,
    `- Strength training: ${payload.strength.preference === "INCLUDE" ? "required as separate supporting workouts" : payload.strength.preference.toLowerCase()}`,
    ...(payload.strength.preference !== "EXCLUDE"
      ? [
          `- Strength preference: ${payload.strength.weeklySessions} sessions/week, about ${payload.strength.sessionMinutes} minutes each`,
          `- Available equipment: ${payload.strength.equipment.join(", ") || "bodyweight"}`,
        ]
      : []),
  ];
  if (
    payload.intent === "racePrep" &&
    payload.raceDiscipline &&
    payload.raceDistance
  ) {
    lines.push(`- Race discipline: ${payload.raceDiscipline}`);
    lines.push(`- Race distance: ${payload.raceDistance}`);
  }
  return lines.join("\n");
}

export type AiPlanSeedVisibleBrief = {
  title: string;
  lines: string[];
};

export function buildAiPlanSeedUserText(
  locale: string,
  brief?: AiPlanSeedVisibleBrief,
): string {
  const request = locale.startsWith("zh")
    ? "请根据这份计划条件生成训练计划。"
    : "Please generate a training plan from this plan brief.";
  const lines = brief?.lines.map((line) => line.trim()).filter(Boolean) ?? [];
  if (!brief?.title.trim() || lines.length === 0) return request;
  return [
    request,
    "",
    brief.title.trim(),
    ...lines.map((line) => `- ${line}`),
  ].join("\n");
}

export function buildAiPlanSeedToolResult(
  payload: AiPlanSeedPayload,
): AiPlanSeedToolResultPayload {
  return {
    kind: "ai_plan_seed",
    version: 3,
    payload,
  };
}

/** 从 URL 移除 AI 计划种子相关参数（结构化 + 旧版 prompt） */
export function stripAiPlanSeedParams(next: URLSearchParams): void {
  next.delete("prompt");
  next.delete("intent");
  next.delete("planIntent");
  next.delete("sports");
  next.delete("weeks");
  next.delete("days");
  next.delete("mins");
  next.delete("raceD");
  next.delete("raceDist");
  next.delete("strength");
  next.delete("strengthDays");
  next.delete("strengthMins");
  next.delete("equipment");
  next.delete("planId");
  next.delete("pending");
}
