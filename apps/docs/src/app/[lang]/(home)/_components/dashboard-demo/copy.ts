import {
  Battery,
  Dumbbell,
  Heart,
  TrendingUp,
  Zap,
} from "lucide-react";

import { DEMO_CHART_SERIES } from "@/components/charts/demo-chart-data";
import { getMetricChartColor } from "@/lib/metric-chart-colors";

import type { DashboardDemoCopy, DashboardDemoPayload } from "./types";

function buildPayload(locale: "en" | "zh"): DashboardDemoPayload {
  const isZh = locale === "zh";
  return {
    sportFilter: isZh ? "全部项目" : "All sports",
    editLabel: isZh ? "编辑" : "Edit",
    stats: [
      {
        key: "vo2Max",
        title: isZh ? "最大摄氧量" : "VO2max",
        value: "54",
        unit: "ml/kg/min",
        detail: isZh ? "极好" : "Excellent",
        details: isZh
          ? "最大摄氧量反映有氧能力上限，更适合看趋势而不是单日波动。"
          : "VO2 Max estimates your aerobic ceiling. In Training Load it is tracked as a trend rather than a single-day spike.",
        icon: Heart,
        color: "text-red-500",
        bgColor: "bg-red-100 dark:bg-red-900/30",
      },
      {
        key: "atl",
        title: isZh ? "疲劳" : "Fatigue",
        value: "76",
        unit: "ATL",
        detail: isZh ? "偏高" : "High",
        details: isZh
          ? "ATL 反映近期训练带来的短期疲劳，连续高强度训练后通常会上升。"
          : "ATL reflects short-term fatigue from recent training. Rising ATL usually means you have stacked several hard sessions close together.",
        icon: Zap,
        color: "text-violet-500",
        bgColor: "bg-violet-100 dark:bg-violet-900/30",
      },
      {
        key: "ctl",
        title: isZh ? "体能" : "Fitness",
        value: "72",
        unit: "CTL",
        detail: isZh ? "稳定" : "Stable",
        details: isZh
          ? "CTL 反映长期体能积累，需要持续训练才会缓慢上升，停训后会逐渐下降。"
          : "CTL is a longer-term fitness signal built from sustained training load. It rises slowly with consistent work and falls when you back off.",
        icon: Dumbbell,
        color: "text-sky-500",
        bgColor: "bg-sky-100 dark:bg-sky-900/30",
      },
      {
        key: "tsb",
        title: isZh ? "状态" : "Form",
        value: "-4",
        unit: "TSB",
        detail: isZh ? "可训练" : "Trainable",
        details: isZh
          ? "TSB 对比体能与疲劳，负值通常表示当前疲劳高于新鲜度。"
          : "TSB compares fitness and fatigue. Negative values suggest you are carrying more fatigue than freshness.",
        icon: Battery,
        color: "text-slate-500",
        bgColor: "bg-slate-100 dark:bg-slate-900/30",
      },
    ],
    charts: [
      {
        id: "weekPressure",
        title: isZh ? "训练压力" : "Training Stress",
        data: [...DEMO_CHART_SERIES.weekPressure],
        accentColor: getMetricChartColor("weekPressure"),
        icon: TrendingUp,
      },
      {
        id: "ctl",
        title: isZh ? "体能" : "Fitness",
        data: [...DEMO_CHART_SERIES.ctl],
        accentColor: getMetricChartColor("ctl"),
        icon: Dumbbell,
      },
      {
        id: "atl",
        title: isZh ? "疲劳" : "Fatigue",
        data: [...DEMO_CHART_SERIES.atl],
        accentColor: getMetricChartColor("atl"),
        icon: Zap,
      },
      {
        id: "tsb",
        title: isZh ? "状态" : "Form",
        data: [...DEMO_CHART_SERIES.tsb],
        accentColor: getMetricChartColor("tsb"),
        icon: Battery,
      },
    ],
  };
}

function buildCopy(payload: DashboardDemoPayload, locale: "en" | "zh"): DashboardDemoCopy {
  const isZh = locale === "zh";
  return {
    aboutMetric: isZh ? "了解 {title}" : "Learn more about {title}",
    overview: {
      title: isZh ? "概览" : "Overview",
      recent30Days: isZh ? "最近 30 天" : "Recent 30 days",
    },
    payload,
  };
}

