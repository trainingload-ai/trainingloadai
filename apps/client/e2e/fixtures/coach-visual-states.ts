import type {
  CoachActivityStatus,
  CoachRunStatus,
} from "../../../../packages/shared/ai-coach-run-contract";
import { explorationFixtures } from "./exploration-fixtures";

// Simulated data only. Every screenshot is rendered by the actual Coach route.
export const visualTime = "2026-10-09T03:00:30.000Z";
const startedAt = "2026-10-09T03:00:00.000Z";
type Part = Record<string, unknown>;
export type VisualState = {
  id: string;
  title: string;
  category: string;
  parts: Part[];
  status?: CoachRunStatus;
  live?: boolean;
  expanded?: boolean;
  interaction?:
    | "select"
    | "next"
    | "multi"
    | "note"
    | "undo"
    | "collapse-card"
    | "dismiss"
    | "reopen"
    | "open-credit-recovery";
  membershipPlan?: "FREE" | "PLUS" | "PRO";
  expected?: string;
  retryBlocked?: boolean;
  rowsAfter?: Record<string, unknown>[];
  empty?: boolean;
};
export const text = (value: string): Part => ({ type: "text", text: value });
export const tool = (name: string, input: unknown, id = name): Part => ({
  type: "data-coach-tool",
  id,
  data: { toolCallId: id, name, input },
});
export function activity(
  id: string,
  kind: string,
  status: CoachActivityStatus,
  toolName?: string,
  seq = 0,
): Part {
  return {
    type: "data-coach-activity",
    id,
    data: {
      activityId: id,
      runId: "gallery-run",
      attemptId: "gallery-attempt",
      seq,
      revision: 1,
      kind,
      ...(kind === "tool" ? { toolCallId: id } : {}),
      labelKey: kind,
      status,
      ...(kind === "skill" ? { skillName: toolName } : { toolName }),
      startedAt,
      ...([
        "completed",
        "failed",
        "cancelled",
        "interrupted",
        "skipped",
      ].includes(status)
        ? { endedAt: "2026-10-09T03:00:03.000Z" }
        : {}),
    },
  };
}
export function runRow(state: VisualState): Record<string, unknown> {
  const status = state.status ?? "completed";
  return {
    id: "gallery-message",
    role: "assistant",
    content: "",
    createdAt: startedAt,
    message: {
      kind: "ui_message",
      version: 2,
      role: "assistant",
      providerReplay: false,
      metadata: {
        schemaVersion: 2,
        runId: "gallery-run",
        attemptId: "gallery-attempt",
      },
      parts: [
        {
          type: "data-coach-run",
          id: "gallery-run",
          data: {
            runId: "gallery-run",
            attemptId: "gallery-attempt",
            messageId: "gallery-message",
            revision: 2,
            status,
            startedAt,
            ...(status !== "running" ? { endedAt: visualTime } : {}),
            previousExecutionMs: 0,
            executionMs: 30000,
            retryBlocked: state.retryBlocked,
            ...(status === "awaiting_input"
              ? { pendingInteractionId: "gallery-question" }
              : {}),
          },
        },
        ...state.parts,
      ],
    },
  };
}
export function userRow(title: string): Record<string, unknown> {
  return {
    id: "gallery-user",
    role: "user",
    content: title,
    createdAt: startedAt,
  };
}
function userReceipt(
  kind: string,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: `receipt-${kind}`,
    role: "user",
    content: "",
    createdAt: visualTime,
    message: {
      kind: "ui_message",
      version: 1,
      role: "user",
      parts: [
        {
          type: "data-coach-user-tool-result",
          data: {
            toolUseId: "gallery-message",
            content: {
              kind,
              repliesToAssistantMessageId: "gallery-message",
              ...extra,
            },
          },
        },
      ],
    },
  };
}
const question = {
  questions: [
    {
      id: "goal",
      header: "训练目标",
      question: "这轮训练，你最想改善什么？",
      options: [
        {
          value: "race",
          label: "备战半程马拉松",
          description: "围绕比赛日期安排跑量与关键训练",
        },
        {
          value: "base",
          label: "建立有氧基础",
          description: "循序增加训练量，保持规律运动",
        },
        {
          value: "recovery",
          label: "恢复与调整",
          description: "减少疲劳，恢复后再逐步增加强度",
        },
      ],
    },
    {
      id: "days",
      header: "训练安排",
      question: "一周通常可以安排几次训练？",
      options: [
        { value: "3", label: "3 次", description: "保留充足恢复时间" },
        {
          value: "4",
          label: "4 次",
          description: "兼顾轻松跑、关键课与长距离",
        },
      ],
    },
  ],
};
function questionParts(status = "pending", single = false): Part[] {
  return [
    activity("analysis", "analysis", "completed"),
    tool(
      "AskUserQuestion",
      {
        questions: single ? question.questions.slice(0, 1) : question.questions,
      },
      "question-call",
    ),
    {
      type: "data-coach-interaction",
      id: "gallery-question",
      data: {
        interactionId: "gallery-question",
        runId: "gallery-run",
        questionMessageId: "gallery-message",
        questionToolCallId: "question-call",
        revision: status === "pending" ? 1 : 2,
        status,
        ...(status !== "pending"
          ? {
              submissionId: "gallery-submission",
              answeredAt: visualTime,
              answers: status === "skipped" ? {} : { goal: "race", days: "4" },
              notes:
                status === "skipped"
                  ? {}
                  : { goal: "比赛在 12 月，先保持稳定训练。" },
            }
          : {}),
      },
    },
  ];
}

