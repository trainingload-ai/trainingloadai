import {
  COACH_QUESTION_REPLY_KIND,
  type AskUserQuestionData,
  type CoachPlanDraftData,
  type CoachQuestionReplyToolResultPayload,
  type PlanWorkoutAdjustmentDraftData,
} from "@shared/ai-coach-schema";

import type {
  CoachDemoCopy,
  CoachDemoMessage,
  CoachDemoReadCard,
  CoachDemoSession,
} from "./types";

type SessionStrings = {
  adjust: {
    title: string;
    composer: string;
    user: string;
    assistant: string;
    readCards: CoachDemoReadCard[];
    adjustment: {
      title: string;
      reason: string;
      beforeName: string;
      afterName: string;
      beforeText: string;
      afterText: string;
      changeField: string;
    };
  };
  create: {
    title: string;
    composer: string;
    userAsk: string;
    userReply: string;
    question: AskUserQuestionData;
    questionReply: CoachQuestionReplyToolResultPayload;
    assistant: string;
    planDraft: CoachPlanDraftData;
  };
  longRun: {
    title: string;
    composer: string;
    user: string;
    assistant: string;
    readCards: CoachDemoReadCard[];
  };
};

function buildPlanDraftWorkouts(
  rows: Array<Array<Array<{ sportType: string; text: string; name?: string }>>>,
): CoachPlanDraftData["workouts"] {
  const workouts: CoachPlanDraftData["workouts"] = [];
  rows.forEach((week, weekIndex) => {
    week.forEach((day, dayIndex) => {
      day.forEach((workout, sessionIndex) => {
        workouts.push({
          weekIndex: weekIndex + 1,
          dayIndex: dayIndex + 1,
          sessionIndex: sessionIndex + 1,
          sportType: workout.sportType,
          text: workout.text,
          name: workout.name,
        });
      });
    });
  });
  return workouts;
}

const PLAN_DRAFT_GRID_EN = [
  [
    [],
    [{ sportType: "RUN", text: "Easy 45m", name: "Easy run" }],
    [],
    [{ sportType: "RUN", text: "Steady 35m", name: "Steady run" }],
    [],
    [{ sportType: "RUN", text: "Long 80m", name: "Long run" }],
    [],
  ],
  [
    [],
    [{ sportType: "RUN", text: "Easy 40m", name: "Easy run" }],
    [{ sportType: "RUN", text: "Tempo 3x8m", name: "Tempo run" }],
    [],
    [{ sportType: "RUN", text: "Easy 35m", name: "Easy run" }],
    [{ sportType: "RUN", text: "Long 95m", name: "Long run" }],
    [],
  ],
  [
    [],
    [{ sportType: "RUN", text: "Easy 45m", name: "Easy run" }],
    [],
    [{ sportType: "RUN", text: "Progression 50m", name: "Progression run" }],
    [],
    [{ sportType: "RUN", text: "Long 105m", name: "Long run" }],
    [{ sportType: "RUN", text: "Recovery 30m", name: "Recovery run" }],
  ],
  [
    [],
    [{ sportType: "RUN", text: "Easy 40m", name: "Easy run" }],
    [{ sportType: "RUN", text: "Tempo 2x12m", name: "Tempo run" }],
    [],
    [{ sportType: "RUN", text: "Steady 40m", name: "Steady run" }],
    [{ sportType: "RUN", text: "Long 120m", name: "Long run" }],
    [],
  ],
];

const PLAN_DRAFT_GRID_ZH = [
  [
    [],
    [{ sportType: "RUN", text: "轻松跑 45m", name: "轻松跑" }],
    [],
    [{ sportType: "RUN", text: "稳态跑 35m", name: "稳态跑" }],
    [],
    [{ sportType: "RUN", text: "长距离 80m", name: "长距离" }],
    [],
  ],
  [
    [],
    [{ sportType: "RUN", text: "轻松跑 40m", name: "轻松跑" }],
    [{ sportType: "RUN", text: "节奏跑 3x8m", name: "节奏跑" }],
    [],
    [{ sportType: "RUN", text: "轻松跑 35m", name: "轻松跑" }],
    [{ sportType: "RUN", text: "长距离 95m", name: "长距离" }],
    [],
  ],
  [
    [],
    [{ sportType: "RUN", text: "轻松跑 45m", name: "轻松跑" }],
    [],
    [{ sportType: "RUN", text: "递进跑 50m", name: "递进跑" }],
    [],
    [{ sportType: "RUN", text: "长距离 105m", name: "长距离" }],
    [{ sportType: "RUN", text: "恢复跑 30m", name: "恢复跑" }],
  ],
  [
    [],
    [{ sportType: "RUN", text: "轻松跑 40m", name: "轻松跑" }],
    [{ sportType: "RUN", text: "节奏跑 2x12m", name: "节奏跑" }],
    [],
    [{ sportType: "RUN", text: "稳态跑 40m", name: "稳态跑" }],
    [{ sportType: "RUN", text: "长距离 120m", name: "长距离" }],
    [],
  ],
];

