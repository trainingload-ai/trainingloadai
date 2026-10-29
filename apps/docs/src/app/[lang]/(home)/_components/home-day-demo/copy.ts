import type { HomeDayDemoCopy, HomeDayDemoCopyMap } from "./types";

const enCopy: HomeDayDemoCopy = {
  backHome: "Back home",
  coachTitle: "AI Coach suggestion",
  previousDay: "Previous day",
  nextDay: "Next day",
  todayPlanMeta: "{date} · {weekday} · {week}",
  overviewTitle: "Today overview",
  plannedLoad: "Planned sessions",
  completed: "Completed",
  plannedDuration: "Planned duration",
  progress: "Progress",
  timelineTitle: "Workout schedule",
  timelineMeta: "{duration} · {sessionCount} session",
  linkedActivity: "Linked activity: {activity}",
  actionPostpone: "Postpone",
  actionSkip: "Skip",
  actionDelete: "Delete",
  deleteDisabledTip: "Delete is not available yet.",
  linkActivity: "Link activity",
  weekContextTitle: "Week context",
  uploadTitle: "Upload Activity",
  uploadCardTitle: "Upload activity files",
  uploadDescription:
    "Upload FIT / TCX / GPX activity files, link them to today's workout, and generate reviews.",
  uploadSelectFile: "Choose activity files",
};

const zhCopy: HomeDayDemoCopy = {
  backHome: "返回首页",
  coachTitle: "智能教练建议",
  previousDay: "前一天",
  nextDay: "后一天",
  todayPlanMeta: "{date} · {weekday} · {week}",
  overviewTitle: "今日概览",
  plannedLoad: "计划训练",
  completed: "已完成",
  plannedDuration: "计划时长",
  progress: "进度",
  timelineTitle: "训练安排",
  timelineMeta: "{duration} · {sessionCount} 组",
  linkedActivity: "已关联活动：{activity}",
  actionPostpone: "推迟",
  actionSkip: "跳过",
  actionDelete: "删除",
  deleteDisabledTip: "暂不支持删除。",
  linkActivity: "关联活动",
  weekContextTitle: "本周上下文",
  uploadTitle: "上传训练",
  uploadCardTitle: "导入活动文件",
  uploadDescription: "上传 FIT / TCX / GPX 文件，关联今日训练并生成活动分析。",
  uploadSelectFile: "选择文件",
};