export const enduranceBlocks = [
  {
    type: "work",
    steps: [{ duration: 600, power: 0.55, paceKmh: 8, stepKind: "WARMUP" }],
  },
  {
    type: "repeat",
    count: 4,
    children: [
      {
        type: "work",
        steps: [{ duration: 180, power: 0.95, paceKmh: 12, stepKind: "WORK" }],
      },
      {
        type: "rest",
        steps: [
          { duration: 120, power: 0.45, paceKmh: 7, stepKind: "RECOVERY" },
        ],
      },
    ],
  },
  {
    type: "work",
    steps: [{ duration: 480, power: 0.5, paceKmh: 8, stepKind: "COOLDOWN" }],
  },
];
export const easyBlocks = [
  {
    type: "work",
    steps: [{ duration: 1800, power: 0.6, paceKmh: 8.5, stepKind: "WORK" }],
  },
];
const enduranceText =
  "warmup 10m pace 7:30/km\nrepeat 4 {\n  work 3m pace 5:00/km\n  rest 2m pace 8:30/km\n}\ncooldown 8m pace 7:30/km";
const strengthStructure = {
  kind: "STRENGTH",
  version: 1,
  durationSeconds: 2400,
  exercises: [
    {
      name: "深蹲",
      setGroups: [
        {
          setType: "WORK",
          setCount: 3,
          prescription: { kind: "REPS", repsMin: 8, repsMax: 10, amrap: false },
          load: { kind: "BODYWEIGHT" },
          restSeconds: 90,
        },
      ],
    },
    {
      name: "提踵",
      setGroups: [
        {
          setType: "WORK",
          setCount: 3,
          prescription: {
            kind: "REPS",
            repsMin: 12,
            repsMax: 15,
            amrap: false,
          },
          load: { kind: "BODYWEIGHT" },
          restSeconds: 60,
        },
      ],
    },
  ],
};
function workout(sportType = "RUN", kind = "ENDURANCE") {
  return {
    id: "gallery-workout",
    name:
      kind === "STRENGTH"
        ? "跑者力量训练"
        : kind === "FREEFORM"
          ? "舒缓拉伸与活动度"
          : sportType === "CYCLING"
            ? "甜点区间歇骑行"
            : sportType === "SWIM"
              ? "有氧技术游"
              : "有氧间歇跑",
    sportType,
    status: "PLANNED",
    weekIndex: 2,
    dayIndex: 4,
    sessionIndex: 1,
    text:
      kind === "FREEFORM"
        ? "15 分钟舒缓拉伸，重点照顾髋部与小腿。以舒适为准，不追求幅度。"
        : enduranceText,
    structureKind: kind,
    structure:
      kind === "STRENGTH"
        ? strengthStructure
        : kind === "FREEFORM"
          ? { kind, version: 1, text: "15 分钟舒缓拉伸，重点照顾髋部与小腿。" }
          : { kind, version: 1, blocks: enduranceBlocks },
    blocks: kind === "ENDURANCE" ? enduranceBlocks : undefined,
  };
}
function day(sport?: string, kind?: string) {
  return {
    kind: "plan_day_view",
    date: "2026-10-09",
    plan: { id: "gallery-plan", title: "半马基础期" },
    weekIndex: 2,
    dayIndex: 4,
    workouts: [workout(sport, kind)],
  };
}
const draft = {
  title: "半马基础期 · 第 1 周",
  description:
    "以轻松跑为主，安排一次短间歇与一次长距离。训练之间保留恢复时间。",
  periodWeeks: 1,
  workouts: [1, 3, 5, 7].map((dayIndex, index) => ({
    weekIndex: 1,
    dayIndex,
    sessionIndex: 1,
    sportType: "RUN",
    name: ["轻松跑", "短间歇", "恢复跑", "长距离"][index],
    notes: [
      "保持能交谈的强度",
      "注意动作放松",
      "轻松完成即可",
      "全程保持均匀节奏",
    ][index],
    text: index === 1 ? enduranceText : "work 30m pace z2",
    structureKind: "ENDURANCE",
    structure: {
      kind: "ENDURANCE",
      version: 1,
      blocks: index === 1 ? enduranceBlocks : easyBlocks,
    },
    blocks: index === 1 ? enduranceBlocks : easyBlocks,
  })),
};
const adjustment = {
  planId: "gallery-plan",
  workoutId: "gallery-workout",
  decisionId: "gallery-decision",
  title: "将间歇课调整为轻松跑",
  reason: "近期疲劳偏高，今天减少强度，保留轻松活动。",
  before: { ...workout(), scheduledDate: "2026-10-09" },
  after: {
    ...workout(),
    name: "30 分钟轻松跑",
    text: "work 30m pace z2",
    notes: "以能轻松交谈的强度完成。",
    scheduledDate: "2026-10-09",
  },
  changes: [
    { field: "name", before: "有氧间歇跑", after: "30 分钟轻松跑" },
    {
      field: "text",
      before: "4 组高强度间歇",
      after: "30 分钟轻松跑",
      reason: "降低疲劳累积",
    },
  ],
};
const decision = {
  kind: "coach_decision_draft",
  decisionId: "gallery-decision",
  branchId: "gallery-branch",
  state: "PROPOSED",
  riskTier: "HIGH",
  decisionType: "PLAN_WORKOUT_ADD",
  rationale: "最近一周训练频率稳定，增加一次轻松跑。",
  payload: {
    planId: "gallery-plan",
    dto: {
      weekIndex: 2,
      dayIndex: 5,
      sessionIndex: 1,
      sportType: "RUN",
      name: "30 分钟轻松跑",
      text: "work 30m pace z2",
      notes: "保持放松，不追求配速。",
    },
  },
};
const applied = (result: string) =>
  tool("CoachDecisionApplied", {
    kind: "coach_decision_apply",
    decisionId: "gallery-decision",
    result,
    commitId: result === "APPLIED" ? "gallery-commit" : null,
    conflict:
      result === "REBASE_REQUIRED"
        ? { expectedBaseEventSeq: 4, currentHeadEventSeq: 6 }
        : null,
  });