const enCopy = buildCopy(buildPayload("en"), "en");
const zhCopy = buildCopy(buildPayload("zh"), "zh");

const zhHantCopy: DashboardDemoCopy = {
  ...zhCopy,
  aboutMetric: "了解 {title}",
  overview: {
    title: "概覽",
    recent30Days: "最近 30 天",
  },
  payload: {
    ...zhCopy.payload,
    sportFilter: "全部項目",
    editLabel: "編輯",
    stats: zhCopy.payload.stats.map((stat) => ({
      ...stat,
      title:
        stat.key === "vo2Max"
          ? "最大攝氧量"
          : stat.key === "atl"
            ? "疲勞"
            : stat.key === "ctl"
              ? "體能"
              : "狀態",
      detail:
        stat.key === "vo2Max"
          ? "極好"
          : stat.key === "atl"
            ? "偏高"
            : stat.key === "ctl"
              ? "穩定"
              : "可訓練",
    })),
    charts: [
      { ...zhCopy.payload.charts[0]!, title: "訓練壓力" },
      { ...zhCopy.payload.charts[1]!, title: "體能" },
      { ...zhCopy.payload.charts[2]!, title: "疲勞" },
      { ...zhCopy.payload.charts[3]!, title: "狀態" },
    ],
  },
};

const jaCopy: DashboardDemoCopy = {
  ...enCopy,
  aboutMetric: "Learn more about {title}",
  overview: {
    title: "概要",
    recent30Days: "直近 30 日",
  },
  payload: {
    ...enCopy.payload,
    sportFilter: "全種目",
    editLabel: "編集",
    stats: [
      {
        ...enCopy.payload.stats[0]!,
        title: "VO2max",
        detail: "非常に良い",
      },
      {
        ...enCopy.payload.stats[1]!,
        title: "疲労",
        detail: "高め",
      },
      {
        ...enCopy.payload.stats[2]!,
        title: "体力",
        detail: "安定",
      },
      {
        ...enCopy.payload.stats[3]!,
        title: "コンディション",
        detail: "トレーニング可",
      },
    ],
    charts: [
      { ...enCopy.payload.charts[0]!, title: "トレーニングストレス" },
      { ...enCopy.payload.charts[1]!, title: "体力" },
      { ...enCopy.payload.charts[2]!, title: "疲労" },
      { ...enCopy.payload.charts[3]!, title: "コンディション" },
    ],
  },
};

type LocalizedDashboardSpec = {
  aboutMetric: string;
  overviewTitle: string;
  recent30Days: string;
  sportFilter: string;
  editLabel: string;
  stats: {
    vo2Max: { title: string; detail: string; details: string };
    atl: { title: string; detail: string; details: string };
    ctl: { title: string; detail: string; details: string };
    tsb: { title: string; detail: string; details: string };
  };
  charts: {
    weekPressure: string;
    ctl: string;
    atl: string;
    tsb: string;
  };
};

function buildLocalizedDashboardCopy(spec: LocalizedDashboardSpec): DashboardDemoCopy {
  const basePayload = enCopy.payload;
  return {
    aboutMetric: spec.aboutMetric,
    overview: {
      title: spec.overviewTitle,
      recent30Days: spec.recent30Days,
    },
    payload: {
      sportFilter: spec.sportFilter,
      editLabel: spec.editLabel,
      stats: basePayload.stats.map((stat) => ({
        ...stat,
        ...spec.stats[stat.key],
      })),
      charts: [
        { ...basePayload.charts[0]!, title: spec.charts.weekPressure },
        { ...basePayload.charts[1]!, title: spec.charts.ctl },
        { ...basePayload.charts[2]!, title: spec.charts.atl },
        { ...basePayload.charts[3]!, title: spec.charts.tsb },
      ],
    },
  };
}

