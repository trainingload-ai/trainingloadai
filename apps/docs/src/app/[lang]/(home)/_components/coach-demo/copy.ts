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

const PLAN_DRAFT_GRID_KO = [
  [
    [],
    [{ sportType: "RUN", text: "이지 런 45m", name: "이지 런" }],
    [],
    [{ sportType: "RUN", text: "스테디 35m", name: "스테디 런" }],
    [],
    [{ sportType: "RUN", text: "장거리 80m", name: "장거리 주" }],
    [],
  ],
  [
    [],
    [{ sportType: "RUN", text: "이지 런 40m", name: "이지 런" }],
    [{ sportType: "RUN", text: "템포 3x8m", name: "템포 런" }],
    [],
    [{ sportType: "RUN", text: "이지 런 35m", name: "이지 런" }],
    [{ sportType: "RUN", text: "장거리 95m", name: "장거리 주" }],
    [],
  ],
  [
    [],
    [{ sportType: "RUN", text: "이지 런 45m", name: "이지 런" }],
    [],
    [{ sportType: "RUN", text: "빌드업 50m", name: "빌드업 런" }],
    [],
    [{ sportType: "RUN", text: "장거리 105m", name: "장거리 주" }],
    [{ sportType: "RUN", text: "회복 런 30m", name: "회복 런" }],
  ],
  [
    [],
    [{ sportType: "RUN", text: "이지 런 40m", name: "이지 런" }],
    [{ sportType: "RUN", text: "템포 2x12m", name: "템포 런" }],
    [],
    [{ sportType: "RUN", text: "스테디 40m", name: "스테디 런" }],
    [{ sportType: "RUN", text: "장거리 120m", name: "장거리 주" }],
    [],
  ],
];

const PLAN_DRAFT_GRID_DE = [
  [
    [],
    [{ sportType: "RUN", text: "Locker 45m", name: "Lockerer Lauf" }],
    [],
    [{ sportType: "RUN", text: "Dauerlauf 35m", name: "Dauerlauf" }],
    [],
    [{ sportType: "RUN", text: "Lang 80m", name: "Langer Lauf" }],
    [],
  ],
  [
    [],
    [{ sportType: "RUN", text: "Locker 40m", name: "Lockerer Lauf" }],
    [{ sportType: "RUN", text: "Tempo 3x8m", name: "Tempolauf" }],
    [],
    [{ sportType: "RUN", text: "Locker 35m", name: "Lockerer Lauf" }],
    [{ sportType: "RUN", text: "Lang 95m", name: "Langer Lauf" }],
    [],
  ],
  [
    [],
    [{ sportType: "RUN", text: "Locker 45m", name: "Lockerer Lauf" }],
    [],
    [{ sportType: "RUN", text: "Steigerung 50m", name: "Steigerungslauf" }],
    [],
    [{ sportType: "RUN", text: "Lang 105m", name: "Langer Lauf" }],
    [{ sportType: "RUN", text: "Regeneration 30m", name: "Regenerationslauf" }],
  ],
  [
    [],
    [{ sportType: "RUN", text: "Locker 40m", name: "Lockerer Lauf" }],
    [{ sportType: "RUN", text: "Tempo 2x12m", name: "Tempolauf" }],
    [],
    [{ sportType: "RUN", text: "Dauerlauf 40m", name: "Dauerlauf" }],
    [{ sportType: "RUN", text: "Lang 120m", name: "Langer Lauf" }],
    [],
  ],
];

const PLAN_DRAFT_GRID_FR = [
  [
    [],
    [{ sportType: "RUN", text: "Facile 45m", name: "Footing facile" }],
    [],
    [{ sportType: "RUN", text: "Soutenu 35m", name: "Allure soutenue" }],
    [],
    [{ sportType: "RUN", text: "Longue 80m", name: "Sortie longue" }],
    [],
  ],
  [
    [],
    [{ sportType: "RUN", text: "Facile 40m", name: "Footing facile" }],
    [{ sportType: "RUN", text: "Tempo 3x8m", name: "Course tempo" }],
    [],
    [{ sportType: "RUN", text: "Facile 35m", name: "Footing facile" }],
    [{ sportType: "RUN", text: "Longue 95m", name: "Sortie longue" }],
    [],
  ],
  [
    [],
    [{ sportType: "RUN", text: "Facile 45m", name: "Footing facile" }],
    [],
    [{ sportType: "RUN", text: "Progressif 50m", name: "Run progressif" }],
    [],
    [{ sportType: "RUN", text: "Longue 105m", name: "Sortie longue" }],
    [{ sportType: "RUN", text: "Récup 30m", name: "Footing récup" }],
  ],
  [
    [],
    [{ sportType: "RUN", text: "Facile 40m", name: "Footing facile" }],
    [{ sportType: "RUN", text: "Tempo 2x12m", name: "Course tempo" }],
    [],
    [{ sportType: "RUN", text: "Soutenu 40m", name: "Allure soutenue" }],
    [{ sportType: "RUN", text: "Longue 120m", name: "Sortie longue" }],
    [],
  ],
];