const mutation = (undoUntil: string | null, riskTier = "LOW") =>
  tool("MutationApplied", {
    kind: "mutation_applied",
    ok: true,
    actionId: "gallery-action",
    type: "PLAN_WORKOUT_UPDATE",
    riskTier,
    summary: "周四训练已改为 30 分钟轻松跑，其他训练保持不变。",
    undoUntil,
    payload: {},
  });
const activityItems = [
  {
    hashId: "activity-a",
    title: "清晨轻松跑",
    sportType: "RUN",
    startTime: "2026-10-08T23:05:00Z",
    distanceKm: 8.24,
    durationMin: 46.6,
    trainingLoad: 42,
    avgHr: 143,
  },
  {
    hashId: "activity-b",
    title: "室内有氧骑行",
    sportType: "CYCLING",
    startTime: "2026-10-07T11:15:00Z",
    distanceKm: 31.8,
    durationMin: 65.3,
    trainingLoad: 58,
    avgHr: 136,
    avgPower: 168,
  },
];
const fitness = {
  kind: "fitness_assessment_result",
  schemaVersion: 1,
  taskId: "gallery-fitness",
  taskRevision: 1,
  calculationId: "gallery-calculation",
  sport: "CYCLING",
  requestedScope: { kind: "ACTIVITY", activityHashId: "activity-b" },
  method: { id: "lthr-30-minute", version: "1", policyVersion: "1" },
  status: "ESTIMATED",
  preparationStatus: "READY",
  candidates: [
    { metric: "LTHR", value: 173, unit: "bpm", currentValue: 170, delta: 3 },
  ],
  observations: [],
  evidence: {
    activityCount: 1,
    readyCount: 1,
    includedCount: 1,
    truncated: false,
    from: startedAt,
    to: visualTime,
    latestEvidenceAt: visualTime,
    activityHashIds: ["activity-b"],
    checks: [],
  },
  assessedAt: visualTime,
  timezone: "Asia/Shanghai",
  limitations: [],
  nextActions: ["APPLY"],
  applyOptions: [
    {
      id: "adopt",
      sport: "CYCLING",
      effectiveDate: "2026-10-09",
      changes: [
        {
          metric: "LTHR",
          value: 173,
          unit: "bpm",
          currentValue: 170,
          delta: 3,
        },
      ],
      proposalDigest: "fixture-digest",
      expiresAt: "2026-10-09T04:00:00.000Z",
    },
  ],
  noMetricWrite: true,
};
const zones = {
  kind: "profile_zone_ranges",
  sportType: "RUN",
  heartRate: {
    configured: true,
    benchmark: "LTHR 173 bpm",
    zones: [
      { order: 1, name: "Z1 · 恢复", min: 95, max: 139 },
      { order: 2, name: "Z2 · 有氧", min: 140, max: 154 },
      { order: 3, name: "Z3 · 节奏", min: 155, max: 164 },
      { order: 4, name: "Z4 · 阈值", min: 165, max: 177 },
      { order: 5, name: "Z5 · 高强度", min: 178, max: 190 },
    ],
  },
};