function buildAdjustmentDraft(
  s: SessionStrings["adjust"]["adjustment"],
): PlanWorkoutAdjustmentDraftData {
  return {
    planId: "demo-plan",
    workoutId: "demo-workout-thu",
    title: s.title,
    reason: s.reason,
    before: {
      weekIndex: 5,
      dayIndex: 4,
      sportType: "RUN",
      name: s.beforeName,
      text: s.beforeText,
    },
    after: {
      weekIndex: 5,
      dayIndex: 4,
      sportType: "RUN",
      name: s.afterName,
      text: s.afterText,
    },
    changes: [
      {
        field: s.changeField,
        before: s.beforeText,
        after: s.afterText,
      },
    ],
  };
}

function buildSessions(s: SessionStrings): CoachDemoSession[] {
  const adjustMessages: CoachDemoMessage[] = [
    { id: "adjust-u1", role: "user", text: s.adjust.user },
    {
      id: "adjust-a1",
      role: "assistant",
      parts: [
        { type: "text", text: s.adjust.assistant },
        { type: "readCards", cards: s.adjust.readCards },
        {
          type: "planAdjustment",
          data: buildAdjustmentDraft(s.adjust.adjustment),
        },
      ],
    },
  ];

  const createMessages: CoachDemoMessage[] = [
    { id: "create-u1", role: "user", text: s.create.userAsk },
    {
      id: "create-a1",
      role: "assistant",
      parts: [
        {
          type: "question",
          data: s.create.question,
          reply: s.create.questionReply,
        },
      ],
    },
    { id: "create-u2", role: "user", text: s.create.userReply },
    {
      id: "create-a2",
      role: "assistant",
      parts: [
        { type: "text", text: s.create.assistant },
        { type: "planDraft", data: s.create.planDraft },
      ],
    },
  ];

  const longRunMessages: CoachDemoMessage[] = [
    { id: "long-u1", role: "user", text: s.longRun.user },
    {
      id: "long-a1",
      role: "assistant",
      parts: [
        { type: "text", text: s.longRun.assistant },
        { type: "readCards", cards: s.longRun.readCards },
      ],
    },
  ];

  return [
    {
      id: "adjust",
      title: s.adjust.title,
      bucket: "today",
      composer: s.adjust.composer,
      messages: adjustMessages,
    },
    {
      id: "create",
      title: s.create.title,
      bucket: "yesterday",
      composer: s.create.composer,
      messages: createMessages,
    },
    {
      id: "long-run",
      title: s.longRun.title,
      bucket: "past",
      composer: s.longRun.composer,
      messages: longRunMessages,
    },
  ];
}