const PLAN_DRAFT_GRID_ES = [
  [
    [],
    [{ sportType: "RUN", text: "Suave 45m", name: "Rodaje suave" }],
    [],
    [{ sportType: "RUN", text: "Constante 35m", name: "Rodaje constante" }],
    [],
    [{ sportType: "RUN", text: "Largo 80m", name: "Tirada larga" }],
    [],
  ],
  [
    [],
    [{ sportType: "RUN", text: "Suave 40m", name: "Rodaje suave" }],
    [{ sportType: "RUN", text: "Tempo 3x8m", name: "Rodaje tempo" }],
    [],
    [{ sportType: "RUN", text: "Suave 35m", name: "Rodaje suave" }],
    [{ sportType: "RUN", text: "Largo 95m", name: "Tirada larga" }],
    [],
  ],
  [
    [],
    [{ sportType: "RUN", text: "Suave 45m", name: "Rodaje suave" }],
    [],
    [{ sportType: "RUN", text: "Progresivo 50m", name: "Rodaje progresivo" }],
    [],
    [{ sportType: "RUN", text: "Largo 105m", name: "Tirada larga" }],
    [{ sportType: "RUN", text: "Recuperación 30m", name: "Rodaje regenerativo" }],
  ],
  [
    [],
    [{ sportType: "RUN", text: "Suave 40m", name: "Rodaje suave" }],
    [{ sportType: "RUN", text: "Tempo 2x12m", name: "Rodaje tempo" }],
    [],
    [{ sportType: "RUN", text: "Constante 40m", name: "Rodaje constante" }],
    [{ sportType: "RUN", text: "Largo 120m", name: "Tirada larga" }],
    [],
  ],
];

const PLAN_DRAFT_GRID_IT = [
  [
    [],
    [{ sportType: "RUN", text: "Facile 45m", name: "Corsa facile" }],
    [],
    [{ sportType: "RUN", text: "Medio 35m", name: "Corsa media" }],
    [],
    [{ sportType: "RUN", text: "Lungo 80m", name: "Lungo" }],
    [],
  ],
  [
    [],
    [{ sportType: "RUN", text: "Facile 40m", name: "Corsa facile" }],
    [{ sportType: "RUN", text: "Tempo 3x8m", name: "Tempo run" }],
    [],
    [{ sportType: "RUN", text: "Facile 35m", name: "Corsa facile" }],
    [{ sportType: "RUN", text: "Lungo 95m", name: "Lungo" }],
    [],
  ],
  [
    [],
    [{ sportType: "RUN", text: "Facile 45m", name: "Corsa facile" }],
    [],
    [{ sportType: "RUN", text: "Progressivo 50m", name: "Progressivo" }],
    [],
    [{ sportType: "RUN", text: "Lungo 105m", name: "Lungo" }],
    [{ sportType: "RUN", text: "Recupero 30m", name: "Corsa di recupero" }],
  ],
  [
    [],
    [{ sportType: "RUN", text: "Facile 40m", name: "Corsa facile" }],
    [{ sportType: "RUN", text: "Tempo 2x12m", name: "Tempo run" }],
    [],
    [{ sportType: "RUN", text: "Medio 40m", name: "Corsa media" }],
    [{ sportType: "RUN", text: "Lungo 120m", name: "Lungo" }],
    [],
  ],
];

const PLAN_DRAFT_GRID_PT_BR = [
  [
    [],
    [{ sportType: "RUN", text: "Leve 45m", name: "Corrida leve" }],
    [],
    [{ sportType: "RUN", text: "Contínuo 35m", name: "Corrida contínua" }],
    [],
    [{ sportType: "RUN", text: "Longão 80m", name: "Longão" }],
    [],
  ],
  [
    [],
    [{ sportType: "RUN", text: "Leve 40m", name: "Corrida leve" }],
    [{ sportType: "RUN", text: "Tempo 3x8m", name: "Tempo run" }],
    [],
    [{ sportType: "RUN", text: "Leve 35m", name: "Corrida leve" }],
    [{ sportType: "RUN", text: "Longão 95m", name: "Longão" }],
    [],
  ],
  [
    [],
    [{ sportType: "RUN", text: "Leve 45m", name: "Corrida leve" }],
    [],
    [{ sportType: "RUN", text: "Progressivo 50m", name: "Treino progressivo" }],
    [],
    [{ sportType: "RUN", text: "Longão 105m", name: "Longão" }],
    [{ sportType: "RUN", text: "Regenerativo 30m", name: "Corrida regenerativa" }],
  ],
  [
    [],
    [{ sportType: "RUN", text: "Leve 40m", name: "Corrida leve" }],
    [{ sportType: "RUN", text: "Tempo 2x12m", name: "Tempo run" }],
    [],
    [{ sportType: "RUN", text: "Contínuo 40m", name: "Corrida contínua" }],
    [{ sportType: "RUN", text: "Longão 120m", name: "Longão" }],
    [],
  ],
];