const koCopy = buildLocalizedDashboardCopy({
  aboutMetric: "{title} 자세히 보기",
  overviewTitle: "개요",
  recent30Days: "최근 30일",
  sportFilter: "모든 종목",
  editLabel: "편집",
  stats: {
    vo2Max: {
      title: "VO2max",
      detail: "매우 우수",
      details:
        "VO2max는 유산소 능력의 상한을 추정합니다. Training Load에서는 하루의 급변보다 장기 추세로 추적합니다.",
    },
    atl: {
      title: "피로",
      detail: "높음",
      details:
        "ATL은 최근 훈련으로 쌓인 단기 피로를 반영합니다. 고강도 세션을 연달아 소화하면 보통 상승합니다.",
    },
    ctl: {
      title: "체력",
      detail: "안정",
      details:
        "CTL은 꾸준한 훈련 부하로 쌓이는 장기 체력 지표입니다. 지속적으로 훈련하면 천천히 오르고, 쉬면 서서히 내려갑니다.",
    },
    tsb: {
      title: "컨디션",
      detail: "훈련 가능",
      details:
        "TSB는 체력과 피로를 비교합니다. 음수일수록 현재 신선도보다 피로가 더 많이 쌓여 있음을 뜻합니다.",
    },
  },
  charts: {
    weekPressure: "훈련 스트레스",
    ctl: "체력",
    atl: "피로",
    tsb: "컨디션",
  },
});

const deCopy = buildLocalizedDashboardCopy({
  aboutMetric: "Mehr über {title} erfahren",
  overviewTitle: "Übersicht",
  recent30Days: "Letzte 30 Tage",
  sportFilter: "Alle Sportarten",
  editLabel: "Bearbeiten",
  stats: {
    vo2Max: {
      title: "VO2max",
      detail: "Ausgezeichnet",
      details:
        "Die VO2max schätzt deine aerobe Obergrenze. In Training Load wird sie als Trend statt als einzelner Tagesausschlag verfolgt.",
    },
    atl: {
      title: "Ermüdung",
      detail: "Hoch",
      details:
        "ATL spiegelt die kurzfristige Ermüdung aus dem jüngsten Training wider. Ein steigender ATL zeigt meist mehrere harte Einheiten dicht hintereinander an.",
    },
    ctl: {
      title: "Fitness",
      detail: "Stabil",
      details:
        "CTL ist ein langfristiges Fitnesssignal aus anhaltender Trainingsbelastung. Es steigt langsam bei konstanter Arbeit und fällt bei Entlastung.",
    },
    tsb: {
      title: "Form",
      detail: "Trainierbar",
      details:
        "TSB vergleicht Fitness und Ermüdung. Negative Werte deuten darauf hin, dass aktuell mehr Ermüdung als Frische vorhanden ist.",
    },
  },
  charts: {
    weekPressure: "Trainingsbelastung",
    ctl: "Fitness",
    atl: "Ermüdung",
    tsb: "Form",
  },
});

const frCopy = buildLocalizedDashboardCopy({
  aboutMetric: "En savoir plus sur {title}",
  overviewTitle: "Vue d'ensemble",
  recent30Days: "30 derniers jours",
  sportFilter: "Tous les sports",
  editLabel: "Modifier",
  stats: {
    vo2Max: {
      title: "VO2max",
      detail: "Excellent",
      details:
        "La VO2max estime votre plafond aérobie. Dans Training Load, elle est suivie comme une tendance plutôt qu'un pic isolé sur une journée.",
    },
    atl: {
      title: "Fatigue",
      detail: "Élevée",
      details:
        "L'ATL reflète la fatigue à court terme issue des entraînements récents. Une hausse de l'ATL indique souvent plusieurs séances intenses rapprochées.",
    },
    ctl: {
      title: "Forme physique",
      detail: "Stable",
      details:
        "La CTL est un indicateur de condition à long terme bâti par une charge d'entraînement régulière. Elle progresse lentement avec la constance et baisse au repos.",
    },
    tsb: {
      title: "Fraîcheur",
      detail: "Entraînable",
      details:
        "Le TSB compare condition physique et fatigue. Une valeur négative indique que la fatigue l'emporte actuellement sur la fraîcheur.",
    },
  },
  charts: {
    weekPressure: "Stress d'entraînement",
    ctl: "Forme physique",
    atl: "Fatigue",
    tsb: "Fraîcheur",
  },
});