const enSessionStrings: SessionStrings = {
  adjust: {
    title: "Marathon base adjustment",
    composer: "Ask: if Friday feels good, can we bring intensity back?",
    user: "I feel tired this week. Should we adjust Thursday tempo?",
    assistant:
      "Keep the training intent, but make Thursday a shorter steady run. That protects Saturday long run while the block keeps moving.",
    readCards: [
      {
        name: "PlanDayView",
        title: "Current plan",
        subtitle: "Week 5 · Thu",
      },
      {
        name: "ActivityRecent",
        title: "Recent activities",
        subtitle: "Last 7 days · 4 sessions",
      },
      {
        name: "PmcRange",
        title: "Training load",
        subtitle: "2026-05-24 → 2026-06-30",
        stats: [
          { label: "Active days", value: "18" },
          { label: "Rest days", value: "12" },
          { label: "Total load", value: "842" },
          { label: "Avg daily", value: "47" },
          { label: "TSB", value: "-4" },
        ],
      },
    ],
    adjustment: {
      title: "Thursday workout adjustment",
      reason:
        "Fatigue is elevated this week. Reduce Thursday stress while keeping aerobic rhythm.",
      beforeName: "Tempo run",
      afterName: "Steady run",
      beforeText: "work 3x10m pace Z4",
      afterText: "work 35m pace Z2",
      changeField: "text",
    },
  },
  create: {
    title: "12-week half marathon plan",
    composer: "Can we add one more quality session in week 8?",
    userAsk: "Build me a 12-week half marathon plan. I currently run 4 times per week.",
    userReply: "Goal: Sub-2:00 half · 4 runs/week · 12 weeks",
    question: {
      questions: [
        {
          id: "goal",
          header: "Race goal",
          question: "What is your primary race goal?",
          options: [
            {
              value: "sub-2",
              label: "Sub-2:00 half marathon",
              description: "Balanced build with one quality session per week.",
            },
            {
              value: "finish",
              label: "Finish strong",
              description: "Conservative volume with extra recovery spacing.",
            },
          ],
        },
      ],
    },
    questionReply: {
      kind: COACH_QUESTION_REPLY_KIND,
      repliesToAssistantMessageId: "create-a1",
      answers: { goal: "sub-2" },
      notes: { goal: "" },
    },
    assistant:
      "Here is a draft block with progressive long runs, one weekly quality session, and recovery spacing that matches your current volume.",
    planDraft: {
      title: "Half marathon build · 12 weeks",
      description:
        "Aerobic base first, then threshold support and race-specific long runs in the final 4 weeks.",
      periodWeeks: 4,
      workouts: buildPlanDraftWorkouts(PLAN_DRAFT_GRID_EN),
    },
  },
  longRun: {
    title: "Weekend long run catch-up",
    composer: "Should I move Tuesday intervals if legs still feel heavy?",
    user: "I missed Saturday's long run because of travel. How should I catch up this week?",
    assistant:
      "Do not stack the full missed long run on top of this week's plan. Shift one aerobic session later in the week and keep Tuesday quality only if sleep and TSB look stable.",
    readCards: [
      {
        name: "PlanDayView",
        title: "This week's plan",
        subtitle: "Week 6 · Sat missed",
      },
      {
        name: "ActivityRecent",
        title: "Missed workout",
        subtitle: "Sat long run · skipped",
      },
      {
        name: "PmcRange",
        title: "Recovery trend",
        subtitle: "Last 14 days",
        stats: [
          { label: "TSB", value: "-6" },
          { label: "Sleep avg", value: "6.8h" },
          { label: "Rest days", value: "2" },
        ],
      },
    ],
  },
};

