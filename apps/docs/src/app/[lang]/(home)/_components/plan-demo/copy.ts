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

type LocalizedPlanSpec = {
  weekStrip: PlanDemoCopy["weekStrip"];
  weekLoad: PlanDemoCopy["weekLoad"];
  workout: PlanDemoCopy["workout"];
  actions: PlanDemoCopy["actions"];
  today: PlanDemoCopy["today"];
  goal: PlanDemoCopy["goal"];
  header: PlanDemoPayload["header"];
  weekdayLabels: [string, string, string, string, string, string, string];
  workouts: {
    w1: {
      dayLabel: string;
      title: string;
      detail: string;
      statusLabel: string;
      linkedActivity: string;
    };
    w2: {
      dayLabel: string;
      title: string;
      detail: string;
      statusLabel: string;
    };
    w3: {
      dayLabel: string;
      title: string;
      detail: string;
      statusLabel: string;
    };
  };
  coach: PlanDemoPayload["coach"];
};

function buildLocalizedPlanCopy(spec: LocalizedPlanSpec): PlanDemoCopy {
  const basePayload = enCopy.payload;
  const workouts = basePayload.workouts.map((workout) => {
    if (workout.id === "w1") {
      return { ...workout, ...spec.workouts.w1 };
    }
    if (workout.id === "w2") {
      return { ...workout, ...spec.workouts.w2 };
    }
    return { ...workout, ...spec.workouts.w3 };
  });

  return {
    weekStrip: spec.weekStrip,
    weekLoad: spec.weekLoad,
    workout: spec.workout,
    actions: spec.actions,
    today: spec.today,
    goal: spec.goal,
    payload: {
      ...basePayload,
      header: spec.header,
      days: basePayload.days.map((day, index) => ({
        ...day,
        dayLabel: spec.weekdayLabels[index] ?? day.dayLabel,
      })),
      workouts,
      todayWorkout: workouts[1],
      coach: spec.coach,
    },
  };
}

const koCopy = buildLocalizedPlanCopy({
  weekStrip: {
    title: "주기 진행도",
    stateCurrent: "이번 주",
  },
  weekLoad: {
    title: "이번 주 훈련 부하",
    currentWeek: (week) => `${week}주차`,
    plannedSessions: "예정 세션",
  },
  workout: {
    title: "이번 주 훈련",
    loadBadge: "계획 부하",
    linked: (activity) => `연결됨 · ${activity}`,
    notLinked: "연결된 활동 없음",
    session: (index) => `세션 ${index}`,
  },
  actions: {
    postpone: "연기",
    skip: "건너뛰기",
    delete: "삭제",
    deleteDisabledTip: "삭제할 수 없습니다",
  },
  today: {
    title: "오늘의 훈련",
    viewTodayPlan: "오늘 계획 보기",
    postponeToday: "오늘 훈련 연기",
  },
  goal: {
    title: "주간 목표",
    weekSessions: "세션 수",
    completed: "완료",
    progressTo: "진행률",
    dayNumber: (day) => `${day}일차`,
  },
  header: {
    cycleLabel: "현재 주기",
    title: "마라톤 기초 블록",
    weekStatus: "5 / 12주차 · ACTIVE",
    totalSessions: "36개 세션",
    remainingLabel: "남은 기간",
    remainingWeeks: "7주",
    createPlan: "계획 만들기",
  },
  weekdayLabels: ["월", "화", "수", "목", "금", "토", "일"],
  workouts: {
    w1: {
      dayLabel: "월",
      title: "이지 런 45 min",
      detail: "RUN · Z2 45 min",
      statusLabel: "완료",
      linkedActivity: "일요일 이지 런",
    },
    w2: {
      dayLabel: "수",
      title: "스테디 런 35 min",
      detail: "RUN · 유산소 지속주",
      statusLabel: "오늘",
    },
    w3: {
      dayLabel: "토",
      title: "장거리 주 90 min",
      detail: "RUN · 장거리 지구력",
      statusLabel: "예정",
    },
  },
  coach: {
    title: "코치 노트",
    summary: "목요일 포인트 훈련은 유지하고, 주말 장거리 주는 컨디션에 따라 조정하세요.",
  },
});