const running = [
  activity("analysis", "analysis", "completed"),
  activity("skill", "skill", "completed", "training-analytics", 1),
  activity("read-a", "tool", "running", "activity.recent", 2),
  activity("read-b", "tool", "queued", "activity.recent", 3),
];
export const visualStates: VisualState[] = [
  ...(["live", "completed", "interrupted", "cancelled", "failed"] as const).map(
    (mode) => {
      const summaryActivity = activity(
        "analysis-summary",
        "analysis",
        "completed",
      );
      return {
        id: `reasoning-${mode}`,
        title: {
          live: "根据近期负荷安排恢复训练",
          completed: "回看训练安排的分析依据",
          interrupted: "中断后保留已生成的思路摘要",
          cancelled: "停止后回看已生成的思路摘要",
          failed: "执行失败后仍可回看分析依据",
        }[mode],
        category: "思路摘要",
        status: mode === "live" ? ("running" as const) : mode,
        live: mode === "live",
        expanded: mode !== "live",
        parts: [
          {
            ...summaryActivity,
            data: {
              ...(summaryActivity.data as Record<string, unknown>),
              publicSummary: {
                source: "assistant_public_summary",
                text: "你希望重新建立规律训练，因此起始负荷应兼顾近期运动量和恢复状态。我会先核对这些依据，再安排训练频率与递进幅度。",
              },
            },
          },
          activity(
            "recent-summary",
            "tool",
            mode === "live" ? "running" : mode,
            "activity.recent",
            1,
          ),
          ...(mode === "completed"
            ? [
                text(
                  "建议先建立稳定的训练频率，再根据恢复情况逐步调整。具体安排仍需要你确认。",
                ),
              ]
            : []),
        ],
      };
    },
  ),
  ...(["idle", "used", "compressed", "near-limit"] as const).map((mode) => ({
    id: `context-${mode}`,
    title: {
      idle: "上下文尚无估算",
      used: "查看输入预算和回复预留",
      compressed: "上下文已压缩",
      "near-limit": "上下文接近压缩阈值",
    }[mode],
    category: "上下文",
    parts: [
      text("训练安排已整理好，你可以继续补充目标或调整时间。"),
      ...(mode === "idle"
        ? []
        : [
            {
              type: "data-coach-context-window",
              id: "coach-context-window-current",
              data: {
                step: 2,
                maxContextTokens: 128000,
                reservedOutputTokens: 8000,
                inputBudgetTokens: 120000,
                usedInputTokens: mode === "near-limit" ? 108000 : 30000,
                remainingInputTokens: mode === "near-limit" ? 12000 : 90000,
                compressionThresholdTokens: 100000,
                usageRatio: mode === "near-limit" ? 0.9 : 0.25,
                estimator: "mixed_chars_v1",
                compressed: mode === "compressed",
                compactedMessages: mode === "compressed" ? 12 : 0,
              },
            },
          ]),
    ],
  })),
  {
    id: "decision-rejected",
    title: "方案未采用，保留可读回执",
    category: "决策与回执",
    parts: [tool("CoachDecisionDraft", { ...decision, state: "REJECTED" })],
  },
  {
    id: "decision-approved",
    title: "已确认但尚未收到执行成功回执",
    category: "决策与回执",
    parts: [tool("CoachDecisionDraft", { ...decision, state: "APPROVED" })],
  },
  {
    id: "timeline-zone-empty",
    title: "读取步骤内显示一次空区间结果",
    category: "步骤结果归属",
    expanded: true,
    parts: [
      activity("zones-call", "tool", "completed", "profile.zone_ranges"),
      tool(
        "ProfileZoneRanges",
        {
          kind: "profile_zone_ranges",
          sportType: "RUN",
          pace: { configured: false, zones: [] },
          heartRate: { configured: false, zones: [] },
          power: { configured: false, zones: [] },
        },
        "zones-call",
      ),
    ],
  },
  {
    id: "timeline-zone-metrics",
    title: "切换配速、心率和功率区间",
    category: "步骤结果归属",
    expanded: true,
    parts: [
      activity("zones-call", "tool", "completed", "profile.zone_ranges"),
      tool(
        "ProfileZoneRanges",
        {
          ...zones,
          pace: {
            configured: true,
            benchmark: "VO2MAX",
            zones: [
              { order: 1, name: "Z1 · 轻松", min: 0.372, max: 0.467 },
              { order: 2, name: "Z2 · 马拉松", min: 0.328, max: 0.367 },
              { order: 3, name: "Z3 · 阈值", min: 0.299, max: 0.313 },
            ],
          },
          power: {
            configured: true,
            benchmark: "CP 280 W",
            zones: [
              { order: 1, name: "Z1 · 恢复", min: 0, max: 168 },
              { order: 2, name: "Z2 · 有氧", min: 169, max: 224 },
              { order: 3, name: "Z3 · 节奏", min: 225, max: 252 },
            ],
          },
        },
        "zones-call",
      ),
    ],
  },
  {
    id: "timeline-evidence-empty",
    title: "展开步骤查看区间与空赛事结果",
    category: "步骤结果归属",
    expanded: true,
    parts: [
      activity("zones-call", "tool", "completed", "profile.zone_ranges"),
      tool("ProfileZoneRanges", zones, "zones-call"),
      activity(
        "events-call",
        "tool",
        "completed",
        "competition.events.list",
        1,
      ),
      tool(
        "CompetitionEvents",
        {
          kind: "competition_events",
          startDate: "2026-10-01",
          endDate: "2026-12-31",
          total: 0,
          events: [],
        },
        "events-call",
      ),
      text("已读取你的强度区间。这个查询范围内没有赛事安排。"),
    ],
    expected: "查询范围内暂无赛事安排。",
  },
  {
    id: "timeline-evidence-events",
    title: "赛事详情留在读取赛事安排步骤内",
    category: "步骤结果归属",
    expanded: true,
    parts: [
      activity("events-call", "tool", "completed", "competition.events.list"),
      tool(
        "CompetitionEvents",
        {
          kind: "competition_events",
          startDate: "2026-10-01",
          endDate: "2026-12-31",
          total: 2,
          events: [
            { title: "秋季半程马拉松", startDate: "2026-11-08", endDate: null },
            {
              title: "冬季越野体验赛",
              startDate: "2026-12-05",
              endDate: "2026-12-06",
            },
          ],
        },
        "events-call",
      ),
      text("查询到两场赛事，具体日期可以在读取步骤中查看。"),
    ],
    expected: "秋季半程马拉松",
  },
  {
    id: "timeline-evidence-parallel",
    title: "同名读取步骤各自保留结果",
    category: "步骤结果归属",
    expanded: true,
    parts: [
      activity("recent-one", "tool", "completed", "activity.recent"),
      activity("recent-two", "tool", "completed", "activity.recent", 1),
      tool(
        "ActivityRecent",
        { kind: "activity_recent", items: activityItems.slice(1) },
        "recent-two",
      ),
      tool(
        "ActivityRecent",
        { kind: "activity_recent", items: activityItems.slice(0, 1) },
        "recent-one",
      ),
    ],
  },
  {
    id: "timeline-plan-delivery",
    title: "计划草案与设计说明一起交付",
    category: "步骤结果归属",
    parts: [
      activity("zones-call", "tool", "completed", "profile.zone_ranges"),
      tool("ProfileZoneRanges", zones, "zones-call"),
      activity(
        "draft-call",
        "tool",
        "completed",
        "present_coach_plan_draft",
        1,
      ),
      tool("PresentCoachPlanDraft", draft, "draft-call"),
      text(
        "这份草案围绕半马基础期安排：一周四次跑步，以轻松跑和恢复跑为主，搭配一次短间歇与一次长距离。训练之间留出恢复时间，让耐力积累与较高强度刺激错开。\n\n这是一周的安排，还不能据此判断长期递进是否合适；如果执行后疲劳偏高，可以先减少间歇量。\n\n**目前只是草案，尚未保存或启用。** 请先查看每天的训练，确认后点击「保存计划」；也可以告诉我哪些天或训练内容需要调整。",
      ),
    ],
    expected: "目前只是草案，尚未保存或启用。",
  },
  {
    id: "empty",
    title: "开始新的训练对话",
    category: "基础",
    parts: [],
    empty: true,
  },
  {
    id: "run-running",
    title: "分析最近一周的训练",
    category: "执行过程",
    parts: running,
    status: "running",
    live: true,
  },
  {
    id: "run-completed",
    title: "完成后的执行摘要",
    category: "执行过程",
    parts: [
      activity("analysis", "analysis", "completed"),
      text(
        "最近一周的训练频率稳定。建议今天安排 30 分钟轻松跑，周末再完成长距离训练。",
      ),
    ],
    expected: "最近一周的训练频率稳定。",
  },
  {
    id: "run-expanded",
    title: "展开查看完整执行过程",
    category: "执行过程",
    expanded: true,
    parts: [
      activity("analysis", "analysis", "completed"),
      activity("skill", "skill", "completed", "training-analytics", 1),
      activity("read", "tool", "completed", "activity.recent", 2),
      {
        type: "data-coach-text-segment",
        id: "narration",
        data: {
          segmentId: "narration",
          modelStepId: "step-1",
          textOrdinal: 0,
          placement: "activity",
        },
      },
      text("已读取最近 7 天的训练与负荷。接下来结合恢复情况给出建议。"),
      text("今天优先恢复，保留轻松活动。"),
    ],
  },
  {
    id: "run-failed",
    title: "技能加载失败",
    category: "执行过程",
    status: "failed",
    parts: [
      activity("skill", "skill", "failed", "training-analytics"),
      {
        type: "data-coach-turn-error",
        data: {
          code: "model_unavailable",
          message: "本次分析未能完成，已保留执行过程。",
        },
      },
    ],
  },
  {
    id: "run-cancelled",
    title: "用户主动停止",
    category: "执行过程",
    status: "cancelled",
    expanded: true,
    parts: [
      activity("analysis", "analysis", "completed"),
      activity("tool", "tool", "cancelled", "activity.recent", 1),
    ],
  },
  {
    id: "run-interrupted",
    title: "连接中断后手动继续",
    category: "执行过程",
    status: "interrupted",
    parts: [activity("tool", "tool", "interrupted", "activity.recent")],
  },
  {
    id: "run-write-blocked",
    title: "写入结果待核实，禁止盲目重试",
    category: "执行过程",
    status: "interrupted",
    retryBlocked: true,
    parts: [
      activity("write", "tool", "interrupted", "mutation_plan_workout_update"),
    ],
  },
  {
    id: "question-loading",
    title: "正在准备澄清问题",
    category: "问答",
    live: true,
    status: "running",
    parts: [activity("question-tool", "tool", "running", "ask_user_question")],
  },
  {
    id: "question-pending",
    title: "先确认训练目标和安排",
    category: "问答",
    status: "awaiting_input",
    parts: questionParts(),
  },
  {
    id: "question-selected",
    title: "选择后可以继续下一步",
    category: "问答",
    status: "awaiting_input",
    interaction: "select",
    parts: questionParts(),
  },
  {
    id: "question-dismissed",
    title: "暂时收起问题，可以继续对话",
    category: "问答",
    status: "awaiting_input",
    interaction: "dismiss",
    parts: questionParts(),
  },
  {
    id: "question-reopened",
    title: "重新打开问题，保留已选答案",
    category: "问答",
    status: "awaiting_input",
    interaction: "reopen",
    parts: questionParts(),
  },
  {
    id: "question-next",
    title: "多题问答的最后一题",
    category: "问答",
    status: "awaiting_input",
    interaction: "next",
    parts: questionParts(),
  },
  {
    id: "question-multiple",
    title: "多选训练条件",
    category: "问答",
    status: "awaiting_input",
    interaction: "multi",
    parts: [
      tool(
        "AskUserQuestion",
        {
          questions: [
            {
              ...question.questions[0],
              id: "equipment",
              header: "训练条件",
              question: "你可以使用哪些训练环境？",
              multiSelect: true,
              options: [
                {
                  value: "road",
                  label: "户外道路",
                  description: "可进行轻松跑和长距离训练",
                },
                {
                  value: "track",
                  label: "田径场",
                  description: "适合间歇与配速训练",
                },
                {
                  value: "indoor",
                  label: "跑步机",
                  description: "可在室内稳定训练",
                },
              ],
            },
          ],
        },
        "question-call",
      ),
      questionParts().at(-1)!,
    ],
  },
  {
    id: "question-note",
    title: "直接补充自己的想法",
    category: "问答",
    status: "awaiting_input",
    interaction: "note",
    parts: questionParts("pending", true),
  },
  {
    id: "question-confirmed",
    title: "确认后的只读问答回执",
    category: "问答",
    expanded: true,
    parts: questionParts("resolved"),
  },
  {
    id: "question-skipped",
    title: "跳过问题后的回执",
    category: "问答",
    expanded: true,
    parts: questionParts("skipped"),
  },
  {
    id: "question-inactive",
    title: "任务已停止，问题不再接收回答",
    category: "问答",
    expanded: true,
    status: "cancelled",
    parts: questionParts(),
  },
  {
    id: "plan-loading",
    title: "正在生成训练计划",
    category: "训练计划",
    status: "running",
    live: true,
    parts: [activity("plan", "tool", "running", "present_coach_plan_draft")],
  },
  {
    id: "plan-draft",
    title: "预览一周训练计划",
    category: "训练计划",
    parts: [tool("PresentCoachPlanDraft", draft)],
  },
  {
    id: "plan-saved",
    title: "训练计划已保存",
    category: "训练计划",
    parts: [tool("PresentCoachPlanDraft", draft)],
    rowsAfter: [
      userReceipt("coach_plan_draft_saved", { planId: "gallery-plan" }),
    ],
  },
  ...(
    [
      ["run", "RUN", "ENDURANCE"],
      ["ride", "CYCLING", "ENDURANCE"],
      ["swim", "SWIM", "ENDURANCE"],
      ["strength", "UNKNOWN", "STRENGTH"],
      ["freeform", "STRETCHING", "FREEFORM"],
    ] as const
  ).map(([id, sport, kind]) => ({
    id: `workout-${id}`,
    title: `训练课预览 · ${id}`,
    category: "Workout",
    expanded: true,
    parts: [tool("PlanDayView", day(sport, kind))],
  })),
  {
    id: "workout-rest",
    title: "当天没有安排训练",
    category: "Workout",
    parts: [tool("PlanDayView", { ...day(), workouts: [] })],
  },
  {
    id: "workout-adjustment",
    title: "比较训练课调整前后",
    category: "Workout",
    parts: [tool("PresentPlanWorkoutAdjustmentDraft", adjustment)],
  },
  {
    id: "workout-parsing",
    title: "训练结构图加载中",
    category: "Workout",
    parts: [tool("PresentPlanWorkoutAdjustmentDraft", adjustment)],
  },
  {
    id: "workout-fallback",
    title: "图表解析失败，保留可读课表",
    category: "Workout",
    parts: [tool("PresentPlanWorkoutAdjustmentDraft", adjustment)],
  },
  {
    id: "workout-applied",
    title: "训练调整已应用，不重复提交",
    category: "Workout",
    parts: [tool("PresentPlanWorkoutAdjustmentDraft", adjustment)],
    rowsAfter: [
      userReceipt("plan_workout_adjustment_applied", {
        planId: "gallery-plan",
        workoutId: "gallery-workout",
      }),
    ],
  },
  {
    id: "decision-pending",
    title: "新增训练前的确认",
    category: "决策与回执",
    parts: [tool("CoachDecisionDraft", decision)],
  },
  {
    id: "decision-applied",
    title: "确认后的决策回执",
    category: "决策与回执",
    parts: [tool("CoachDecisionDraft", decision), applied("APPLIED")],
  },
  {
    id: "decision-conflict",
    title: "计划已变化，需要重新分析",
    category: "决策与回执",
    parts: [applied("REBASE_REQUIRED")],
  },
  {
    id: "decision-failed",
    title: "计划变更应用失败",
    category: "决策与回执",
    parts: [applied("FAILED")],
  },
  {
    id: "decision-skipped",
    title: "本次未修改正式计划",
    category: "决策与回执",
    parts: [applied("SKIPPED")],
  },
  {
    id: "mutation-undo",
    title: "操作成功，可在窗口内撤销",
    category: "决策与回执",
    parts: [mutation("2026-10-09T03:01:00.000Z")],
  },
  {
    id: "mutation-undone",
    title: "操作已撤销",
    category: "决策与回执",
    interaction: "undo",
    parts: [mutation("2026-10-09T03:01:00.000Z")],
  },
  {
    id: "mutation-expired",
    title: "撤销窗口已经结束",
    category: "决策与回执",
    parts: [mutation("2026-10-09T02:59:00.000Z")],
  },
  {
    id: "mutation-confirmed",
    title: "需要确认的变更已完成",
    category: "决策与回执",
    parts: [mutation(null, "HIGH")],
  },
  {
    id: "activity-recent",
    title: "最近的训练活动",
    category: "数据结果",
    parts: [
      tool("ActivityRecent", { kind: "activity_recent", items: activityItems }),
    ],
  },
  {
    id: "activity-empty",
    title: "这个范围没有训练记录",
    category: "数据结果",
    parts: [tool("ActivityRecent", { kind: "activity_recent", items: [] })],
  },
  {
    id: "activity-day",
    title: "查看一天的训练记录",
    category: "数据结果",
    parts: [
      tool("ActivityDayView", {
        kind: "activity_day_view",
        date: "2026-10-09",
        items: activityItems.slice(0, 1),
      }),
    ],
    expanded: true,
  },
  {
    id: "activity-collapsed",
    title: "收起训练活动卡片",
    category: "数据结果",
    parts: [
      tool("ActivityRecent", { kind: "activity_recent", items: activityItems }),
    ],
    interaction: "collapse-card",
  },
  {
    id: "pmc-range",
    title: "最近一周负荷趋势",
    category: "数据结果",
    expanded: true,
    parts: [
      tool("PmcRange", {
        kind: "pmc_range",
        from: "2026-10-03",
        to: "2026-10-09",
        granularity: "day",
        summary: {
          activeDays: 5,
          restDays: 2,
          totalLoad: 286,
          avgDailyLoad: 40.9,
        },
        points: [0, 1, 2, 3, 4, 5, 6].map((i) => ({
          date: `2026-10-${String(i + 3).padStart(2, "0")}`,
          ATL: [43, 48, 51, 45, 54, 49, 46][i],
          CTL: [39, 39.5, 40, 40.1, 40.7, 40.9, 41][i],
          TSB: [-4, -8.5, -11, -4.9, -13.3, -8.1, -5][i],
        })),
      }),
    ],
  },
  {
    id: "profile-thresholds",
    title: "当前阈值与区间配置",
    category: "数据结果",
    expanded: true,
    parts: [
      tool("ProfileZones", {
        kind: "profile_zones",
        ftp: 245,
        lthr: 173,
        maxHeartRate: 190,
        timezone: "Asia/Shanghai",
        zoneAvailability: {
          hasHeartRateZones: true,
          hasPowerZones: true,
          hasPaceZones: false,
        },
      }),
    ],
  },
  {
    id: "profile-zones",
    title: "跑步心率区间",
    category: "数据结果",
    expanded: true,
    parts: [tool("ProfileZoneRanges", zones)],
  },
  {
    id: "profile-empty",
    title: "尚未配置强度区间",
    category: "数据结果",
    expanded: true,
    parts: [
      tool("ProfileZoneRanges", {
        kind: "profile_zone_ranges",
        sportType: "RUN",
      }),
    ],
  },
  {
    id: "fitness-estimated",
    title: "体能评估结果与采用确认",
    category: "体能评估",
    parts: [tool("FitnessAssessment", fitness)],
  },
  {
    id: "fitness-expired",
    title: "估计已过期，需要重新评估",
    category: "体能评估",
    parts: [
      tool("FitnessAssessment", {
        ...fitness,
        applyOptions: fitness.applyOptions.map((option) => ({
          ...option,
          expiresAt: startedAt,
        })),
      }),
    ],
  },
  {
    id: "fitness-observed",
    title: "观察值，不作为阈值写入",
    category: "体能评估",
    parts: [
      tool("FitnessAssessment", {
        ...fitness,
        status: "OBSERVATION_ONLY",
        method: { ...fitness.method, id: "observed-max-hr" },
        candidates: [],
        observations: [{ metric: "observedMaxHr", value: 187, unit: "bpm" }],
        nextActions: [],
        applyOptions: [],
      }),
    ],
  },
  {
    id: "fitness-tracking",
    title: "选择是否跟踪测试课",
    category: "体能评估",
    parts: [
      tool("FitnessTracking", {
        kind: "fitness_tracking_offer",
        taskId: "gallery-fitness",
        workoutId: "gallery-workout",
      }),
    ],
  },
  ...explorationFixtures().map((value, index) => ({
    id: `chart-${index + 1}`,
    title: value.title,
    category: "训练图表",
    parts: [tool("TrainingVisualization", value)],
  })),
  {
    id: "invalid-card",
    title: "结构化结果无法显示",
    category: "异常",
    parts: [tool("PresentCoachPlanDraft", { invalid: true })],
  },
  {
    id: "credits-error",
    title: "积分不足时的提示",
    category: "异常",
    status: "failed",
    parts: [
      {
        type: "data-coach-turn-error",
        data: {
          code: "AI_CREDITS_INSUFFICIENT",
          message: "可用积分不足，请补充积分后继续。",
        },
      },
    ],
  },
  {
    id: "credits-topup-dialog",
    title: "积分不足时原位补充积分",
    category: "异常",
    status: "failed",
    interaction: "open-credit-recovery",
    membershipPlan: "PLUS",
    parts: [
      {
        type: "data-coach-turn-error",
        data: {
          code: "AI_CREDIT_DEBT_OUTSTANDING",
          message: "AI_CREDIT_DEBT_OUTSTANDING",
        },
      },
    ],
  },
  {
    id: "credits-membership-dialog",
    title: "非会员积分不足时原位开通会员",
    category: "异常",
    status: "failed",
    interaction: "open-credit-recovery",
    membershipPlan: "FREE",
    parts: [
      {
        type: "data-coach-turn-error",
        data: {
          code: "AI_CREDITS_INSUFFICIENT",
          message: "AI_CREDITS_INSUFFICIENT",
        },
      },
    ],
  },
];