const zhSessionStrings: SessionStrings = {
  adjust: {
    title: "马拉松基础周期调整",
    composer: "继续问：如果周五恢复很好，可以把强度加回来吗？",
    user: "这周有点累，周四的节奏跑要不要调整？",
    assistant:
      "建议保留训练目标，但把周四节奏跑改成较短的稳态跑。这样不打断周期，也能给周六长距离留出恢复空间。",
    readCards: [
      {
        name: "PlanDayView",
        title: "当前计划",
        subtitle: "第 5 周 · 周四",
      },
      {
        name: "ActivityRecent",
        title: "最近训练",
        subtitle: "近 7 天 · 4 次",
      },
      {
        name: "PmcRange",
        title: "训练负荷",
        subtitle: "2026-05-24 → 2026-06-30",
        stats: [
          { label: "活跃天", value: "18" },
          { label: "休息天", value: "12" },
          { label: "总负荷", value: "842" },
          { label: "日均", value: "47" },
          { label: "TSB", value: "-4" },
        ],
      },
    ],
    adjustment: {
      title: "周四训练调整",
      reason: "本周疲劳偏高，降低周四刺激，同时保留有氧节奏。",
      beforeName: "节奏跑",
      afterName: "稳态跑",
      beforeText: "work 3x10m pace Z4",
      afterText: "work 35m pace Z2",
      changeField: "text",
    },
  },
  create: {
    title: "12 周半马计划",
    composer: "第 8 周能不能再加一次质量课？",
    userAsk: "帮我做一个 12 周半马计划，目前每周跑 4 次。",
    userReply: "目标：半马 Sub-2:00 · 每周 4 跑 · 12 周",
    question: {
      questions: [
        {
          id: "goal",
          header: "比赛目标",
          question: "你的主要比赛目标是什么？",
          options: [
            {
              value: "sub-2",
              label: "半马 Sub-2:00",
              description: "均衡推进，每周保留 1 次质量课。",
            },
            {
              value: "finish",
              label: "稳健完赛",
              description: "保守跑量，额外恢复间隔。",
            },
          ],
        },
      ],
    },
    questionReply: {
      kind: COACH_QUESTION_REPLY_KIND,
      repliesToAssistantMessageId: "create-a1",
      answers: { goal: "sub-2" },
      notes: { goal: "" },
    },
    assistant:
      "这是按你当前跑量生成的草案：先打有氧基础，再逐步加入阈值支持和赛前长距离。",
    planDraft: {
      title: "半马周期 · 12 周",
      description: "前段以有氧为主，后 4 周加入阈值支持和比赛型长距离。",
      periodWeeks: 4,
      workouts: buildPlanDraftWorkouts(PLAN_DRAFT_GRID_ZH),
    },
  },
  longRun: {
    title: "周末长跑补训",
    composer: "如果腿还是沉，周二间歇要不要顺延？",
    user: "周六长距离因为出差错过了，这周应该怎么补？",
    assistant:
      "不建议把完整的长距离直接叠加到本周计划上。可以把一次有氧课挪到本周后半段，周二质量课只有在睡眠和 TSB 都稳定时再保留。",
    readCards: [
      {
        name: "PlanDayView",
        title: "本周计划",
        subtitle: "第 6 周 · 周六漏训",
      },
      {
        name: "ActivityRecent",
        title: "漏训记录",
        subtitle: "周六长距离 · 未执行",
      },
      {
        name: "PmcRange",
        title: "恢复趋势",
        subtitle: "近 14 天",
        stats: [
          { label: "TSB", value: "-6" },
          { label: "平均睡眠", value: "6.8h" },
          { label: "休息天", value: "2" },
        ],
      },
    ],
  },
};