const deCopy = buildLocalizedPlanCopy({
  weekStrip: {
    title: "Zyklusfortschritt",
    stateCurrent: "Aktuell",
  },
  weekLoad: {
    title: "Wochenbelastung",
    currentWeek: (week) => `W${week}`,
    plannedSessions: "Geplante Einheiten",
  },
  workout: {
    title: "Einheiten der Woche",
    loadBadge: "Geplante Last",
    linked: (activity) => `Verknüpft · ${activity}`,
    notLinked: "Keine verknüpfte Aktivität",
    session: (index) => `Einheit ${index}`,
  },
  actions: {
    postpone: "Verschieben",
    skip: "Überspringen",
    delete: "Löschen",
    deleteDisabledTip: "Löschen ist nicht verfügbar",
  },
  today: {
    title: "Heute",
    viewTodayPlan: "Heute öffnen",
    postponeToday: "Heute verschieben",
  },
  goal: {
    title: "Wochenziel",
    weekSessions: "Einheiten",
    completed: "Erledigt",
    progressTo: "Fortschritt",
    dayNumber: (day) => `T${day}`,
  },
  header: {
    cycleLabel: "Aktueller Zyklus",
    title: "Marathon-Grundlagenblock",
    weekStatus: "Woche 5 / 12 · ACTIVE",
    totalSessions: "36 Einheiten",
    remainingLabel: "Verbleibend",
    remainingWeeks: "7 Wochen",
    createPlan: "Plan erstellen",
  },
  weekdayLabels: ["M", "D", "M", "D", "F", "S", "S"],
  workouts: {
    w1: {
      dayLabel: "Mo",
      title: "Lockerer Lauf 45 min",
      detail: "RUN · Z2 45 min",
      statusLabel: "Erledigt",
      linkedActivity: "Lockerer Lauf So",
    },
    w2: {
      dayLabel: "Mi",
      title: "Dauerlauf 35 min",
      detail: "RUN · ruhiges Grundlagentempo",
      statusLabel: "Heute",
    },
    w3: {
      dayLabel: "Sa",
      title: "Langer Lauf 90 min",
      detail: "RUN · lange Ausdauer",
      statusLabel: "Geplant",
    },
  },
  coach: {
    title: "Coach-Hinweis",
    summary: "Donnerstags-Qualität beibehalten. Den langen Lauf nach Tagesform anpassen.",
  },
});

const frCopy = buildLocalizedPlanCopy({
  weekStrip: {
    title: "Avancement du cycle",
    stateCurrent: "En cours",
  },
  weekLoad: {
    title: "Charge de la semaine",
    currentWeek: (week) => `S${week}`,
    plannedSessions: "Séances prévues",
  },
  workout: {
    title: "Séances de la semaine",
    loadBadge: "Charge prévue",
    linked: (activity) => `Associée · ${activity}`,
    notLinked: "Aucune activité associée",
    session: (index) => `Séance ${index}`,
  },
  actions: {
    postpone: "Reporter",
    skip: "Ignorer",
    delete: "Supprimer",
    deleteDisabledTip: "Suppression indisponible",
  },
  today: {
    title: "Aujourd'hui",
    viewTodayPlan: "Ouvrir aujourd'hui",
    postponeToday: "Reporter la séance",
  },
  goal: {
    title: "Objectif hebdo",
    weekSessions: "Séances",
    completed: "Terminées",
    progressTo: "Progression",
    dayNumber: (day) => `J${day}`,
  },
  header: {
    cycleLabel: "Cycle actuel",
    title: "Bloc foncier marathon",
    weekStatus: "Semaine 5 / 12 · ACTIVE",
    totalSessions: "36 séances",
    remainingLabel: "Restant",
    remainingWeeks: "7 semaines",
    createPlan: "Créer un plan",
  },
  weekdayLabels: ["L", "M", "M", "J", "V", "S", "D"],
  workouts: {
    w1: {
      dayLabel: "Lun",
      title: "Footing facile 45 min",
      detail: "RUN · Z2 45 min",
      statusLabel: "Terminée",
      linkedActivity: "Footing facile dim.",
    },
    w2: {
      dayLabel: "Mer",
      title: "Allure soutenue 35 min",
      detail: "RUN · aérobie régulier",
      statusLabel: "Aujourd'hui",
    },
    w3: {
      dayLabel: "Sam",
      title: "Sortie longue 90 min",
      detail: "RUN · endurance longue",
      statusLabel: "Prévue",
    },
  },
  coach: {
    title: "Note du coach",
    summary: "Maintenez la séance clé de jeudi. Ajustez la sortie longue selon votre fraîcheur.",
  },
});

