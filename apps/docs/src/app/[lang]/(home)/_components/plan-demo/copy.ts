import type { PlanDemoCopy, PlanDemoPayload } from "./types";

function buildPayload(locale: "en" | "zh"): PlanDemoPayload {
  const isZh = locale === "zh";
  const workouts = isZh
    ? [
        {
          id: "w1",
          dayLabel: "周一",
          dateLabel: "06/01",
          isoDate: "2026-06-01",
          sport: "run" as const,
          sportType: "RUN",
          title: "轻松跑 45 min",
          detail: "RUN · Z2 45 min",
          estimatedLoad: 42,
          loadLabel: "TSS 42",
          statusLabel: "已完成",
          uiWeekIndex: 5,
          uiDayIndex: 1,
          isToday: false,
          linkedActivity: "周日轻松跑",
        },
        {
          id: "w2",
          dayLabel: "周三",
          dateLabel: "06/03",
          isoDate: "2026-06-03",
          sport: "run" as const,
          sportType: "RUN",
          title: "稳态跑 35 min",
          detail: "RUN · steady aerobic",
          estimatedLoad: 88,
          loadLabel: "TSS 88",
          statusLabel: "今天",
          uiWeekIndex: 5,
          uiDayIndex: 3,
          isToday: true,
        },
        {
          id: "w3",
          dayLabel: "周六",
          dateLabel: "06/06",
          isoDate: "2026-06-06",
          sport: "run" as const,
          sportType: "RUN",
          title: "长距离跑 90 min",
          detail: "RUN · long endurance",
          estimatedLoad: 116,
          loadLabel: "TSS 116",
          statusLabel: "计划中",
          uiWeekIndex: 5,
          uiDayIndex: 6,
          isToday: false,
        },
      ]
    : [
        {
          id: "w1",
          dayLabel: "Mon",
          dateLabel: "06/01",
          isoDate: "2026-06-01",
          sport: "run" as const,
          sportType: "RUN",
          title: "Easy run 45 min",
          detail: "RUN · Z2 45 min",
          estimatedLoad: 42,
          loadLabel: "TSS 42",
          statusLabel: "Done",
          uiWeekIndex: 5,
          uiDayIndex: 1,
          isToday: false,
          linkedActivity: "Sun easy run",
        },
        {
          id: "w2",
          dayLabel: "Wed",
          dateLabel: "06/03",
          isoDate: "2026-06-03",
          sport: "run" as const,
          sportType: "RUN",
          title: "Steady run 35 min",
          detail: "RUN · steady aerobic",
          estimatedLoad: 88,
          loadLabel: "TSS 88",
          statusLabel: "Today",
          uiWeekIndex: 5,
          uiDayIndex: 3,
          isToday: true,
        },
        {
          id: "w3",
          dayLabel: "Sat",
          dateLabel: "06/06",
          isoDate: "2026-06-06",
          sport: "run" as const,
          sportType: "RUN",
          title: "Long run 90 min",
          detail: "RUN · long endurance",
          estimatedLoad: 116,
          loadLabel: "TSS 116",
          statusLabel: "Planned",
          uiWeekIndex: 5,
          uiDayIndex: 6,
          isToday: false,
        },
      ];

  const weekdayLabels = isZh
    ? ["一", "二", "三", "四", "五", "六", "日"]
    : ["M", "T", "W", "T", "F", "S", "S"];

  const days = weekdayLabels.map((dayLabel, index) => ({
    dayIndex: index + 1,
    dayLabel,
    dateLabel: `06/${String(1 + index).padStart(2, "0")}`,
    isoDate: `2026-06-${String(1 + index).padStart(2, "0")}`,
    workoutCount: index === 0 || index === 2 || index === 5 ? 1 : 0,
    completedCount: index === 0 || index === 2 ? 1 : 0,
    executionPercent: [52, 4, 72, 2, 40, 86, 2][index] ?? 0,
    isToday: index === 2,
  }));

  const weeks = Array.from({ length: 8 }, (_, index) => ({
    week: index + 1,
    workoutCount: index < 4 ? 3 : index === 4 ? 4 : 3,
    completedCount: index < 4 ? 3 : index === 4 ? 2 : 0,
    state: (index < 4 ? "done" : index === 4 ? "current" : "next") as
      | "done"
      | "current"
      | "next",
    executionPercent: [72, 78, 90, 62, 48, 34, 18, 12][index] ?? 0,
  }));

  return {
    header: {
      cycleLabel: isZh ? "当前周期" : "Current cycle",
      title: isZh ? "马拉松基础周期" : "Marathon base block",
      weekStatus: isZh ? "第 5 / 12 周 · ACTIVE" : "Week 5 / 12 · ACTIVE",
      totalSessions: isZh ? "36 次训练" : "36 sessions",
      remainingLabel: isZh ? "剩余" : "Remaining",
      remainingWeeks: isZh ? "7 周" : "7 weeks",
      createPlan: isZh ? "创建计划" : "Create plan",
    },
    selectedWeek: 5,
    weeks,
    days,
    workouts,
    todayWorkout: workouts[1],
    weekGoal: {
      totalSessions: 4,
      completedSessions: 2,
      currentDayIndex: 3,
    },
    coach: {
      title: isZh ? "教练建议" : "Coach note",
      summary: isZh
        ? "保留周四质量训练，周末长距离按状态微调。"
        : "Keep Thursday quality. Adjust the long run by readiness.",
    },
  };
}