const jaSessionStrings: SessionStrings = {
  adjust: {
    title: "マラソン基礎期の調整",
    composer: "続けて質問：金曜に回復していたら、強度を戻せますか？",
    user: "今週は少し疲れています。木曜のテンポ走は調整すべきですか？",
    assistant:
      "練習の目的は残しつつ、木曜のテンポ走を短めのステディ走に変えるのがおすすめです。ブロックの流れを止めず、土曜のロング走に向けた回復も確保できます。",
    readCards: [
      {
        name: "PlanDayView",
        title: "現在の計画",
        subtitle: "第 5 週 · 木",
      },
      {
        name: "ActivityRecent",
        title: "直近の練習",
        subtitle: "過去 7 日 · 4 セッション",
      },
      {
        name: "PmcRange",
        title: "トレーニング負荷",
        subtitle: "2026-05-24 → 2026-06-30",
        stats: [
          { label: "アクティブ日", value: "18" },
          { label: "休息日", value: "12" },
          { label: "総負荷", value: "842" },
          { label: "日平均", value: "47" },
          { label: "TSB", value: "-4" },
        ],
      },
    ],
    adjustment: {
      title: "木曜の練習調整",
      reason: "今週は疲労が高めです。木曜の負荷を下げつつ、有酸素リズムは維持します。",
      beforeName: "テンポ走",
      afterName: "ステディ走",
      beforeText: "work 3x10m pace Z4",
      afterText: "work 35m pace Z2",
      changeField: "text",
    },
  },
  create: {
    title: "12 週ハーフ計画",
    composer: "第 8 週にもう 1 本クオリティを入れられますか？",
    userAsk: "12 週間のハーフマラソン計画を作ってください。現在は週 4 走です。",
    userReply: "目標：ハーフ Sub-2:00 · 週 4 走 · 12 週",
    question: {
      questions: [
        {
          id: "goal",
          header: "レース目標",
          question: "主なレース目標はどれですか？",
          options: [
            {
              value: "sub-2",
              label: "ハーフ Sub-2:00",
              description: "週 1 本のクオリティを保ちながら段階的に積み上げます。",
            },
            {
              value: "finish",
              label: "安定完走",
              description: "保守的な走量と回復間隔。",
            },
          ],
        },
      ],
    },
    questionReply: {
      kind: COACH_QUESTION_REPLY_KIND,
      repliesToAssistantMessageId: "create-a1",
      answers: { goal: "sub-2" },
      notes: { goal: "" },
    },
    assistant:
      "現在の走量に合わせた草案です。有酸素基盤を作り、その後しきい値サポートとレース向けロング走を入れます。",
    planDraft: {
      title: "ハーフマラソン · 12 週",
      description:
        "前半は有酸素中心、最後の 4 週でしきい値とレース向けロング走を強化します。",
      periodWeeks: 4,
      workouts: buildPlanDraftWorkouts(PLAN_DRAFT_GRID_EN),
    },
  },
  longRun: {
    title: "週末ロング走の補填",
    composer: "脚がまだ重いなら、火曜のインターバルは延期すべきですか？",
    user: "土曜のロング走を出張で逃しました。今週はどう補填すべきですか？",
    assistant:
      "逃したロング走をそのまま今週に全部載せるのは避けましょう。週後半に有酸素 1 本をずらし、睡眠と TSB が安定している場合だけ火曜のクオリティを残します。",
    readCards: [
      {
        name: "PlanDayView",
        title: "今週の計画",
        subtitle: "第 6 週 · 土曜欠走",
      },
      {
        name: "ActivityRecent",
        title: "欠走",
        subtitle: "土曜ロング · 未実施",
      },
      {
        name: "PmcRange",
        title: "回復トレンド",
        subtitle: "過去 14 日",
        stats: [
          { label: "TSB", value: "-6" },
          { label: "平均睡眠", value: "6.8h" },
          { label: "休息日", value: "2" },
        ],
      },
    ],
  },
};

function buildUiCopy(
  sessions: CoachDemoSession[],
  overrides: Partial<Omit<CoachDemoCopy, "sessions">> = {},
): CoachDemoCopy {
  return {
    review: "AI review",
    history: "History",
    newChat: "New chat",
    today: "Today",
    yesterday: "Yesterday",
    past: "Earlier",
    composerHint: "Shift + Enter for a new line",
    thinking: "Thinking",
    send: "Send",
    questions: {
      title: "Quick questions",
      answeredBadge: "Answered",
      submit: "Send",
      answeredCount: (answered, total) => `${answered} / ${total}`,
    },
    readCards: {
      toggleDetails: "Show details",
    },
    workoutAdjustment: {
      before: "Before",
      after: "After",
      apply: "Apply change",
      changes: "Changes",
      position: (week, day) => `Week ${week} · Day ${day}`,
    },
    planDraft: {
      weekColumn: "Week",
      weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      weekLabel: (week) => `W${week}`,
      restLabel: "Rest",
      summary: (weeks, sessions) => `${weeks} weeks · ${sessions} sessions`,
      createPlan: "Create plan",
    },
    sessions,
    ...overrides,
  };
}

const enCopy = buildUiCopy(buildSessions(enSessionStrings));

const zhCopy = buildUiCopy(buildSessions(zhSessionStrings), {
  review: "智能教练复盘",
  history: "历史对话",
  newChat: "新对话",
  today: "今天",
  yesterday: "昨天",
  past: "更早",
  composerHint: "Shift + Enter 换行",
  thinking: "思考",
  send: "发送",
  questions: {
    title: "补充信息",
    answeredBadge: "已回答",
    submit: "发送",
    answeredCount: (answered, total) => `${answered} / ${total}`,
  },
  readCards: {
    toggleDetails: "展开详情",
  },
  workoutAdjustment: {
    before: "调整前",
    after: "调整后",
    apply: "确认调整",
    changes: "变更项",
    position: (week, day) => `第 ${week} 周 · 周${["一", "二", "三", "四", "五", "六", "日"][day - 1] ?? day}`,
  },
  planDraft: {
    weekColumn: "周",
    weekdays: ["一", "二", "三", "四", "五", "六", "日"],
    weekLabel: (week) => `第 ${week} 周`,
    restLabel: "休息",
    summary: (weeks, sessions) => `${weeks} 周 · ${sessions} 次训练`,
    createPlan: "创建计划",
  },
});