const koSessionStrings: SessionStrings = {
  adjust: {
    title: "마라톤 기초 주기 조정",
    composer: "이어서 질문: 금요일에 컨디션이 회복되면 강도를 다시 올려도 될까요?",
    user: "이번 주에 좀 피곤한데, 목요일 템포 런을 조정하는 게 좋을까요?",
    assistant:
      "훈련 의도는 유지하되 목요일은 조금 짧은 스테디 런으로 바꾸는 편이 좋습니다. 블록 흐름을 끊지 않으면서 토요일 장거리 주를 위한 회복 여유를 확보할 수 있습니다.",
    readCards: [
      {
        name: "PlanDayView",
        title: "현재 계획",
        subtitle: "5주차 · 목",
      },
      {
        name: "ActivityRecent",
        title: "최근 활동",
        subtitle: "최근 7일 · 4개 세션",
      },
      {
        name: "PmcRange",
        title: "훈련 부하",
        subtitle: "2026-05-24 → 2026-06-30",
        stats: [
          { label: "활동일", value: "18" },
          { label: "휴식일", value: "12" },
          { label: "총 부하", value: "842" },
          { label: "일평균", value: "47" },
          { label: "TSB", value: "-4" },
        ],
      },
    ],
    adjustment: {
      title: "목요일 훈련 조정",
      reason:
        "이번 주 피로도가 높은 편입니다. 유산소 리듬은 유지하면서 목요일 자극을 낮춥니다.",
      beforeName: "템포 런",
      afterName: "스테디 런",
      beforeText: "work 3x10m pace Z4",
      afterText: "work 35m pace Z2",
      changeField: "text",
    },
  },
  create: {
    title: "12주 하프 마라톤 계획",
    composer: "8주차에 포인트 훈련을 한 번 더 넣을 수 있을까요?",
    userAsk: "12주 하프 마라톤 계획을 짜 주세요. 현재 주 4회 달리고 있습니다.",
    userReply: "목표: 하프 Sub-2:00 · 주 4회 · 12주",
    question: {
      questions: [
        {
          id: "goal",
          header: "대회 목표",
          question: "가장 우선하는 대회 목표는 무엇인가요?",
          options: [
            {
              value: "sub-2",
              label: "하프 마라톤 Sub-2:00",
              description: "주 1회 포인트 훈련을 포함한 균형 잡힌 빌드업.",
            },
            {
              value: "finish",
              label: "안정적인 완주",
              description: "보수적인 주간 거리와 넉넉한 회복 간격.",
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
      "현재 주간 훈련량에 맞춘 초안입니다. 점진적인 장거리 주와 주 1회 포인트 훈련, 적절한 회복 간격을 배치했습니다.",
    planDraft: {
      title: "하프 마라톤 빌드 · 12주",
      description:
        "초반에는 유산소 기초를 다지고, 마지막 4주에 역치 보강과 레이스 특화 장거리 주를 넣습니다.",
      periodWeeks: 4,
      workouts: buildPlanDraftWorkouts(PLAN_DRAFT_GRID_KO),
    },
  },
  longRun: {
    title: "주말 장거리 주 보충",
    composer: "다리가 아직 무거우면 화요일 인터벌을 미루는 게 좋을까요?",
    user: "출장 때문에 토요일 장거리 주를 못 뛰었습니다. 이번 주에 어떻게 보충하면 좋을까요?",
    assistant:
      "놓친 장거리 주 전체를 이번 주 계획에 그대로 얹지 않는 것이 좋습니다. 유산소 세션 하나를 주 후반으로 옮기고, 수면과 TSB가 안정적일 때만 화요일 포인트 훈련을 유지하세요.",
    readCards: [
      {
        name: "PlanDayView",
        title: "이번 주 계획",
        subtitle: "6주차 · 토요일 미실시",
      },
      {
        name: "ActivityRecent",
        title: "누락된 훈련",
        subtitle: "토요일 장거리 주 · 건너뜀",
      },
      {
        name: "PmcRange",
        title: "회복 추세",
        subtitle: "최근 14일",
        stats: [
          { label: "TSB", value: "-6" },
          { label: "평균 수면", value: "6.8h" },
          { label: "휴식일", value: "2" },
        ],
      },
    ],
  },
};

const deSessionStrings: SessionStrings = {
  adjust: {
    title: "Anpassung Marathon-Grundlagenphase",
    composer: "Nachfragen: Wenn sich Freitag gut anfühlt, können wir die Intensität zurückbringen?",
    user: "Ich fühle mich diese Woche müde. Sollten wir den Tempolauf am Donnerstag anpassen?",
    assistant:
      "Behalte das Trainingsziel bei, aber mach aus dem Donnerstag einen kürzeren, ruhigen Dauerlauf. So bleibt der lange Lauf am Samstag geschützt und der Block läuft weiter.",
    readCards: [
      {
        name: "PlanDayView",
        title: "Aktueller Plan",
        subtitle: "Woche 5 · Do",
      },
      {
        name: "ActivityRecent",
        title: "Letzte Aktivitäten",
        subtitle: "Letzte 7 Tage · 4 Einheiten",
      },
      {
        name: "PmcRange",
        title: "Trainingsbelastung",
        subtitle: "2026-05-24 → 2026-06-30",
        stats: [
          { label: "Aktive Tage", value: "18" },
          { label: "Ruhetage", value: "12" },
          { label: "Gesamtlast", value: "842" },
          { label: "Ø pro Tag", value: "47" },
          { label: "TSB", value: "-4" },
        ],
      },
    ],
    adjustment: {
      title: "Anpassung Donnerstagseinheit",
      reason:
        "Die Ermüdung ist diese Woche erhöht. Belastung am Donnerstag senken und den aeroben Rhythmus halten.",
      beforeName: "Tempolauf",
      afterName: "Dauerlauf",
      beforeText: "work 3x10m pace Z4",
      afterText: "work 35m pace Z2",
      changeField: "text",
    },
  },
  create: {
    title: "12-Wochen-Halbmarathonplan",
    composer: "Können wir in Woche 8 noch eine Qualitätseinheit ergänzen?",
    userAsk: "Erstelle mir einen 12-Wochen-Halbmarathonplan. Ich laufe aktuell 4-mal pro Woche.",
    userReply: "Ziel: Halbmarathon Sub-2:00 · 4 Läufe/Woche · 12 Wochen",
    question: {
      questions: [
        {
          id: "goal",
          header: "Wettkampfziel",
          question: "Was ist dein primäres Wettkampfziel?",
          options: [
            {
              value: "sub-2",
              label: "Halbmarathon Sub-2:00",
              description: "Ausgewogener Aufbau mit einer Qualitätseinheit pro Woche.",
            },
            {
              value: "finish",
              label: "Stark ins Ziel kommen",
              description: "Konservativer Umfang mit extra Erholungsabständen.",
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
      "Hier ist ein Entwurf mit progressiven langen Läufen, einer wöchentlichen Qualitätseinheit und Erholungsabständen passend zu deinem aktuellen Umfang.",
    planDraft: {
      title: "Halbmarathon-Aufbau · 12 Wochen",
      description:
        "Erst aerobe Grundlage, dann Schwellenarbeit und wettkampfspezifische lange Läufe in den letzten 4 Wochen.",
      periodWeeks: 4,
      workouts: buildPlanDraftWorkouts(PLAN_DRAFT_GRID_DE),
    },
  },
  longRun: {
    title: "Langen Lauf am Wochenende nachholen",
    composer: "Soll ich die Intervalle am Dienstag verschieben, wenn die Beine noch schwer sind?",
    user: "Ich habe den langen Lauf am Samstag wegen einer Reise verpasst. Wie sollte ich diese Woche aufholen?",
    assistant:
      "Packe den verpassten langen Lauf nicht komplett zusätzlich in diese Woche. Verschiebe eine aerobe Einheit weiter nach hinten und behalte die Qualität am Dienstag nur bei, wenn Schlaf und TSB stabil sind.",
    readCards: [
      {
        name: "PlanDayView",
        title: "Plan dieser Woche",
        subtitle: "Woche 6 · Sa verpasst",
      },
      {
        name: "ActivityRecent",
        title: "Verpasste Einheit",
        subtitle: "Langer Lauf Sa · ausgelassen",
      },
      {
        name: "PmcRange",
        title: "Erholungstrend",
        subtitle: "Letzte 14 Tage",
        stats: [
          { label: "TSB", value: "-6" },
          { label: "Ø Schlaf", value: "6.8h" },
          { label: "Ruhetage", value: "2" },
        ],
      },
    ],
  },
};

const frSessionStrings: SessionStrings = {
  adjust: {
    title: "Ajustement du bloc foncier marathon",
    composer: "Demander : si les sensations reviennent vendredi, peut-on remettre de l'intensité ?",
    user: "Je me sens fatigué cette semaine. Faut-il ajuster la séance tempo de jeudi ?",
    assistant:
      "Gardons l'intention de la séance, mais remplaçons le tempo de jeudi par une sortie soutenue plus courte. Cela protège la sortie longue de samedi tout en maintenant la dynamique du bloc.",
    readCards: [
      {
        name: "PlanDayView",
        title: "Plan actuel",
        subtitle: "Semaine 5 · Jeu",
      },
      {
        name: "ActivityRecent",
        title: "Activités récentes",
        subtitle: "7 derniers jours · 4 séances",
      },
      {
        name: "PmcRange",
        title: "Charge d'entraînement",
        subtitle: "2026-05-24 → 2026-06-30",
        stats: [
          { label: "Jours actifs", value: "18" },
          { label: "Jours de repos", value: "12" },
          { label: "Charge totale", value: "842" },
          { label: "Moy. / jour", value: "47" },
          { label: "TSB", value: "-4" },
        ],
      },
    ],
    adjustment: {
      title: "Ajustement de la séance de jeudi",
      reason:
        "La fatigue est élevée cette semaine. Réduire le stress jeudi tout en gardant le rythme aérobie.",
      beforeName: "Course tempo",
      afterName: "Allure soutenue",
      beforeText: "work 3x10m pace Z4",
      afterText: "work 35m pace Z2",
      changeField: "text",
    },
  },
  create: {
    title: "Plan semi-marathon 12 semaines",
    composer: "Peut-on ajouter une séance qualité en semaine 8 ?",
    userAsk: "Construis-moi un plan semi-marathon de 12 semaines. Je cours actuellement 4 fois par semaine.",
    userReply: "Objectif : Semi Sub-2:00 · 4 sorties/sem. · 12 semaines",
    question: {
      questions: [
        {
          id: "goal",
          header: "Objectif course",
          question: "Quel est votre objectif principal sur cette course ?",
          options: [
            {
              value: "sub-2",
              label: "Semi-marathon Sub-2:00",
              description: "Progression équilibrée avec une séance clé par semaine.",
            },
            {
              value: "finish",
              label: "Terminer solide",
              description: "Volume prudent avec davantage de récupération.",
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
      "Voici une ébauche de bloc avec des sorties longues progressives, une séance qualité hebdomadaire et des temps de récupération adaptés à votre volume actuel.",
    planDraft: {
      title: "Préparation semi-marathon · 12 semaines",
      description:
        "Base aérobie d'abord, puis travail au seuil et sorties longues spécifiques sur les 4 dernières semaines.",
      periodWeeks: 4,
      workouts: buildPlanDraftWorkouts(PLAN_DRAFT_GRID_FR),
    },
  },
  longRun: {
    title: "Rattrapage sortie longue du week-end",
    composer: "Dois-je décaler le fractionné de mardi si les jambes restent lourdes ?",
    user: "J'ai manqué ma sortie longue de samedi à cause d'un déplacement. Comment rattraper cette semaine ?",
    assistant:
      "N'empilez pas l'intégralité de la sortie longue manquée sur cette semaine. Décalez une séance aérobie plus tard dans la semaine et ne gardez la séance clé de mardi que si sommeil et TSB restent stables.",
    readCards: [
      {
        name: "PlanDayView",
        title: "Plan de la semaine",
        subtitle: "Semaine 6 · Sam manqué",
      },
      {
        name: "ActivityRecent",
        title: "Séance manquée",
        subtitle: "Sortie longue sam. · ignorée",
      },
      {
        name: "PmcRange",
        title: "Tendance récupération",
        subtitle: "14 derniers jours",
        stats: [
          { label: "TSB", value: "-6" },
          { label: "Sommeil moy.", value: "6.8h" },
          { label: "Jours de repos", value: "2" },
        ],
      },
    ],
  },
};

const esSessionStrings: SessionStrings = {
  adjust: {
    title: "Ajuste del bloque base de maratón",
    composer: "Preguntar: si el viernes me siento bien, ¿podemos retomar la intensidad?",
    user: "Me siento cansado esta semana. ¿Deberíamos ajustar el rodaje tempo del jueves?",
    assistant:
      "Mantén la intención del entrenamiento, pero convierte el jueves en un rodaje constante más corto. Así proteges la tirada larga del sábado sin frenar el bloque.",
    readCards: [
      {
        name: "PlanDayView",
        title: "Plan actual",
        subtitle: "Semana 5 · Jue",
      },
      {
        name: "ActivityRecent",
        title: "Actividades recientes",
        subtitle: "Últimos 7 días · 4 sesiones",
      },
      {
        name: "PmcRange",
        title: "Carga de entrenamiento",
        subtitle: "2026-05-24 → 2026-06-30",
        stats: [
          { label: "Días activos", value: "18" },
          { label: "Descanso", value: "12" },
          { label: "Carga total", value: "842" },
          { label: "Media diaria", value: "47" },
          { label: "TSB", value: "-4" },
        ],
      },
    ],
    adjustment: {
      title: "Ajuste de la sesión del jueves",
      reason:
        "La fatiga está elevada esta semana. Reduce el estrés del jueves manteniendo el ritmo aeróbico.",
      beforeName: "Rodaje tempo",
      afterName: "Rodaje constante",
      beforeText: "work 3x10m pace Z4",
      afterText: "work 35m pace Z2",
      changeField: "text",
    },
  },
  create: {
    title: "Plan de media maratón de 12 semanas",
    composer: "¿Podemos añadir una sesión de calidad más en la semana 8?",
    userAsk: "Créame un plan de media maratón de 12 semanas. Ahora corro 4 veces por semana.",
    userReply: "Objetivo: Media Sub-2:00 · 4 días/semana · 12 semanas",
    question: {
      questions: [
        {
          id: "goal",
          header: "Objetivo de carrera",
          question: "¿Cuál es tu objetivo principal para la carrera?",
          options: [
            {
              value: "sub-2",
              label: "Media maratón Sub-2:00",
              description: "Progresión equilibrada con una sesión de calidad por semana.",
            },
            {
              value: "finish",
              label: "Llegar fuerte a meta",
              description: "Volumen conservador con mayor margen de recuperación.",
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
      "Aquí tienes un borrador con tiradas largas progresivas, una sesión de calidad semanal y descansos ajustados a tu volumen actual.",
    planDraft: {
      title: "Preparación media maratón · 12 semanas",
      description:
        "Primero base aeróbica, luego trabajo de umbral y tiradas largas específicas en las últimas 4 semanas.",
      periodWeeks: 4,
      workouts: buildPlanDraftWorkouts(PLAN_DRAFT_GRID_ES),
    },
  },
  longRun: {
    title: "Recuperar la tirada larga del fin de semana",
    composer: "¿Debería mover las series del martes si aún noto las piernas cargadas?",
    user: "Me perdí la tirada larga del sábado por un viaje. ¿Cómo debería compensarlo esta semana?",
    assistant:
      "No acumules toda la tirada larga perdida encima del plan de esta semana. Desplaza una sesión aeróbica al final de la semana y mantén la calidad del martes solo si el sueño y el TSB siguen estables.",
    readCards: [
      {
        name: "PlanDayView",
        title: "Plan de esta semana",
        subtitle: "Semana 6 · Sáb perdido",
      },
      {
        name: "ActivityRecent",
        title: "Sesión perdida",
        subtitle: "Tirada larga sáb. · omitida",
      },
      {
        name: "PmcRange",
        title: "Tendencia de recuperación",
        subtitle: "Últimos 14 días",
        stats: [
          { label: "TSB", value: "-6" },
          { label: "Sueño medio", value: "6.8h" },
          { label: "Descanso", value: "2" },
        ],
      },
    ],
  },
};

const itSessionStrings: SessionStrings = {
  adjust: {
    title: "Adattamento blocco base maratona",
    composer: "Chiedi: se venerdì mi sento bene, possiamo reinserire l'intensità?",
    user: "Questa settimana mi sento stanco. Conviene adattare la tempo run di giovedì?",
    assistant:
      "Mantieni l'obiettivo della seduta, ma trasforma giovedì in una corsa media più breve. Così proteggi il lungo di sabato senza interrompere il blocco.",
    readCards: [
      {
        name: "PlanDayView",
        title: "Piano attuale",
        subtitle: "Settimana 5 · Gio",
      },
      {
        name: "ActivityRecent",
        title: "Attività recenti",
        subtitle: "Ultimi 7 giorni · 4 sedute",
      },
      {
        name: "PmcRange",
        title: "Carico di allenamento",
        subtitle: "2026-05-24 → 2026-06-30",
        stats: [
          { label: "Giorni attivi", value: "18" },
          { label: "Giorni di riposo", value: "12" },
          { label: "Carico totale", value: "842" },
          { label: "Media giorno", value: "47" },
          { label: "TSB", value: "-4" },
        ],
      },
    ],
    adjustment: {
      title: "Adattamento seduta di giovedì",
      reason:
        "La fatica è elevata questa settimana. Riduci lo stress giovedì mantenendo il ritmo aerobico.",
      beforeName: "Tempo run",
      afterName: "Corsa media",
      beforeText: "work 3x10m pace Z4",
      afterText: "work 35m pace Z2",
      changeField: "text",
    },
  },
  create: {
    title: "Piano mezza maratona 12 settimane",
    composer: "Possiamo aggiungere una seduta di qualità nella settimana 8?",
    userAsk: "Preparami un piano da 12 settimane per la mezza maratona. Al momento corro 4 volte a settimana.",
    userReply: "Obiettivo: Mezza Sub-2:00 · 4 uscite/sett. · 12 settimane",
    question: {
      questions: [
        {
          id: "goal",
          header: "Obiettivo gara",
          question: "Qual è il tuo obiettivo principale per la gara?",
          options: [
            {
              value: "sub-2",
              label: "Mezza maratona Sub-2:00",
              description: "Crescita equilibrata con una seduta di qualità a settimana.",
            },
            {
              value: "finish",
              label: "Finire in controllo",
              description: "Volume prudente con più spazio per il recupero.",
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
      "Ecco una bozza del blocco con lunghi progressivi, una seduta di qualità a settimana e tempi di recupero coerenti con il tuo volume attuale.",
    planDraft: {
      title: "Preparazione mezza maratona · 12 settimane",
      description:
        "Prima base aerobica, poi lavoro di soglia e lunghi specifici nelle ultime 4 settimane.",
      periodWeeks: 4,
      workouts: buildPlanDraftWorkouts(PLAN_DRAFT_GRID_IT),
    },
  },
  longRun: {
    title: "Recupero lungo del weekend",
    composer: "Devo spostare le ripetute di martedì se le gambe restano pesanti?",
    user: "Ho saltato il lungo di sabato per un viaggio. Come dovrei recuperare questa settimana?",
    assistant:
      "Non sommare l'intero lungo mancato al piano di questa settimana. Sposta una seduta aerobica più avanti nella settimana e mantieni la qualità di martedì solo se sonno e TSB restano stabili.",
    readCards: [
      {
        name: "PlanDayView",
        title: "Piano di questa settimana",
        subtitle: "Settimana 6 · Sab saltato",
      },
      {
        name: "ActivityRecent",
        title: "Seduta saltata",
        subtitle: "Lungo sab. · saltato",
      },
      {
        name: "PmcRange",
        title: "Trend recupero",
        subtitle: "Ultimi 14 giorni",
        stats: [
          { label: "TSB", value: "-6" },
          { label: "Sonno medio", value: "6.8h" },
          { label: "Riposo", value: "2" },
        ],
      },
    ],
  },
};

const ptBrSessionStrings: SessionStrings = {
  adjust: {
    title: "Ajuste da base de maratona",
    composer: "Perguntar: se sexta eu me sentir bem, podemos voltar com a intensidade?",
    user: "Estou me sentindo cansado esta semana. Devemos ajustar o tempo run de quinta?",
    assistant:
      "Mantenha a intenção do treino, mas transforme quinta em uma corrida contínua mais curta. Isso protege o longão de sábado sem interromper o bloco.",
    readCards: [
      {
        name: "PlanDayView",
        title: "Plano atual",
        subtitle: "Semana 5 · Qui",
      },
      {
        name: "ActivityRecent",
        title: "Atividades recentes",
        subtitle: "Últimos 7 dias · 4 sessões",
      },
      {
        name: "PmcRange",
        title: "Carga de treino",
        subtitle: "2026-05-24 → 2026-06-30",
        stats: [
          { label: "Dias ativos", value: "18" },
          { label: "Descanso", value: "12" },
          { label: "Carga total", value: "842" },
          { label: "Média diária", value: "47" },
          { label: "TSB", value: "-4" },
        ],
      },
    ],
    adjustment: {
      title: "Ajuste do treino de quinta",
      reason:
        "A fadiga está elevada esta semana. Reduza o estresse de quinta mantendo o ritmo aeróbico.",
      beforeName: "Tempo run",
      afterName: "Corrida contínua",
      beforeText: "work 3x10m pace Z4",
      afterText: "work 35m pace Z2",
      changeField: "text",
    },
  },
  create: {
    title: "Plano de meia maratona de 12 semanas",
    composer: "Podemos adicionar mais um treino de qualidade na semana 8?",
    userAsk: "Monte um plano de 12 semanas para meia maratona. Hoje eu corro 4 vezes por semana.",
    userReply: "Meta: Meia Sub-2:00 · 4 treinos/sem. · 12 semanas",
    question: {
      questions: [
        {
          id: "goal",
          header: "Meta da prova",
          question: "Qual é o seu objetivo principal para a prova?",
          options: [
            {
              value: "sub-2",
              label: "Meia maratona Sub-2:00",
              description: "Progressão equilibrada com um treino de qualidade por semana.",
            },
            {
              value: "finish",
              label: "Completar bem",
              description: "Volume conservador com mais margem de recuperação.",
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
      "Aqui está um rascunho de bloco com longões progressivos, um treino de qualidade por semana e intervalos de recuperação compatíveis com seu volume atual.",
    planDraft: {
      title: "Preparação meia maratona · 12 semanas",
      description:
        "Primeiro base aeróbica, depois trabalho de limiar e longões específicos nas 4 semanas finais.",
      periodWeeks: 4,
      workouts: buildPlanDraftWorkouts(PLAN_DRAFT_GRID_PT_BR),
    },
  },
  longRun: {
    title: "Compensação do longão do fim de semana",
    composer: "Devo mover os intervalados de terça se as pernas ainda estiverem pesadas?",
    user: "Perdi o longão de sábado por causa de uma viagem. Como devo compensar nesta semana?",
    assistant:
      "Não empilhe o longão perdido inteiro em cima do plano desta semana. Empurre um treino aeróbico para o fim da semana e mantenha a qualidade de terça apenas se o sono e o TSB estiverem estáveis.",
    readCards: [
      {
        name: "PlanDayView",
        title: "Plano desta semana",
        subtitle: "Semana 6 · Sáb perdido",
      },
      {
        name: "ActivityRecent",
        title: "Treino perdido",
        subtitle: "Longão sáb. · pulado",
      },
      {
        name: "PmcRange",
        title: "Tendência de recuperação",
        subtitle: "Últimos 14 dias",
        stats: [
          { label: "TSB", value: "-6" },
          { label: "Média sono", value: "6.8h" },
          { label: "Descanso", value: "2" },
        ],
      },
    ],
  },
};

const koCopy = buildUiCopy(buildSessions(koSessionStrings), {
  review: "AI 리뷰",
  history: "기록",
  newChat: "새 대화",
  today: "오늘",
  yesterday: "어제",
  past: "이전",
  composerHint: "Shift + Enter로 줄바꿈",
  thinking: "생각 중",
  send: "전송",
  questions: {
    title: "간단 확인",
    answeredBadge: "답변 완료",
    submit: "전송",
    answeredCount: (answered, total) => `${answered} / ${total}`,
  },
  readCards: {
    toggleDetails: "자세히 보기",
  },
  workoutAdjustment: {
    before: "변경 전",
    after: "변경 후",
    apply: "변경 적용",
    changes: "변경 항목",
    position: (week, day) => `${week}주차 · ${day}일차`,
  },
  planDraft: {
    weekColumn: "주",
    weekdays: ["월", "화", "수", "목", "금", "토", "일"],
    weekLabel: (week) => `${week}주`,
    restLabel: "휴식",
    summary: (weeks, sessions) => `${weeks}주 · ${sessions}개 세션`,
    createPlan: "계획 만들기",
  },
});

const deCopy = buildUiCopy(buildSessions(deSessionStrings), {
  review: "KI-Analyse",
  history: "Verlauf",
  newChat: "Neuer Chat",
  today: "Heute",
  yesterday: "Gestern",
  past: "Früher",
  composerHint: "Shift + Enter für Zeilenumbruch",
  thinking: "Denkt nach",
  send: "Senden",
  questions: {
    title: "Kurze Rückfragen",
    answeredBadge: "Beantwortet",
    submit: "Senden",
    answeredCount: (answered, total) => `${answered} / ${total}`,
  },
  readCards: {
    toggleDetails: "Details anzeigen",
  },
  workoutAdjustment: {
    before: "Vorher",
    after: "Nachher",
    apply: "Änderung anwenden",
    changes: "Änderungen",
    position: (week, day) => `Woche ${week} · Tag ${day}`,
  },
  planDraft: {
    weekColumn: "Woche",
    weekdays: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
    weekLabel: (week) => `W${week}`,
    restLabel: "Ruhe",
    summary: (weeks, sessions) => `${weeks} Wochen · ${sessions} Einheiten`,
    createPlan: "Plan erstellen",
  },
});

const frCopy = buildUiCopy(buildSessions(frSessionStrings), {
  review: "Bilan IA",
  history: "Historique",
  newChat: "Nouvelle discussion",
  today: "Aujourd'hui",
  yesterday: "Hier",
  past: "Plus tôt",
  composerHint: "Maj + Entrée pour aller à la ligne",
  thinking: "Réflexion",
  send: "Envoyer",
  questions: {
    title: "Questions rapides",
    answeredBadge: "Répondu",
    submit: "Envoyer",
    answeredCount: (answered, total) => `${answered} / ${total}`,
  },
  readCards: {
    toggleDetails: "Afficher les détails",
  },
  workoutAdjustment: {
    before: "Avant",
    after: "Après",
    apply: "Appliquer",
    changes: "Modifications",
    position: (week, day) => `Semaine ${week} · Jour ${day}`,
  },
  planDraft: {
    weekColumn: "Sem.",
    weekdays: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"],
    weekLabel: (week) => `S${week}`,
    restLabel: "Repos",
    summary: (weeks, sessions) => `${weeks} semaines · ${sessions} séances`,
    createPlan: "Créer le plan",
  },
});

const esCopy = buildUiCopy(buildSessions(esSessionStrings), {
  review: "Revisión IA",
  history: "Historial",
  newChat: "Nuevo chat",
  today: "Hoy",
  yesterday: "Ayer",
  past: "Anterior",
  composerHint: "Shift + Enter para nueva línea",
  thinking: "Pensando",
  send: "Enviar",
  questions: {
    title: "Preguntas rápidas",
    answeredBadge: "Respondido",
    submit: "Enviar",
    answeredCount: (answered, total) => `${answered} / ${total}`,
  },
  readCards: {
    toggleDetails: "Mostrar detalles",
  },
  workoutAdjustment: {
    before: "Antes",
    after: "Después",
    apply: "Aplicar cambio",
    changes: "Cambios",
    position: (week, day) => `Semana ${week} · Día ${day}`,
  },
  planDraft: {
    weekColumn: "Sem.",
    weekdays: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
    weekLabel: (week) => `S${week}`,
    restLabel: "Descanso",
    summary: (weeks, sessions) => `${weeks} semanas · ${sessions} sesiones`,
    createPlan: "Crear plan",
  },
});

const itCopy = buildUiCopy(buildSessions(itSessionStrings), {
  review: "Analisi AI",
  history: "Cronologia",
  newChat: "Nuova chat",
  today: "Oggi",
  yesterday: "Ieri",
  past: "Precedenti",
  composerHint: "Maiusc + Invio per andare a capo",
  thinking: "Elaborazione",
  send: "Invia",
  questions: {
    title: "Domande rapide",
    answeredBadge: "Risposto",
    submit: "Invia",
    answeredCount: (answered, total) => `${answered} / ${total}`,
  },
  readCards: {
    toggleDetails: "Mostra dettagli",
  },
  workoutAdjustment: {
    before: "Prima",
    after: "Dopo",
    apply: "Applica modifica",
    changes: "Modifiche",
    position: (week, day) => `Settimana ${week} · Giorno ${day}`,
  },
  planDraft: {
    weekColumn: "Sett.",
    weekdays: ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"],
    weekLabel: (week) => `S${week}`,
    restLabel: "Riposo",
    summary: (weeks, sessions) => `${weeks} settimane · ${sessions} sedute`,
    createPlan: "Crea piano",
  },
});

const ptBrCopy = buildUiCopy(buildSessions(ptBrSessionStrings), {
  review: "Revisão de IA",
  history: "Histórico",
  newChat: "Novo chat",
  today: "Hoje",
  yesterday: "Ontem",
  past: "Anteriores",
  composerHint: "Shift + Enter para quebra de linha",
  thinking: "Pensando",
  send: "Enviar",
  questions: {
    title: "Perguntas rápidas",
    answeredBadge: "Respondido",
    submit: "Enviar",
    answeredCount: (answered, total) => `${answered} / ${total}`,
  },
  readCards: {
    toggleDetails: "Mostrar detalhes",
  },
  workoutAdjustment: {
    before: "Antes",
    after: "Depois",
    apply: "Aplicar ajuste",
    changes: "Alterações",
    position: (week, day) => `Semana ${week} · Dia ${day}`,
  },
  planDraft: {
    weekColumn: "Sem.",
    weekdays: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
    weekLabel: (week) => `S${week}`,
    restLabel: "Descanso",
    summary: (weeks, sessions) => `${weeks} semanas · ${sessions} sessões`,
    createPlan: "Criar plano",
  },
});

export const coachDemoCopy = {
  en: enCopy,
  zh: zhCopy,
  "zh-hant": zhHantCopy,
  ja: jaCopy,
  ko: koCopy,
  de: deCopy,
  fr: frCopy,
  es: esCopy,
  it: itCopy,
  "pt-BR": ptBrCopy,
} satisfies Record<string, CoachDemoCopy>;

export type CoachDemoLang = keyof typeof coachDemoCopy;