export const homeDayDemoCopy = {
  de: {
    ...enCopy,
    backHome: "Zurück zur Startseite",
    coachTitle: "Vorschlag des KI-Coachs",
    previousDay: "Vorheriger Tag",
    nextDay: "Nächster Tag",
    todayPlanMeta: "{date} · {weekday} · {week}",
    overviewTitle: "Tagesübersicht",
    plannedLoad: "Geplante Einheiten",
    completed: "Abgeschlossen",
    plannedDuration: "Geplante Dauer",
    progress: "Fortschritt",
    timelineTitle: "Trainingsplan",
    timelineMeta: "{duration} · {sessionCount} Einheit",
    linkedActivity: "Verknüpfte Aktivität: {activity}",
    actionPostpone: "Verschieben",
    actionSkip: "Überspringen",
    actionDelete: "Löschen",
    deleteDisabledTip: "Löschen ist derzeit nicht verfügbar.",
    linkActivity: "Aktivität verknüpfen",
    weekContextTitle: "Wochenkontext",
    uploadTitle: "Aktivität hochladen",
    uploadCardTitle: "Aktivitätsdateien importieren",
    uploadDescription: "FIT-, TCX- oder GPX-Dateien hochladen, mit dem heutigen Training verknüpfen und analysieren.",
    uploadSelectFile: "Dateien auswählen",
  },
  en: enCopy,
  es: {
    ...enCopy,
    backHome: "Volver al inicio",
    coachTitle: "Sugerencia del entrenador con IA",
    previousDay: "Día anterior",
    nextDay: "Día siguiente",
    overviewTitle: "Resumen de hoy",
    plannedLoad: "Entrenamientos planificados",
    completed: "Completados",
    plannedDuration: "Duración planificada",
    progress: "Progreso",
    timelineTitle: "Plan del día",
    timelineMeta: "{duration} · {sessionCount} sesión",
    linkedActivity: "Actividad vinculada: {activity}",
    actionPostpone: "Posponer",
    actionSkip: "Omitir",
    actionDelete: "Eliminar",
    deleteDisabledTip: "La eliminación aún no está disponible.",
    linkActivity: "Vincular actividad",
    weekContextTitle: "Contexto semanal",
    uploadTitle: "Subir actividad",
    uploadCardTitle: "Importar archivos de actividad",
    uploadDescription: "Sube archivos FIT, TCX o GPX, vincúlalos al entrenamiento de hoy y analiza la actividad.",
    uploadSelectFile: "Elegir archivos",
  },
  fr: {
    ...enCopy,
    backHome: "Retour à l’accueil",
    coachTitle: "Conseil du coach IA",
    previousDay: "Jour précédent",
    nextDay: "Jour suivant",
    overviewTitle: "Vue d’ensemble du jour",
    plannedLoad: "Séances prévues",
    completed: "Terminées",
    plannedDuration: "Durée prévue",
    progress: "Progression",
    timelineTitle: "Programme du jour",
    timelineMeta: "{duration} · {sessionCount} séance",
    linkedActivity: "Activité associée : {activity}",
    actionPostpone: "Reporter",
    actionSkip: "Ignorer",
    actionDelete: "Supprimer",
    deleteDisabledTip: "La suppression n’est pas encore disponible.",
    linkActivity: "Associer une activité",
    weekContextTitle: "Contexte de la semaine",
    uploadTitle: "Importer une activité",
    uploadCardTitle: "Importer des fichiers d’activité",
    uploadDescription: "Importez des fichiers FIT, TCX ou GPX, associez-les à la séance du jour et analysez l’activité.",
    uploadSelectFile: "Choisir des fichiers",
  },
  it: {
    ...enCopy,
    backHome: "Torna alla home",
    coachTitle: "Suggerimento del coach AI",
    previousDay: "Giorno precedente",
    nextDay: "Giorno successivo",
    overviewTitle: "Riepilogo di oggi",
    plannedLoad: "Allenamenti pianificati",
    completed: "Completati",
    plannedDuration: "Durata pianificata",
    progress: "Avanzamento",
    timelineTitle: "Programma di allenamento",
    timelineMeta: "{duration} · {sessionCount} sessione",
    linkedActivity: "Attività collegata: {activity}",
    actionPostpone: "Rimanda",
    actionSkip: "Salta",
    actionDelete: "Elimina",
    deleteDisabledTip: "L’eliminazione non è ancora disponibile.",
    linkActivity: "Collega attività",
    weekContextTitle: "Contesto settimanale",
    uploadTitle: "Carica attività",
    uploadCardTitle: "Importa file di attività",
    uploadDescription: "Carica file FIT, TCX o GPX, collegali all’allenamento di oggi e analizza l’attività.",
    uploadSelectFile: "Scegli file",
  },
  ja: {
    ...enCopy,
    backHome: "ホームに戻る",
    coachTitle: "AIコーチの提案",
    previousDay: "前日",
    nextDay: "翌日",
    overviewTitle: "今日の概要",
    plannedLoad: "予定セッション",
    completed: "完了",
    plannedDuration: "予定時間",
    progress: "進捗",
    timelineTitle: "ワークアウト予定",
    timelineMeta: "{duration} · {sessionCount} セッション",
    linkedActivity: "関連アクティビティ：{activity}",
    actionPostpone: "延期",
    actionSkip: "スキップ",
    actionDelete: "削除",
    deleteDisabledTip: "削除にはまだ対応していません。",
    linkActivity: "アクティビティを関連付ける",
    weekContextTitle: "今週の状況",
    uploadTitle: "アクティビティをアップロード",
    uploadCardTitle: "アクティビティファイルを取り込む",
    uploadDescription: "FIT、TCX、GPX ファイルを取り込み、今日のワークアウトに関連付けて分析できます。",
    uploadSelectFile: "ファイルを選択",
  },
  ko: {
    ...enCopy,
    backHome: "홈으로 돌아가기",
    coachTitle: "AI 코치 제안",
    previousDay: "이전 날",
    nextDay: "다음 날",
    overviewTitle: "오늘 개요",
    plannedLoad: "계획된 훈련",
    completed: "완료",
    plannedDuration: "계획 시간",
    progress: "진행률",
    timelineTitle: "훈련 일정",
    timelineMeta: "{duration} · {sessionCount}개 세션",
    linkedActivity: "연결된 활동: {activity}",
    actionPostpone: "미루기",
    actionSkip: "건너뛰기",
    actionDelete: "삭제",
    deleteDisabledTip: "아직 삭제할 수 없습니다.",
    linkActivity: "활동 연결",
    weekContextTitle: "이번 주 맥락",
    uploadTitle: "활동 업로드",
    uploadCardTitle: "활동 파일 가져오기",
    uploadDescription: "FIT, TCX, GPX 파일을 가져와 오늘 훈련에 연결하고 활동을 분석할 수 있습니다.",
    uploadSelectFile: "파일 선택",
  },
  "pt-BR": {
    ...enCopy,
    backHome: "Voltar ao início",
    coachTitle: "Sugestão do treinador de IA",
    previousDay: "Dia anterior",
    nextDay: "Dia seguinte",
    overviewTitle: "Visão geral de hoje",
    plannedLoad: "Treinos planejados",
    completed: "Concluídos",
    plannedDuration: "Duração planejada",
    progress: "Progresso",
    timelineTitle: "Programação de treinos",
    timelineMeta: "{duration} · {sessionCount} sessão",
    linkedActivity: "Atividade vinculada: {activity}",
    actionPostpone: "Adiar",
    actionSkip: "Pular",
    actionDelete: "Excluir",
    deleteDisabledTip: "A exclusão ainda não está disponível.",
    linkActivity: "Vincular atividade",
    weekContextTitle: "Contexto da semana",
    uploadTitle: "Enviar atividade",
    uploadCardTitle: "Importar arquivos de atividade",
    uploadDescription: "Envie arquivos FIT, TCX ou GPX, vincule-os ao treino de hoje e analise a atividade.",
    uploadSelectFile: "Escolher arquivos",
  },
  zh: zhCopy,
  "zh-hant": {
    ...zhCopy,
    backHome: "返回首頁",
    coachTitle: "智能教練建議",
    overviewTitle: "今日概覽",
    timelineTitle: "訓練安排",
    weekContextTitle: "本週上下文",
    uploadTitle: "上傳訓練",
    uploadCardTitle: "匯入活動檔案",
    uploadSelectFile: "選擇檔案",
  },
} satisfies HomeDayDemoCopyMap;