function buildUiCopy(payload: PlanDemoPayload, locale: "en" | "zh"): PlanDemoCopy {
  const isZh = locale === "zh";
  return {
    weekStrip: {
      title: isZh ? "周期进度" : "Cycle progress",
      stateCurrent: isZh ? "本周" : "Current",
    },
    weekLoad: {
      title: isZh ? "本周负荷" : "This week load",
      currentWeek: (week) => (isZh ? `第 ${week} 周` : `W${week}`),
      plannedSessions: isZh ? "计划训练" : "Planned sessions",
    },
    workout: {
      title: isZh ? "本周训练" : "Week sessions",
      loadBadge: isZh ? "计划负荷" : "Planned load",
      linked: (activity) => (isZh ? `已关联 · ${activity}` : `Linked · ${activity}`),
      notLinked: isZh ? "未关联活动" : "No linked activity",
      session: (index) => (isZh ? `第 ${index} 课` : `Session ${index}`),
    },
    actions: {
      postpone: isZh ? "推迟" : "Postpone",
      skip: isZh ? "跳过" : "Skip",
      delete: isZh ? "删除" : "Delete",
      deleteDisabledTip: isZh ? "暂不支持删除" : "Delete is not available",
    },
    today: {
      title: isZh ? "今日训练" : "Today",
      viewTodayPlan: isZh ? "进入今日" : "Open today",
      postponeToday: isZh ? "延迟今日训练" : "Postpone today",
    },
    goal: {
      title: isZh ? "周目标" : "Week goal",
      weekSessions: isZh ? "训练次数" : "Sessions",
      completed: isZh ? "已完成" : "Completed",
      progressTo: isZh ? "进度" : "Progress",
      dayNumber: (day) => (isZh ? `第 ${day} 天` : `D${day}`),
    },
    payload,
  };
}

const enCopy = buildUiCopy(buildPayload("en"), "en");
const zhCopy = buildUiCopy(buildPayload("zh"), "zh");