const esCopy = buildLocalizedPlanCopy({
  weekStrip: {
    title: "Progreso del ciclo",
    stateCurrent: "Actual",
  },
  weekLoad: {
    title: "Carga de esta semana",
    currentWeek: (week) => `S${week}`,
    plannedSessions: "Sesiones previstas",
  },
  workout: {
    title: "Sesiones de la semana",
    loadBadge: "Carga prevista",
    linked: (activity) => `Vinculada · ${activity}`,
    notLinked: "Sin actividad vinculada",
    session: (index) => `Sesión ${index}`,
  },
  actions: {
    postpone: "Posponer",
    skip: "Omitir",
    delete: "Eliminar",
    deleteDisabledTip: "Eliminar no está disponible",
  },
  today: {
    title: "Hoy",
    viewTodayPlan: "Abrir hoy",
    postponeToday: "Posponer hoy",
  },
  goal: {
    title: "Objetivo semanal",
    weekSessions: "Sesiones",
    completed: "Completadas",
    progressTo: "Progreso",
    dayNumber: (day) => `D${day}`,
  },
  header: {
    cycleLabel: "Ciclo actual",
    title: "Bloque base de maratón",
    weekStatus: "Semana 5 / 12 · ACTIVE",
    totalSessions: "36 sesiones",
    remainingLabel: "Restante",
    remainingWeeks: "7 semanas",
    createPlan: "Crear plan",
  },
  weekdayLabels: ["L", "M", "X", "J", "V", "S", "D"],
  workouts: {
    w1: {
      dayLabel: "Lun",
      title: "Rodaje suave 45 min",
      detail: "RUN · Z2 45 min",
      statusLabel: "Hecho",
      linkedActivity: "Rodaje suave dom.",
    },
    w2: {
      dayLabel: "Mié",
      title: "Rodaje constante 35 min",
      detail: "RUN · aeróbico sostenido",
      statusLabel: "Hoy",
    },
    w3: {
      dayLabel: "Sáb",
      title: "Tirada larga 90 min",
      detail: "RUN · resistencia larga",
      statusLabel: "Previsto",
    },
  },
  coach: {
    title: "Nota del entrenador",
    summary: "Mantén la calidad del jueves. Ajusta la tirada larga según tus sensaciones.",
  },
});