export const HOME_DEMO_ISO_DATE = "2026-06-03";

export type HomeDaySourceCopy = {
  currentPlan: {
    cycle: string;
    weekLabel: string;
    todayFocus: string;
  };
  today: {
    summary: string;
    tags: string[];
    askCoach: string;
  };
  todayExecution: {
    workoutTitle: string;
    status: string;
    sport: string;
    duration: string;
    focus: string;
    linked: string;
  };
};

const enSourceCopy: HomeDaySourceCopy = {
  currentPlan: {
    cycle: "Marathon Base Block",
    weekLabel: "Week 5 / 12",
    todayFocus: "Tempo run",
  },
  today: {
    summary:
      "Keep today's tempo run. If the warm-up still feels flat, stay at the low end of the planned intensity and skip any extra volume.",
    tags: ["1 workout", "TSB -4", "Recent activity"],
    askCoach: "Ask AI Coach",
  },
  todayExecution: {
    workoutTitle: "Steady run 35 min",
    status: "Today",
    sport: "run",
    duration: "35 min",
    focus: "TSS 88",
    linked: "No linked activity",
  },
};

const zhSourceCopy: HomeDaySourceCopy = {
  currentPlan: {
    cycle: "马拉松基础周期",
    weekLabel: "第 5 / 12 周",
    todayFocus: "有氧跑量 + 一次质量课",
  },
  today: {
    summary:
      "保留节奏跑。若热身后疲劳上升，就控制强度，保护明天的有氧课。",
    tags: ["1 次训练", "TSB -4", "最近活动"],
    askCoach: "问智能教练",
  },
  todayExecution: {
    workoutTitle: "稳态跑 35 min",
    status: "今天",
    sport: "run",
    duration: "35 min",
    focus: "TSS 88",
    linked: "未关联活动",
  },
};

const homeDaySourceCopyMap = {
  en: enSourceCopy,
  zh: zhSourceCopy,
  "zh-hant": {
    ...zhSourceCopy,
    currentPlan: {
      cycle: "馬拉松基礎週期",
      weekLabel: "第 5 / 12 週",
      todayFocus: "有氧跑量 + 一次質量課",
    },
    today: {
      ...zhSourceCopy.today,
      summary: "保留節奏跑。若熱身後疲勞上升，就控制強度，保護明天的有氧課。",
      tags: ["1 次訓練", "TSB -4", "最近活動"],
      askCoach: "詢問智能教練",
    },
    todayExecution: {
      ...zhSourceCopy.todayExecution,
      status: "今天",
      linked: "未關聯活動",
    },
  },
  ja: enSourceCopy,
} satisfies Record<string, HomeDaySourceCopy>;

export function buildHomeDaySourceCopy(lang: string): HomeDaySourceCopy {
  return homeDaySourceCopyMap[lang as keyof typeof homeDaySourceCopyMap] ?? enSourceCopy;
}

export function buildHomeDayPlanFixture(args: {
  cycle: string;
  weekLabel: string;
  intent: string;
  coachTitle: string;
  coachBody: string;
  coachTags: string[];
  askCoach: string;
  workout: {
    title: string;
    status: string;
    sport: string;
    duration: string;
    focus: string;
    linked: string;
    session: string;
  };
  weekdayShort: Record<string, string>;
}): import("./types").DayPlanDemoData {
  const weekdayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  const weekContext = weekdayKeys.map((key) => ({
    day: args.weekdayShort[key],
    load: key === "wed" ? 1 : key === "tue" || key === "thu" ? 1 : 0,
    active: key === "wed",
  }));

  return {
    date: HOME_DEMO_ISO_DATE,
    dateLabel: "6/3",
    weekday: args.weekdayShort.wed,
    cycle: args.cycle,
    weekLabel: args.weekLabel,
    intent: args.intent,
    summary: {
      plannedLoad: 1,
      completedLoad: 0,
      plannedDuration: args.workout.duration,
      completedCount: 0,
      totalCount: 1,
    },
    coach: {
      title: args.coachTitle,
      body: args.coachBody,
      tags: args.coachTags,
      askCoach: args.askCoach,
    },
    workouts: [
      {
        id: "demo-workout-1",
        title: args.workout.title,
        sport: "run",
        duration: args.workout.duration,
        sessionCount: 1,
        focus: args.workout.focus,
        detail: args.workout.linked,
        status: args.workout.status,
        statusType: "pending",
        linkedLabel: null,
      },
    ],
    weekContext,
  };
}