const zhHantCopy: CoachDemoCopy = {
  ...zhCopy,
  review: "AI 複盤",
  history: "歷史對話",
  newChat: "新對話",
  composerHint: "Shift + Enter 換行",
  send: "傳送",
  questions: {
    ...zhCopy.questions,
    title: "補充資訊",
    answeredBadge: "已回答",
  },
  readCards: {
    toggleDetails: "展開詳情",
  },
  workoutAdjustment: {
    ...zhCopy.workoutAdjustment,
    before: "調整前",
    after: "調整後",
    apply: "確認調整",
    changes: "變更項",
    position: (week, day) =>
      `第 ${week} 週 · 週${["一", "二", "三", "四", "五", "六", "日"][day - 1] ?? day}`,
  },
  planDraft: {
    ...zhCopy.planDraft,
    createPlan: "建立計畫",
  },
  sessions: buildSessions({
    ...zhSessionStrings,
    adjust: {
      ...zhSessionStrings.adjust,
      title: "馬拉松基礎週期調整",
      composer: "繼續問：如果週五恢復很好，可以把強度加回來嗎？",
      user: "這週有點累，週四的節奏跑要不要調整？",
      assistant:
        "建議保留訓練目標，但把週四節奏跑改成較短的穩態跑。這樣不打斷週期，也能替週六長距離留出恢復空間。",
      readCards: zhSessionStrings.adjust.readCards.map((card) => ({
        ...card,
        title:
          card.name === "PlanDayView"
            ? "目前計畫"
            : card.name === "ActivityRecent"
              ? "近期訓練"
              : "訓練負荷",
      })),
    },
    create: {
      ...zhSessionStrings.create,
      title: "12 週半馬計畫",
      composer: "第 8 週能不能再加一次質量課？",
      userAsk: "幫我做一個 12 週半馬計畫，目前每週跑 4 次。",
      userReply: "目標：半馬 Sub-2:00 · 每週 4 跑 · 12 週",
      planDraft: {
        ...zhSessionStrings.create.planDraft,
        title: "半馬週期 · 12 週",
      },
    },
    longRun: {
      ...zhSessionStrings.longRun,
      title: "週末長跑補訓",
      composer: "如果腿還是沉，週二間歇要不要順延？",
      user: "週六長距離因為出差錯過了，這週應該怎麼補？",
      readCards: zhSessionStrings.longRun.readCards.map((card) => ({
        ...card,
        title:
          card.name === "PlanDayView"
            ? "本週計畫"
            : card.name === "ActivityRecent"
              ? "漏訓記錄"
              : "恢復趨勢",
      })),
    },
  }),
};

const jaCopy = buildUiCopy(buildSessions(jaSessionStrings), {
  review: "AI レビュー",
  history: "履歴",
  newChat: "新しい相談",
  today: "今日",
  yesterday: "昨日",
  past: "以前",
  composerHint: "Shift + Enter で改行",
  thinking: "思考中",
  send: "送信",
  questions: {
    title: "確認事項",
    answeredBadge: "回答済み",
    submit: "送信",
    answeredCount: (answered, total) => `${answered} / ${total}`,
  },
  readCards: {
    toggleDetails: "詳細を表示",
  },
  workoutAdjustment: {
    before: "変更前",
    after: "調整案",
    apply: "変更を確認",
    changes: "変更内容",
    position: (week, day) => `第 ${week} 週 · ${day} 日目`,
  },
  planDraft: {
    weekColumn: "週",
    weekdays: ["月", "火", "水", "木", "金", "土", "日"],
    weekLabel: (week) => `${week} 週`,
    restLabel: "休",
    summary: (weeks, sessions) => `${weeks} 週 · ${sessions} セッション`,
    createPlan: "計画を作成",
  },
});

export const coachDemoCopy = {
  en: enCopy,
  zh: zhCopy,
  "zh-hant": zhHantCopy,
  ja: jaCopy,
} satisfies Record<string, CoachDemoCopy>;

export type CoachDemoLang = keyof typeof coachDemoCopy;