const esCopy = buildLocalizedDashboardCopy({
  aboutMetric: "Más información sobre {title}",
  overviewTitle: "Resumen",
  recent30Days: "Últimos 30 días",
  sportFilter: "Todos los deportes",
  editLabel: "Editar",
  stats: {
    vo2Max: {
      title: "VO2max",
      detail: "Excelente",
      details:
        "El VO2max estima tu techo aeróbico. En Training Load se analiza como tendencia y no como un pico aislado de un solo día.",
    },
    atl: {
      title: "Fatiga",
      detail: "Alta",
      details:
        "ATL refleja la fatiga a corto plazo del entrenamiento reciente. Un aumento de ATL suele indicar varias sesiones exigentes seguidas.",
    },
    ctl: {
      title: "Forma física",
      detail: "Estable",
      details:
        "CTL es una señal de condición a largo plazo construida con carga de entrenamiento sostenida. Sube despacio con constancia y baja al reducir el volumen.",
    },
    tsb: {
      title: "Estado",
      detail: "Entrenable",
      details:
        "TSB compara condición física y fatiga. Los valores negativos indican que acumulas más fatiga que frescura.",
    },
  },
  charts: {
    weekPressure: "Estrés de entrenamiento",
    ctl: "Forma física",
    atl: "Fatiga",
    tsb: "Estado",
  },
});

const itCopy = buildLocalizedDashboardCopy({
  aboutMetric: "Scopri di più su {title}",
  overviewTitle: "Panoramica",
  recent30Days: "Ultimi 30 giorni",
  sportFilter: "Tutti gli sport",
  editLabel: "Modifica",
  stats: {
    vo2Max: {
      title: "VO2max",
      detail: "Eccellente",
      details:
        "Il VO2max stima il tuo limite aerobico. In Training Load viene monitorato come trend e non come singolo picco giornaliero.",
    },
    atl: {
      title: "Fatica",
      detail: "Alta",
      details:
        "ATL riflette la fatica a breve termine dovuta agli allenamenti recenti. Un ATL in crescita indica spesso diverse sedute intense ravvicinate.",
    },
    ctl: {
      title: "Fitness",
      detail: "Stabile",
      details:
        "CTL è un indicatore di forma a lungo termine costruito con un carico di allenamento costante. Cresce lentamente con la continuità e cala quando scarichi.",
    },
    tsb: {
      title: "Forma",
      detail: "Allenabile",
      details:
        "TSB mette a confronto fitness e fatica. Valori negativi indicano che stai accumulando più fatica che freschezza.",
    },
  },
  charts: {
    weekPressure: "Stress di allenamento",
    ctl: "Fitness",
    atl: "Fatica",
    tsb: "Forma",
  },
});

const ptBrCopy = buildLocalizedDashboardCopy({
  aboutMetric: "Saiba mais sobre {title}",
  overviewTitle: "Visão geral",
  recent30Days: "Últimos 30 dias",
  sportFilter: "Todos os esportes",
  editLabel: "Editar",
  stats: {
    vo2Max: {
      title: "VO2max",
      detail: "Excelente",
      details:
        "O VO2max estima seu teto aeróbico. No Training Load, ele é acompanhado como tendência, e não como um pico isolado de um único dia.",
    },
    atl: {
      title: "Fadiga",
      detail: "Alta",
      details:
        "ATL reflete a fadiga de curto prazo dos treinos recentes. Um ATL em alta geralmente indica várias sessões fortes em sequência.",
    },
    ctl: {
      title: "Condicionamento",
      detail: "Estável",
      details:
        "CTL é um sinal de condicionamento de longo prazo construído com carga de treino consistente. Sobe devagar com regularidade e cai quando você reduz o volume.",
    },
    tsb: {
      title: "Forma",
      detail: "Treinável",
      details:
        "TSB compara condicionamento e fadiga. Valores negativos indicam que você carrega mais fadiga do que frescor no momento.",
    },
  },
  charts: {
    weekPressure: "Estresse de treino",
    ctl: "Condicionamento",
    atl: "Fadiga",
    tsb: "Forma",
  },
});

export const dashboardDemoCopy = {
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
} satisfies Record<string, DashboardDemoCopy>;

export type DashboardDemoLang = keyof typeof dashboardDemoCopy;