const zhHantCopy: PlanDemoCopy = {
  ...zhCopy,
  weekStrip: {
    title: "週期進度",
    stateCurrent: "本週",
  },
  weekLoad: {
    title: "本週負荷",
    currentWeek: (week) => `第 ${week} 週`,
    plannedSessions: "計畫訓練",
  },
  workout: {
    title: "本週訓練",
    loadBadge: "計畫負荷",
    linked: (activity) => `已關聯 · ${activity}`,
    notLinked: "未關聯活動",
    session: (index) => `第 ${index} 課`,
  },
  actions: {
    postpone: "順延",
    skip: "跳過",
    delete: "刪除",
    deleteDisabledTip: "暫不支援刪除",
  },
  today: {
    title: "今日訓練",
    viewTodayPlan: "進入今日",
    postponeToday: "延後今日訓練",
  },
  goal: {
    title: "週目標",
    weekSessions: "訓練次數",
    completed: "已完成",
    progressTo: "進度",
    dayNumber: (day) => `第 ${day} 天`,
  },
  payload: {
    ...zhCopy.payload,
    header: {
      cycleLabel: "目前週期",
      title: "馬拉松基礎週期",
      weekStatus: "第 5 / 12 週 · ACTIVE",
      totalSessions: "36 次訓練",
      remainingLabel: "剩餘",
      remainingWeeks: "7 週",
      createPlan: "建立計畫",
    },
    workouts: zhCopy.payload.workouts.map((workout) => ({
      ...workout,
      dayLabel:
        workout.id === "w1" ? "週一" : workout.id === "w2" ? "週三" : "週六",
      title:
        workout.id === "w1"
          ? "輕鬆跑 45 min"
          : workout.id === "w2"
            ? "穩態跑 35 min"
            : "長距離跑 90 min",
      statusLabel:
        workout.id === "w1"
          ? "已完成"
          : workout.id === "w2"
            ? "今天"
            : "計畫中",
    })),
    todayWorkout: {
      ...zhCopy.payload.workouts[1]!,
      dayLabel: "週三",
      title: "穩態跑 35 min",
      statusLabel: "今天",
    },
    coach: {
      title: "教練建議",
      summary: "保留週四質量訓練，週末長距離按狀態微調。",
    },
  },
};

const jaCopy: PlanDemoCopy = {
  ...enCopy,
  weekStrip: {
    title: "ブロック進捗",
    stateCurrent: "今週",
  },
  weekLoad: {
    title: "今週の負荷",
    currentWeek: (week) => `${week} 週`,
    plannedSessions: "予定セッション",
  },
  workout: {
    title: "今週のセッション",
    loadBadge: "計画負荷",
    linked: (activity) => `リンク済み · ${activity}`,
    notLinked: "未リンク",
    session: (index) => `セッション ${index}`,
  },
  actions: {
    postpone: "延期",
    skip: "スキップ",
    delete: "削除",
    deleteDisabledTip: "削除は利用できません",
  },
  today: {
    title: "今日の練習",
    viewTodayPlan: "今日を開く",
    postponeToday: "今日を延期",
  },
  goal: {
    title: "週目標",
    weekSessions: "セッション",
    completed: "完了",
    progressTo: "進捗",
    dayNumber: (day) => `${day} 日目`,
  },
  payload: {
    ...enCopy.payload,
    header: {
      cycleLabel: "現在のブロック",
      title: "マラソン基礎期",
      weekStatus: "第 5 / 12 週 · ACTIVE",
      totalSessions: "36 セッション",
      remainingLabel: "残り",
      remainingWeeks: "7 週",
      createPlan: "計画を作成",
    },
    workouts: enCopy.payload.workouts.map((workout) => ({
      ...workout,
      title:
        workout.id === "w1"
          ? "イージー 45 min"
          : workout.id === "w2"
            ? "ステディ 35 min"
            : "ロング 90 min",
      statusLabel:
        workout.id === "w1"
          ? "完了"
          : workout.id === "w2"
            ? "今日"
            : "予定",
    })),
    todayWorkout: {
      ...enCopy.payload.workouts[1]!,
      title: "ステディ 35 min",
      statusLabel: "今日",
    },
    coach: {
      title: "コーチメモ",
      summary: "木曜のクオリティは維持。週末ロングはコンディションに合わせて調整。",
    },
  },
};

export const planDemoCopy = {
  en: enCopy,
  zh: zhCopy,
  "zh-hant": zhHantCopy,
  ja: jaCopy,
} satisfies Record<string, PlanDemoCopy>;

export type PlanDemoLang = keyof typeof planDemoCopy;