const itCopy = buildLocalizedPlanCopy({
  weekStrip: {
    title: "Avanzamento ciclo",
    stateCurrent: "Attuale",
  },
  weekLoad: {
    title: "Carico settimanale",
    currentWeek: (week) => `S${week}`,
    plannedSessions: "Sedute pianificate",
  },
  workout: {
    title: "Sedute della settimana",
    loadBadge: "Carico previsto",
    linked: (activity) => `Collegata · ${activity}`,
    notLinked: "Nessuna attività collegata",
    session: (index) => `Seduta ${index}`,
  },
  actions: {
    postpone: "Posticipa",
    skip: "Salta",
    delete: "Elimina",
    deleteDisabledTip: "Eliminazione non disponibile",
  },
  today: {
    title: "Oggi",
    viewTodayPlan: "Apri oggi",
    postponeToday: "Posticipa oggi",
  },
  goal: {
    title: "Obiettivo settimanale",
    weekSessions: "Sedute",
    completed: "Completate",
    progressTo: "Avanzamento",
    dayNumber: (day) => `G${day}`,
  },
  header: {
    cycleLabel: "Ciclo attuale",
    title: "Blocco base maratona",
    weekStatus: "Settimana 5 / 12 · ACTIVE",
    totalSessions: "36 sedute",
    remainingLabel: "Rimanenti",
    remainingWeeks: "7 settimane",
    createPlan: "Crea piano",
  },
  weekdayLabels: ["L", "M", "M", "G", "V", "S", "D"],
  workouts: {
    w1: {
      dayLabel: "Lun",
      title: "Corsa facile 45 min",
      detail: "RUN · Z2 45 min",
      statusLabel: "Completata",
      linkedActivity: "Corsa facile dom.",
    },
    w2: {
      dayLabel: "Mer",
      title: "Corsa media 35 min",
      detail: "RUN · aerobico costante",
      statusLabel: "Oggi",
    },
    w3: {
      dayLabel: "Sab",
      title: "Lungo 90 min",
      detail: "RUN · resistenza lunga",
      statusLabel: "Pianificata",
    },
  },
  coach: {
    title: "Nota del coach",
    summary: "Mantieni la qualità di giovedì. Adatta il lungo del weekend alla tua prontezza.",
  },
});

const ptBrCopy = buildLocalizedPlanCopy({
  weekStrip: {
    title: "Progresso do ciclo",
    stateCurrent: "Atual",
  },
  weekLoad: {
    title: "Carga da semana",
    currentWeek: (week) => `S${week}`,
    plannedSessions: "Sessões planejadas",
  },
  workout: {
    title: "Sessões da semana",
    loadBadge: "Carga planejada",
    linked: (activity) => `Vinculada · ${activity}`,
    notLinked: "Nenhuma atividade vinculada",
    session: (index) => `Sessão ${index}`,
  },
  actions: {
    postpone: "Adiar",
    skip: "Pular",
    delete: "Excluir",
    deleteDisabledTip: "Exclusão indisponível",
  },
  today: {
    title: "Hoje",
    viewTodayPlan: "Abrir hoje",
    postponeToday: "Adiar treino de hoje",
  },
  goal: {
    title: "Meta semanal",
    weekSessions: "Sessões",
    completed: "Concluídas",
    progressTo: "Progresso",
    dayNumber: (day) => `D${day}`,
  },
  header: {
    cycleLabel: "Ciclo atual",
    title: "Bloco de base para maratona",
    weekStatus: "Semana 5 / 12 · ACTIVE",
    totalSessions: "36 sessões",
    remainingLabel: "Restante",
    remainingWeeks: "7 semanas",
    createPlan: "Criar plano",
  },
  weekdayLabels: ["S", "T", "Q", "Q", "S", "S", "D"],
  workouts: {
    w1: {
      dayLabel: "Seg",
      title: "Corrida leve 45 min",
      detail: "RUN · Z2 45 min",
      statusLabel: "Concluído",
      linkedActivity: "Corrida leve dom.",
    },
    w2: {
      dayLabel: "Qua",
      title: "Corrida contínua 35 min",
      detail: "RUN · aeróbico contínuo",
      statusLabel: "Hoje",
    },
    w3: {
      dayLabel: "Sáb",
      title: "Longão 90 min",
      detail: "RUN · resistência longa",
      statusLabel: "Planejado",
    },
  },
  coach: {
    title: "Nota do treinador",
    summary: "Mantenha a qualidade de quinta. Ajuste o longão conforme a sua prontidão.",
  },
});

export const planDemoCopy = {
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
} satisfies Record<string, PlanDemoCopy>;

export type PlanDemoLang = keyof typeof planDemoCopy;
