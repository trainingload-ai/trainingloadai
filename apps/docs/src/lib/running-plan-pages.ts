import {
  getRunPlanTemplate,
  normalizePlanTemplateLocale,
} from "@shared/plan-templates";
import {
  HALF_MARATHON_PLAN_FACTS,
  isHalfMarathonIndexedLocale,
} from "./half-marathon-training-plan-copy";
import {
  MARATHON_PLAN_FACTS,
  isMarathonIndexedLocale,
} from "./marathon-training-plan-copy";
import {
  TEN_K_PLAN_FACTS,
  isTenKIndexedLocale,
} from "./ten-k-training-plan-copy";

export const runningPlanSlugs = [
  "couch-to-5k-training-plan",
  "5k-training-plan",
  "5k-training-plan-intermediate",
  "10k-training-plan",
  "half-marathon-training-plan",
  "marathon-training-plan",
] as const;

export type RunningPlanSlug = (typeof runningPlanSlugs)[number];

export type RunningPlan = {
  slug: RunningPlanSlug;
  /** Public URL; kept separate because some plans use nested routes. */
  routePath?: string;
  templateSlug?:
    | "first-5k"
    | "finish-5k"
    | "improve-5k"
    | "finish-10k"
    | "finish-half-marathon"
    | "finish-marathon";
  distance: string;
  sport: "Running";
  weeks: string;
  level: string;
  weeklyVolume: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  eyebrow: string;
  title: string;
  subtitle: string;
  primaryCta: string;
  primaryCtaTarget?: "app" | "schedule";
  secondaryCta: string;
  secondaryCtaTarget?: "app" | "plan-hub";
  conversionCta?: string;
  finalCta?: string;
  finalTitle?: string;
  finalText?: string;
  collectionCta?: string;
  trustItems?: string[];
  promise: string;
  planChooser?: {
    title: string;
    subtitle: string;
    options: Array<{
      label: string;
      title: string;
      description: string;
      href: string | null;
    }>;
  };
  forTitle: string;
  forItems: string[];
  previewTitle: string;
  previewSubtitle: string;
  previewRows: Array<[string, string, string]>;
  contentTitle?: string;
  contentSubtitle?: string;
  contentSections?: Array<[string, string, string[]]>;
  conversionTitle?: string;
  conversionText?: string;
  aiTitle: string;
  aiSubtitle: string;
  aiSignals: Array<[string, string]>;
  relatedTitle?: string;
  relatedLinks?: Array<[string, string, string]>;
  faq: Array<[string, string]>;
  howToTitle?: string;
  howToDescription?: string;
  howToSteps?: Array<[string, string]>;
  howToTotalTime?: string;
};

export function createCouchTo5kPlan(
  localizedPlan: RunningPlan,
  lang = "en",
): RunningPlan {
  const loopLinks = productLoopRelatedLinks(lang).filter(
    ([, href]) => href !== "/vdot-calculator",
  );
  return {
    ...localizedPlan,
    slug: "couch-to-5k-training-plan",
    routePath: "/couch-to-5k-training-plan",
    templateSlug: "first-5k",
    planChooser: createFiveKPlanChooser(lang, "couch"),
    relatedLinks: mergeRelatedLinks(
      mergeRelatedLinks(
        localizedPlan.relatedLinks,
        fiveKHubRelatedLink(lang, "couch"),
      ),
      loopLinks,
    ),
  };
}

type PlanCopyLocale =
  | "en"
  | "zh"
  | "zh-hant"
  | "ja"
  | "ko"
  | "de"
  | "fr"
  | "es"
  | "it"
  | "pt-BR";

function planCopyLocale(lang: string): PlanCopyLocale {
  if (lang === "zh-hant") return "zh-hant";
  if (lang.startsWith("zh")) return "zh";
  if (lang === "ja") return "ja";
  if (lang === "ko") return "ko";
  if (lang === "de") return "de";
  if (lang === "fr") return "fr";
  if (lang === "es") return "es";
  if (lang === "it") return "it";
  if (lang === "pt-BR" || lang.toLowerCase() === "pt-br") return "pt-BR";
  return "en";
}

type FiveKChooserVariant = "couch" | "finish" | "intermediate";
type RaceDistance = "10k" | "half-marathon" | "marathon";

const fiveKChooserLabels: Record<
  PlanCopyLocale,
  { options: [string, string, string]; current: string }
> = {
  en: {
    options: ["Starting from zero", "Running 20–30 minutes", "Already racing"],
    current: "Current plan",
  },
  zh: {
    options: ["从零开始", "能连续跑 20–30 分钟", "已有比赛基础"],
    current: "当前计划",
  },
  "zh-hant": {
    options: ["從零開始", "能連續跑 20–30 分鐘", "已有比賽基礎"],
    current: "目前計畫",
  },
  ja: {
    options: ["ゼロから始める", "20〜30分走れる", "レース経験あり"],
    current: "現在のプラン",
  },
  ko: {
    options: ["처음 시작", "20–30분 연속 러닝 가능", "레이스 경험 있음"],
    current: "현재 플랜",
  },
  de: {
    options: [
      "Von Null starten",
      "20–30 Minuten am Stück laufen",
      "Bereits Wettkampferfahrung",
    ],
    current: "Aktueller Plan",
  },
  fr: {
    options: ["Partir de zéro", "Courir 20–30 minutes", "Déjà en compétition"],
    current: "Plan actuel",
  },
  es: {
    options: ["Empezar desde cero", "Correr 20–30 minutos", "Ya compites"],
    current: "Plan actual",
  },
  it: {
    options: ["Partire da zero", "Correre 20–30 minuti", "Già in gara"],
    current: "Piano attuale",
  },
  "pt-BR": {
    options: ["Começando do zero", "Correndo 20–30 minutos", "Já competindo"],
    current: "Plano atual",
  },
};

function createFiveKPlanChooser(
  lang: string,
  current: FiveKChooserVariant,
): NonNullable<RunningPlan["planChooser"]> {
  const locale = planCopyLocale(lang);
  const source = fiveKCopy[locale]?.planChooser ?? fiveKCopy.en.planChooser!;
  const labels = fiveKChooserLabels[locale];
  const routes = [
    "/couch-to-5k-training-plan",
    "/5k-training-plan",
    "/5k-training-plan/intermediate",
  ] as const;
  const currentIndex = { couch: 0, finish: 1, intermediate: 2 }[current];

  return {
    ...source,
    options: source.options.map((option, index) => ({
      ...option,
      label: index === currentIndex ? labels.current : labels.options[index],
      href: index === currentIndex ? null : routes[index],
    })),
  };
}

const raceDistanceChooserCopy: Record<
  PlanCopyLocale,
  Record<
    RaceDistance,
    {
      title: string;
      subtitle: string;
      options: Array<{
        label: string;
        title: string;
        description: string;
      }>;
    }
  >
> = {
  en: {
    "10k": {
      title: "Choose the right 10K plan",
      subtitle:
        "Start with your current running base and goal, not the fastest-looking schedule.",
      options: [
        {
          label: "Finish",
          title: "First 10K",
          description:
            "Ten weeks, three runs per week and no required threshold work.",
        },
        {
          label: "Improve",
          title: "Run a faster 10K",
          description:
            "Add repeatable quality work after a first finish is comfortable.",
        },
        {
          label: "Target",
          title: "Train for a goal time",
          description:
            "Use a recent result and race date to set a specific target.",
        },
      ],
    },
    "half-marathon": {
      title: "Choose the right half marathon plan",
      subtitle:
        "Match the plan to your current long-run base and whether you want to finish or race.",
      options: [
        {
          label: "Finish",
          title: "First half marathon",
          description:
            "Fourteen weeks with four runs per week and a gradual long run.",
        },
        {
          label: "Improve",
          title: "Improve your half marathon",
          description:
            "Build sustainable quality after the distance is familiar.",
        },
        {
          label: "Target",
          title: "Train for a goal time",
          description:
            "Turn a recent race result into a specific race-day target.",
        },
      ],
    },
    marathon: {
      title: "Choose the right marathon plan",
      subtitle:
        "Your long-run base and race goal decide whether you should finish, improve or target a time.",
      options: [
        {
          label: "Finish",
          title: "First marathon",
          description:
            "Eighteen weeks, four runs per week and a protected three-week taper.",
        },
        {
          label: "Improve",
          title: "Improve your marathon",
          description:
            "Add controlled quality after marathon training is repeatable.",
        },
        {
          label: "Target",
          title: "Train for a goal time",
          description:
            "Use current fitness and race date to pursue a specific result.",
        },
      ],
    },
  },
  zh: {
    "10k": {
      title: "选择适合你的 10 公里计划",
      subtitle: "先看当前跑步基础和目标，不要直接选择看起来最难的课表。",
      options: [
        {
          label: "完赛",
          title: "首次完成 10 公里",
          description: "10 周、每周三跑，不要求阈值或间歇训练。",
        },
        {
          label: "进阶",
          title: "提高 10 公里成绩",
          description: "已经能轻松完赛后，再加入可重复的质量训练。",
        },
        {
          label: "目标",
          title: "按目标成绩备赛",
          description: "根据近期成绩和比赛日期，安排更具体的训练。",
        },
      ],
    },
    "half-marathon": {
      title: "选择适合你的半马计划",
      subtitle: "根据当前长跑基础，选择首次完赛、进阶提高或目标成绩。",
      options: [
        {
          label: "完赛",
          title: "首次完成半马",
          description: "14 周、每周四跑，逐步延长长跑时间。",
        },
        {
          label: "进阶",
          title: "提高半马成绩",
          description: "熟悉半马距离后，再加入稳定可控的质量训练。",
        },
        {
          label: "目标",
          title: "按目标成绩备赛",
          description: "用近期比赛成绩和目标赛事制定专项安排。",
        },
      ],
    },
    marathon: {
      title: "选择适合你的马拉松计划",
      subtitle: "当前长跑基础和比赛目标，决定你该先完赛、进阶还是冲击成绩。",
      options: [
        {
          label: "完赛",
          title: "完成首场马拉松",
          description: "18 周、每周四跑，并保留完整的三周减量。",
        },
        {
          label: "进阶",
          title: "提高马拉松成绩",
          description: "已经稳定完成马拉松训练后，再增加可控质量课。",
        },
        {
          label: "目标",
          title: "按目标成绩备赛",
          description: "结合当前能力和比赛日期，准备更明确的目标。",
        },
      ],
    },
  },
  "zh-hant": {
    "10k": {
      title: "選擇適合你的 10 公里計畫",
      subtitle: "先看目前跑步基礎和目標，不要直接選擇看起來最難的課表。",
      options: [
        {
          label: "完賽",
          title: "首次完成 10 公里",
          description: "10 週、每週三跑，不要求閾值或間歇訓練。",
        },
        {
          label: "進階",
          title: "提高 10 公里成績",
          description: "已經能輕鬆完賽後，再加入可重複的品質訓練。",
        },
        {
          label: "目標",
          title: "按目標成績備賽",
          description: "根據近期成績和比賽日期，安排更具體的訓練。",
        },
      ],
    },
    "half-marathon": {
      title: "選擇適合你的半馬計畫",
      subtitle: "根據目前長跑基礎，選擇首次完賽、進階提高或目標成績。",
      options: [
        {
          label: "完賽",
          title: "首次完成半馬",
          description: "14 週、每週四跑，逐步延長長跑時間。",
        },
        {
          label: "進階",
          title: "提高半馬成績",
          description: "熟悉半馬距離後，再加入穩定可控的品質訓練。",
        },
        {
          label: "目標",
          title: "按目標成績備賽",
          description: "用近期比賽成績和目標賽事制定專項安排。",
        },
      ],
    },
    marathon: {
      title: "選擇適合你的馬拉松計畫",
      subtitle: "目前長跑基礎和比賽目標，決定你該先完賽、進階還是挑戰成績。",
      options: [
        {
          label: "完賽",
          title: "完成首場馬拉松",
          description: "18 週、每週四跑，並保留完整的三週減量。",
        },
        {
          label: "進階",
          title: "提高馬拉松成績",
          description: "已能穩定完成馬拉松訓練後，再增加可控品質課。",
        },
        {
          label: "目標",
          title: "按目標成績備賽",
          description: "結合目前能力和比賽日期，準備更明確的目標。",
        },
      ],
    },
  },
  ja: {
    "10k": {
      title: "自分に合う10kmプランを選ぶ",
      subtitle: "難しさではなく、現在の走力と目標に合うメニューから始めます。",
      options: [
        {
          label: "完走",
          title: "初めての10km",
          description:
            "10週間・週3回で、閾値走やインターバルは必須ではありません。",
        },
        {
          label: "向上",
          title: "10kmを速く走る",
          description:
            "余裕を持って完走できてから、再現できる質の練習を加えます。",
        },
        {
          label: "目標",
          title: "目標タイムに向ける",
          description: "最近の記録とレース日から具体的な目標を設定します。",
        },
      ],
    },
    "half-marathon": {
      title: "自分に合うハーフマラソンプランを選ぶ",
      subtitle: "現在のロング走の土台と、完走か記録かという目標に合わせます。",
      options: [
        {
          label: "完走",
          title: "初めてのハーフ",
          description: "14週間・週4回でロング走を段階的に伸ばします。",
        },
        {
          label: "向上",
          title: "ハーフの記録を伸ばす",
          description:
            "距離に慣れてから、無理なく続けられる質の練習を加えます。",
        },
        {
          label: "目標",
          title: "目標タイムに向ける",
          description: "最近のレース結果から具体的なレース目標を作ります。",
        },
      ],
    },
    marathon: {
      title: "自分に合うフルマラソンプランを選ぶ",
      subtitle:
        "ロング走の土台とレース目標から、完走・向上・目標タイムを選びます。",
      options: [
        {
          label: "完走",
          title: "初めてのフルマラソン",
          description: "18週間・週4回で、3週間のテーパリングを守ります。",
        },
        {
          label: "向上",
          title: "マラソン記録を伸ばす",
          description:
            "マラソン練習を継続できてから、管理された質の練習を加えます。",
        },
        {
          label: "目標",
          title: "目標タイムに向ける",
          description: "現在の走力とレース日から具体的な結果を目指します。",
        },
      ],
    },
  },
  ko: {
    "10k": {
      title: "내게 맞는 10K 플랜 선택하기",
      subtitle:
        "가장 빨라 보이는 일정이 아니라 현재 러닝 기반과 목표에서 시작하세요.",
      options: [
        {
          label: "완주",
          title: "첫 10K 완주",
          description:
            "10주, 주 3회 러닝으로 필수 역치 훈련 없이 완주를 준비합니다.",
        },
        {
          label: "기록 향상",
          title: "더 빠른 10K 달리기",
          description:
            "첫 완주가 편안해졌다면 반복 가능한 퀄리티 훈련을 추가하세요.",
        },
        {
          label: "목표 기록",
          title: "목표 기록 대비 훈련",
          description:
            "최근 기록과 대회 날짜를 바탕으로 구체적인 목표를 설정합니다.",
        },
      ],
    },
    "half-marathon": {
      title: "내게 맞는 하프 마라톤 플랜 선택하기",
      subtitle:
        "현재 롱런 기반과 완주 또는 기록 목표에 맞춰 플랜을 고르세요.",
      options: [
        {
          label: "완주",
          title: "첫 하프 마라톤",
          description:
            "14주, 주 4회 러닝으로 롱런을 점진적으로 늘려갑니다.",
        },
        {
          label: "기록 향상",
          title: "하프 마라톤 기록 단축",
          description:
            "거리에 익숙해진 뒤 지속 가능한 퀄리티 훈련을 쌓아갑니다.",
        },
        {
          label: "목표 기록",
          title: "목표 기록 대비 훈련",
          description:
            "최근 대회 결과를 구체적인 레이스 당일 목표로 전환합니다.",
        },
      ],
    },
    marathon: {
      title: "내게 맞는 마라톤 플랜 선택하기",
      subtitle:
        "현재 롱런 기반과 레이스 목표에 따라 완주, 기록 향상, 목표 기록 중 선택하세요.",
      options: [
        {
          label: "완주",
          title: "첫 풀 마라톤",
          description:
            "18주, 주 4회 러닝과 충분히 보호된 3주 테이퍼링으로 구성됩니다.",
        },
        {
          label: "기록 향상",
          title: "마라톤 기록 단축",
          description:
            "마라톤 훈련을 안정적으로 반복할 수 있게 된 뒤 제어된 퀄리티 훈련을 더합니다.",
        },
        {
          label: "목표 기록",
          title: "목표 기록 대비 훈련",
          description:
            "현재 체력과 대회 날짜를 기준으로 구체적인 기록을 겨냥합니다.",
        },
      ],
    },
  },
  de: {
    "10k": {
      title: "Den passenden 10-km-Plan wählen",
      subtitle:
        "Starte mit deiner aktuellen Laufbasis und deinem Ziel – nicht mit dem schnellsten Trainingsplan.",
      options: [
        {
          label: "Ankommen",
          title: "Erste 10 km",
          description:
            "Zehn Wochen, drei Läufe pro Woche und kein verpflichtendes Schwellentraining.",
        },
        {
          label: "Steigern",
          title: "Schnellere 10 km laufen",
          description:
            "Ergänze reproduzierbare Qualitätseinheiten, sobald der erste Zieleinlauf locker gelingt.",
        },
        {
          label: "Zielzeit",
          title: "Auf eine Zielzeit trainieren",
          description:
            "Nutze ein aktuelles Ergebnis und das Wettkampfdatum für ein konkretes Ziel.",
        },
      ],
    },
    "half-marathon": {
      title: "Den passenden Halbmarathon-Plan wählen",
      subtitle:
        "Richte den Plan an deiner aktuellen Long-Run-Basis aus und danach, ob du ankommen oder auf Zeit laufen willst.",
      options: [
        {
          label: "Ankommen",
          title: "Erster Halbmarathon",
          description:
            "Vierzehn Wochen mit vier Läufen pro Woche und schrittweise längerem Dauerlauf.",
        },
        {
          label: "Steigern",
          title: "Halbmarathon verbessern",
          description:
            "Baue nachhaltige Qualitätseinheiten auf, sobald die Distanz vertraut ist.",
        },
        {
          label: "Zielzeit",
          title: "Auf eine Zielzeit trainieren",
          description:
            "Mach aus einem aktuellen Wettkampfergebnis ein konkretes Ziel für den Renntag.",
        },
      ],
    },
    marathon: {
      title: "Den passenden Marathon-Plan wählen",
      subtitle:
        "Deine Long-Run-Basis und dein Wettkampfziel entscheiden über Ankommen, Steigern oder Zielzeit.",
      options: [
        {
          label: "Ankommen",
          title: "Erster Marathon",
          description:
            "Achtzehn Wochen, vier Läufe pro Woche und ein geschütztes dreiwöchiges Tapering.",
        },
        {
          label: "Steigern",
          title: "Marathon verbessern",
          description:
            "Ergänze kontrollierte Qualitätseinheiten, sobald Marathontraining zuverlässig wiederholbar ist.",
        },
        {
          label: "Zielzeit",
          title: "Auf eine Zielzeit trainieren",
          description:
            "Nutze aktuelle Fitness und Wettkampfdatum für ein konkretes Zielergebnis.",
        },
      ],
    },
  },
  fr: {
    "10k": {
      title: "Choisir le bon plan 10 km",
      subtitle:
        "Partez de votre base actuelle et de votre objectif, pas du programme qui semble le plus rapide.",
      options: [
        {
          label: "Finir",
          title: "Premier 10 km",
          description:
            "Dix semaines, trois sorties par semaine et aucun travail au seuil obligatoire.",
        },
        {
          label: "Progresser",
          title: "Courir un 10 km plus vite",
          description:
            "Ajoutez des séances de qualité reproductibles une fois le premier 10 km bouclé avec aisance.",
        },
        {
          label: "Objectif chrono",
          title: "Viser un temps précis",
          description:
            "Appuyez-vous sur un résultat récent et la date de course pour fixer une cible précise.",
        },
      ],
    },
    "half-marathon": {
      title: "Choisir le bon plan semi-marathon",
      subtitle:
        "Adaptez le plan à votre base en sortie longue et à votre objectif : finir ou performer.",
      options: [
        {
          label: "Finir",
          title: "Premier semi-marathon",
          description:
            "Quatorze semaines avec quatre sorties par semaine et une sortie longue progressive.",
        },
        {
          label: "Progresser",
          title: "Améliorer votre semi-marathon",
          description:
            "Construisez une qualité durable une fois la distance bien assimilée.",
        },
        {
          label: "Objectif chrono",
          title: "Viser un temps précis",
          description:
            "Transformez un résultat de course récent en objectif précis pour le jour J.",
        },
      ],
    },
    marathon: {
      title: "Choisir le bon plan marathon",
      subtitle:
        "Votre base en sortie longue et votre objectif déterminent s'il vaut mieux finir, progresser ou viser un chrono.",
      options: [
        {
          label: "Finir",
          title: "Premier marathon",
          description:
            "Dix-huit semaines, quatre sorties par semaine et un affûtage protégé de trois semaines.",
        },
        {
          label: "Progresser",
          title: "Améliorer votre marathon",
          description:
            "Ajoutez de la qualité contrôlée une fois l'entraînement marathon devenu répétable.",
        },
        {
          label: "Objectif chrono",
          title: "Viser un temps précis",
          description:
            "Utilisez votre forme actuelle et la date de course pour viser un chrono précis.",
        },
      ],
    },
  },
  es: {
    "10k": {
      title: "Elige el plan de 10K adecuado",
      subtitle:
        "Empieza por tu base actual y tu objetivo, no por el calendario que parezca más rápido.",
      options: [
        {
          label: "Terminar",
          title: "Primer 10K",
          description:
            "Diez semanas, tres carreras por semana y sin trabajo obligatorio de umbral.",
        },
        {
          label: "Mejorar",
          title: "Correr un 10K más rápido",
          description:
            "Añade sesiones de calidad repetibles cuando ya completes la distancia con soltura.",
        },
        {
          label: "Objetivo",
          title: "Entrenar para una marca",
          description:
            "Usa una marca reciente y la fecha de la carrera para fijar un objetivo concreto.",
        },
      ],
    },
    "half-marathon": {
      title: "Elige el plan de media maratón adecuado",
      subtitle:
        "Ajusta el plan a tu base actual de tirada larga y a si buscas terminar o competir.",
      options: [
        {
          label: "Terminar",
          title: "Primera media maratón",
          description:
            "Catorce semanas con cuatro carreras por semana y una tirada larga progresiva.",
        },
        {
          label: "Mejorar",
          title: "Mejorar tu media maratón",
          description:
            "Desarrolla calidad sostenible una vez que la distancia te resulte familiar.",
        },
        {
          label: "Objetivo",
          title: "Entrenar para una marca",
          description:
            "Convierte un resultado reciente en un objetivo concreto para el día de la carrera.",
        },
      ],
    },
    marathon: {
      title: "Elige el plan de maratón adecuado",
      subtitle:
        "Tu base de tirada larga y tu meta deciden si conviene terminar, mejorar o ir a por una marca.",
      options: [
        {
          label: "Terminar",
          title: "Primera maratón",
          description:
            "Dieciocho semanas, cuatro carreras por semana y un tapering protegido de tres semanas.",
        },
        {
          label: "Mejorar",
          title: "Mejorar tu maratón",
          description:
            "Añade calidad controlada cuando el entrenamiento de maratón ya sea repetible.",
        },
        {
          label: "Objetivo",
          title: "Entrenar para una marca",
          description:
            "Usa tu forma actual y la fecha de la carrera para perseguir un resultado específico.",
        },
      ],
    },
  },
  it: {
    "10k": {
      title: "Scegli il piano 10 km giusto",
      subtitle:
        "Parti dalla tua base attuale e dal tuo obiettivo, non dal programma che sembra più veloce.",
      options: [
        {
          label: "Finire",
          title: "Primi 10 km",
          description:
            "Dieci settimane, tre corse a settimana e nessun lavoro di soglia obbligatorio.",
        },
        {
          label: "Migliorare",
          title: "Correre 10 km più veloci",
          description:
            "Aggiungi lavori di qualità ripetibili dopo aver completato la distanza con sicurezza.",
        },
        {
          label: "Obiettivo tempo",
          title: "Allenarsi per un tempo obiettivo",
          description:
            "Usa un risultato recente e la data della gara per fissare un traguardo preciso.",
        },
      ],
    },
    "half-marathon": {
      title: "Scegli il piano mezza maratona giusto",
      subtitle:
        "Abbina il piano alla tua base di lungo attuale e al tuo obiettivo: finire o migliorare il tempo.",
      options: [
        {
          label: "Finire",
          title: "Prima mezza maratona",
          description:
            "Quattordici settimane con quattro corse a settimana e un lungo progressivo.",
        },
        {
          label: "Migliorare",
          title: "Migliorare la mezza maratona",
          description:
            "Costruisci qualità sostenibile dopo aver preso confidenza con la distanza.",
        },
        {
          label: "Obiettivo tempo",
          title: "Allenarsi per un tempo obiettivo",
          description:
            "Trasforma una gara recente in un obiettivo specifico per il giorno della gara.",
        },
      ],
    },
    marathon: {
      title: "Scegli il piano maratona giusto",
      subtitle:
        "La tua base di lungo e l'obiettivo di gara decidono se puntare a finire, migliorare o centrare un tempo.",
      options: [
        {
          label: "Finire",
          title: "Prima maratona",
          description:
            "Diciotto settimane, quattro corse a settimana e uno scarico protetto di tre settimane.",
        },
        {
          label: "Migliorare",
          title: "Migliorare la maratona",
          description:
            "Aggiungi qualità controllata dopo che l'allenamento per la maratona è diventato ripetibile.",
        },
        {
          label: "Obiettivo tempo",
          title: "Allenarsi per un tempo obiettivo",
          description:
            "Usa la condizione attuale e la data della gara per puntare a un risultato concreto.",
        },
      ],
    },
  },
  "pt-BR": {
    "10k": {
      title: "Escolha o plano de 10 km certo",
      subtitle:
        "Comece pela sua base atual de corrida e pelo seu objetivo, não pela planilha que parece mais rápida.",
      options: [
        {
          label: "Completar",
          title: "Primeiros 10 km",
          description:
            "Dez semanas, três corridas por semana e sem treino obrigatório de limiar.",
        },
        {
          label: "Evoluir",
          title: "Correr 10 km mais rápido",
          description:
            "Adicione treinos de qualidade repetíveis depois de completar a distância com conforto.",
        },
        {
          label: "Meta de tempo",
          title: "Treinar para um tempo-alvo",
          description:
            "Use um resultado recente e a data da prova para definir uma meta específica.",
        },
      ],
    },
    "half-marathon": {
      title: "Escolha o plano de meia maratona certo",
      subtitle:
        "Alinhe o plano à sua base atual de longão e ao objetivo de completar ou baixar tempo.",
      options: [
        {
          label: "Completar",
          title: "Primeira meia maratona",
          description:
            "Quatorze semanas com quatro corridas por semana e um longão progressivo.",
        },
        {
          label: "Evoluir",
          title: "Melhorar sua meia maratona",
          description:
            "Construa qualidade sustentável depois que a distância já for familiar.",
        },
        {
          label: "Meta de tempo",
          title: "Treinar para um tempo-alvo",
          description:
            "Transforme um resultado recente em uma meta específica para o dia da prova.",
        },
      ],
    },
    marathon: {
      title: "Escolha o plano de maratona certo",
      subtitle:
        "Sua base de longão e seu objetivo de prova definem se você deve completar, evoluir ou buscar um tempo.",
      options: [
        {
          label: "Completar",
          title: "Primeira maratona",
          description:
            "Dezoito semanas, quatro corridas por semana e um polimento protegido de três semanas.",
        },
        {
          label: "Evoluir",
          title: "Melhorar sua maratona",
          description:
            "Adicione qualidade controlada depois que o treino de maratona já for repetível.",
        },
        {
          label: "Meta de tempo",
          title: "Treinar para um tempo-alvo",
          description:
            "Use o condicionamento atual e a data da prova para buscar um resultado específico.",
        },
      ],
    },
  },
};

function createRaceDistancePlanChooser(
  lang: string,
  distance: RaceDistance,
): NonNullable<RunningPlan["planChooser"]> {
  const copy = raceDistanceChooserCopy[planCopyLocale(lang)][distance];
  const basePath =
    distance === "10k"
      ? "/10k-training-plan"
      : distance === "half-marathon"
        ? "/half-marathon-training-plan"
        : "/marathon-training-plan";
  const hrefs = [null, `${basePath}/improve`, `${basePath}/target`] as const;

  return {
    title: copy.title,
    subtitle: copy.subtitle,
    options: copy.options.map((option, index) => ({
      ...option,
      href: hrefs[index] ?? null,
    })),
  };
}

const fiveKHubRelatedLinksByLocale: Record<
  PlanCopyLocale,
  [string, string, string]
> = {
  en: [
    "Explore the 5K training plan hub",
    "/5k-training-plan",
    "Compare run-walk, first-finish, and intermediate 5K plans.",
  ],
  zh: [
    "查看 5 公里训练计划主页",
    "/5k-training-plan",
    "比较从零跑走、完赛与进阶提速三种 5 公里计划。",
  ],
  "zh-hant": [
    "查看 5K 訓練計畫主頁",
    "/5k-training-plan",
    "比較從零跑走、完賽與進階提速三種 5K 計畫。",
  ],
  ja: [
    "5Kプランのメインページを見る",
    "/5k-training-plan",
    "ラン・ウォーク、完走、中級の3つの5Kプランを比較します。",
  ],
  ko: [
    "5K 훈련 플랜 허브 살펴보기",
    "/5k-training-plan",
    "런-워크, 첫 완주, 중급 5K 플랜을 비교해 보세요.",
  ],
  de: [
    "Zur 5-km-Trainingsplan-Übersicht",
    "/5k-training-plan",
    "Vergleiche Lauf-Geh-, Einsteiger- und Fortgeschrittenen-Pläne für 5 km.",
  ],
  fr: [
    "Explorer le hub des plans 5 km",
    "/5k-training-plan",
    "Comparez les plans 5 km course-marche, premier finish et intermédiaire.",
  ],
  es: [
    "Explorar la guía de planes de 5K",
    "/5k-training-plan",
    "Compara los planes de 5K de correr-caminar, primer objetivo e intermedio.",
  ],
  it: [
    "Esplora l'hub dei piani 5 km",
    "/5k-training-plan",
    "Confronta i piani 5 km corsa-camminata, primo traguardo e intermedio.",
  ],
  "pt-BR": [
    "Explorar o hub de planos de 5 km",
    "/5k-training-plan",
    "Compare os planos de 5 km corrida-caminhada, primeira conclusão e intermediário.",
  ],
};

function fiveKHubRelatedLink(
  lang: string,
  variant: Exclude<FiveKChooserVariant, "finish">,
): Array<[string, string, string]> {
  const locale = planCopyLocale(lang);
  if (variant === "couch") {
    return [fiveKHubRelatedLinksByLocale[locale]];
  }
  return [];
}

const productLoopRelatedLinksByLocale: Record<
  PlanCopyLocale,
  Array<[string, string, string]>
> = {
  en: [
    [
      "Use AI to adjust training load in your plan",
      "/ai-training-plan",
      "Draft confirmable changes from completed runs and load, not a fixed calendar.",
    ],
    [
      "Calculate VDOT training paces",
      "/vdot-calculator",
      "Use a recent result as a verifiable pace anchor.",
    ],
    [
      "Calculate running pace from time and distance",
      "/running-pace-calculator",
      "Convert pace, time, and distance, or build an even-split chart from 5K to marathon.",
    ],
    [
      "Predict race finish times from a recent result",
      "/race-time-predictor",
      "Turn a recent race or known pace into 5K, 10K, half, and marathon finish-time estimates.",
    ],
    [
      "Manage training load in your plan",
      "/training-load",
      "Check CTL, ATL, and TSB before adding volume or intensity.",
    ],
  ],
  zh: [
    [
      "用 AI 教练按训练负荷调整计划",
      "/ai-training-plan",
      "根据完成训练和负荷生成可确认的调整草案，而不是沿用固定日历。",
    ],
    [
      "用 VDOT 计算训练配速",
      "/vdot-calculator",
      "用近期成绩建立可验证的配速锚点。",
    ],
    [
      "用时间和距离计算跑步配速",
      "/running-pace-calculator",
      "换算配速、用时和距离，或生成 5 公里到马拉松的均匀分段表。",
    ],
    [
      "用近期成绩预测完赛时间",
      "/race-time-predictor",
      "从一场近期比赛或已知配速预测 5 公里、10 公里、半马和全马完赛时间。",
    ],
    [
      "在计划里管理训练负荷",
      "/training-load",
      "在增加跑量或强度前，先查看 CTL、ATL 和 TSB。",
    ],
  ],
  "zh-hant": [
    [
      "用 AI 教練依訓練負荷調整計畫",
      "/ai-training-plan",
      "根據完成訓練和負荷產生可確認的調整草案，而不是沿用固定日曆。",
    ],
    [
      "用 VDOT 計算訓練配速",
      "/vdot-calculator",
      "用近期成績建立可驗證的配速基準。",
    ],
    [
      "用時間和距離計算跑步配速",
      "/running-pace-calculator",
      "換算配速、時間和距離，或產生 5 公里到馬拉松的均勻分段表。",
    ],
    [
      "用近期成績預測完賽時間",
      "/race-time-predictor",
      "從一場近期比賽或已知配速預測 5 公里、10 公里、半馬和全馬完賽時間。",
    ],
    [
      "在計畫裡管理訓練負荷",
      "/training-load",
      "在增加跑量或強度前，先查看 CTL、ATL 和 TSB。",
    ],
  ],
  ja: [
    [
      "AIコーチで負荷に合わせて計画を調整",
      "/ai-training-plan",
      "完了した練習と負荷から確認可能な変更案を作り、固定カレンダーのままにしません。",
    ],
    [
      "VDOTでトレーニングペースを確認",
      "/vdot-calculator",
      "最近の記録を、制御されたトレーニングペースの参考にします。",
    ],
    [
      "タイムと距離からランニングペースを計算",
      "/running-pace-calculator",
      "ペース、タイム、距離を換算し、5Kからマラソンまでの等分割表を作ります。",
    ],
    [
      "最近の記録からレースタイムを予測する",
      "/race-time-predictor",
      "直近のレースまたは既知ペースから 5K・10K・ハーフ・マラソンの完走タイムを予測します。",
    ],
    [
      "計画内でトレーニング負荷を管理する",
      "/training-load",
      "走行量や強度を増やす前に、CTL、ATL、TSBを確認します。",
    ],
  ],
  ko: [
    [
      "AI 코치로 훈련 부하에 맞춰 플랜 조정하기",
      "/ai-training-plan",
      "고정된 달력 대신 완료한 러닝과 훈련 부하를 바탕으로 확인 가능한 변경안을 만듭니다.",
    ],
    [
      "VDOT 훈련 페이스 계산하기",
      "/vdot-calculator",
      "최근 기록을 검증 가능한 페이스 기준으로 활용하세요.",
    ],
    [
      "시간과 거리로 러닝 페이스 계산하기",
      "/running-pace-calculator",
      "페이스, 시간, 거리를 환산하거나 5K부터 마라톤까지 이븐 스플릿 표를 만들어 보세요.",
    ],
    [
      "최근 기록으로 레이스 완주 시간 예측하기",
      "/race-time-predictor",
      "최근 대회 기록이나 알고 있는 페이스로 5K, 10K, 하프, 풀 마라톤 예상 기록을 계산합니다.",
    ],
    [
      "플랜 안에서 훈련 부하 관리하기",
      "/training-load",
      "볼륨이나 강도를 높이기 전에 CTL, ATL, TSB를 먼저 확인하세요.",
    ],
  ],
  de: [
    [
      "Trainingsbelastung im Plan mit dem KI-Coach anpassen",
      "/ai-training-plan",
      "Erstellt prüfbare Planänderungen aus absolvierten Läufen und Belastung statt eines starren Kalenders.",
    ],
    [
      "VDOT-Trainingstempi berechnen",
      "/vdot-calculator",
      "Nutze ein aktuelles Ergebnis als nachvollziehbaren Pace-Anker.",
    ],
    [
      "Lauftempo aus Zeit und Distanz berechnen",
      "/running-pace-calculator",
      "Rechne Pace, Zeit und Distanz um oder erstelle gleichmäßige Split-Tabellen von 5 km bis Marathon.",
    ],
    [
      "Wettkampfzeiten aus einem aktuellen Ergebnis prognostizieren",
      "/race-time-predictor",
      "Leite aus einem aktuellen Wettkampf oder bekannten Tempo Zielzeiten für 5 km, 10 km, Halbmarathon und Marathon ab.",
    ],
    [
      "Trainingsbelastung im Plan steuern",
      "/training-load",
      "Prüfe CTL, ATL und TSB, bevor du Umfang oder Intensität steigerst.",
    ],
  ],
  fr: [
    [
      "Ajuster la charge d'entraînement avec le Coach IA",
      "/ai-training-plan",
      "Préparez des ajustements vérifiables à partir des sorties réalisées et de la charge, plutôt qu'un calendrier figé.",
    ],
    [
      "Calculer vos allures d'entraînement VDOT",
      "/vdot-calculator",
      "Utilisez un résultat récent comme repère d'allure vérifiable.",
    ],
    [
      "Calculer votre allure à partir du temps et de la distance",
      "/running-pace-calculator",
      "Convertissez allure, temps et distance, ou créez un tableau de temps de passage réguliers du 5 km au marathon.",
    ],
    [
      "Prédire vos chronos de course à partir d'un résultat récent",
      "/race-time-predictor",
      "Estimez vos temps sur 5 km, 10 km, semi-marathon et marathon à partir d'une course récente ou d'une allure connue.",
    ],
    [
      "Gérer la charge d'entraînement dans votre plan",
      "/training-load",
      "Vérifiez CTL, ATL et TSB avant d'augmenter le volume ou l'intensité.",
    ],
  ],
  es: [
    [
      "Ajusta la carga de entrenamiento con el Entrenador con IA",
      "/ai-training-plan",
      "Genera cambios confirmables a partir de tus sesiones completadas y tu carga, en lugar de seguir un calendario fijo.",
    ],
    [
      "Calcula tus ritmos de entrenamiento con VDOT",
      "/vdot-calculator",
      "Usa una marca reciente como referencia verificable de ritmo.",
    ],
    [
      "Calcula tu ritmo de carrera con tiempo y distancia",
      "/running-pace-calculator",
      "Convierte ritmo, tiempo y distancia, o crea una tabla de parciales uniformes de 5K a maratón.",
    ],
    [
      "Predice tus tiempos de carrera desde una marca reciente",
      "/race-time-predictor",
      "Convierte una carrera reciente o un ritmo conocido en estimaciones para 5K, 10K, media maratón y maratón.",
    ],
    [
      "Gestiona la carga de entrenamiento en tu plan",
      "/training-load",
      "Revisa CTL, ATL y TSB antes de aumentar el volumen o la intensidad.",
    ],
  ],
  it: [
    [
      "Adatta il carico di allenamento nel piano con il Coach AI",
      "/ai-training-plan",
      "Prepara modifiche confermabili in base alle corse completate e al carico, non a un calendario fisso.",
    ],
    [
      "Calcola i ritmi di allenamento VDOT",
      "/vdot-calculator",
      "Usa un risultato recente come riferimento verificabile per i ritmi.",
    ],
    [
      "Calcola il passo di corsa da tempo e distanza",
      "/running-pace-calculator",
      "Converti passo, tempo e distanza oppure crea una tabella di passaggi regolari dai 5 km alla maratona.",
    ],
    [
      "Prevedi i tempi di gara da un risultato recente",
      "/race-time-predictor",
      "Trasforma una gara recente o un passo noto in stime per 5 km, 10 km, mezza maratona e maratona.",
    ],
    [
      "Gestisci il carico di allenamento nel tuo piano",
      "/training-load",
      "Controlla CTL, ATL e TSB prima di aumentare volume o intensità.",
    ],
  ],
  "pt-BR": [
    [
      "Ajuste a carga de treino no plano com o Treinador de IA",
      "/ai-training-plan",
      "Gere ajustes confirmáveis com base nas corridas concluídas e na carga, em vez de seguir um calendário fixo.",
    ],
    [
      "Calcule ritmos de treino com VDOT",
      "/vdot-calculator",
      "Use um resultado recente como referência verificável de ritmo.",
    ],
    [
      "Calcule o ritmo de corrida por tempo e distância",
      "/running-pace-calculator",
      "Converta ritmo, tempo e distância, ou monte uma tabela de parciais regulares de 5 km à maratona.",
    ],
    [
      "Preveja tempos de prova a partir de um resultado recente",
      "/race-time-predictor",
      "Transforme uma prova recente ou ritmo conhecido em estimativas para 5 km, 10 km, meia maratona e maratona.",
    ],
    [
      "Gerencie a carga de treino no seu plano",
      "/training-load",
      "Verifique CTL, ATL e TSB antes de aumentar volume ou intensidade.",
    ],
  ],
};

/** Action links that keep distance hubs inside the product loop. */
export function productLoopRelatedLinks(
  lang: string,
): Array<[string, string, string]> {
  return productLoopRelatedLinksByLocale[planCopyLocale(lang)];
}

function mergeRelatedLinks(
  existing: Array<[string, string, string]> | undefined,
  extras: Array<[string, string, string]>,
) {
  const merged = [...(existing ?? [])];
  const seen = new Set(merged.map(([, href]) => href));
  for (const link of extras) {
    if (seen.has(link[1])) continue;
    merged.push(link);
    seen.add(link[1]);
  }
  return merged;
}

const fiveKCopy: Record<string, Partial<RunningPlan>> = {
  en: {
    weeks: "8 weeks",
    level: "Beginner to intermediate",
    weeklyVolume: "4 runs/week",
    metaTitle: "Free 8-Week 5K Training Plan for Beginners",
    metaDescription:
      "Free 8-week 5K training plan for runners who can already run 20–30 minutes. Four runs a week, easy volume, one steady session, and a short taper.",
    keywords: [
      "5k training plan",
      "5k running plan",
      "5k training schedule",
      "beginner 5k training plan",
      "8 week 5k plan",
    ],
    eyebrow: "8-week 5K running plan",
    title: "5K training plan: free 8-week beginner schedule",
    subtitle:
      "This 5K plan is for runners who can already complete 20 to 30 minutes of easy running and want a clear race schedule. It combines conversational runs, one controlled quality session, a weekly long run, recovery, and a short taper before race day.",
    primaryCta: "Personalize my 5K plan",
    secondaryCta: "Browse all plans",
    promise:
      "The full schedule is free below. Personalize it when your available days, recent training, pace, or recovery make a generic calendar a poor fit.",
    planChooser: {
      title: "Choose the right 5K plan",
      subtitle:
        "Start with the plan that matches what you can run today. Each option has a different starting point and training load.",
      options: [
        {
          label: "Starting from zero",
          title: "Couch to 5K",
          description:
            "Use a run-walk progression if 20 minutes of continuous easy running is not comfortable yet.",
          href: "/couch-to-5k-training-plan",
        },
        {
          label: "Current plan",
          title: "Finish a 5K",
          description:
            "Choose this 8-week plan if you can already run easily for 20–30 minutes and can train four days a week.",
          href: null,
        },
        {
          label: "Already racing",
          title: "Run a faster 5K",
          description:
            "Use the intermediate plan when you have a recent 5K result and want structured intervals and tempo work.",
          href: "/5k-training-plan/intermediate",
        },
      ],
    },
    trustItems: [
      "Full schedule free",
      "8 weeks",
      "4 runs per week",
      "20–30 minute running base",
    ],
    forTitle: "Who this 5K training plan is for",
    forItems: [
      "You can run easily for 20 to 30 minutes without needing a run-walk progression.",
      "You want to finish a first 5K confidently or improve a recent 5K without training every run hard.",
      "You can protect four running days per week, including one quality session and one longer easy run.",
      "You are not currently managing pain, illness, or an injury that changes your running form.",
    ],
    previewTitle: "How the 8-week 5K plan progresses",
    previewSubtitle:
      "The plan builds from repeatable easy running to 5K-specific work, then reduces fatigue before race day. The complete day-by-day schedule follows below.",
    previewRows: [
      [
        "Weeks 1-2",
        "Establish the rhythm",
        "Keep most running easy and introduce relaxed strides or short hills.",
      ],
      [
        "Weeks 3-6",
        "Build 5K strength",
        "Alternate controlled intervals and tempo work while the long run grows gradually.",
      ],
      [
        "Weeks 7-8",
        "Taper and race",
        "Reduce volume, keep a little speed, and arrive at the 5K fresh.",
      ],
    ],
    contentTitle: "What makes this a practical 5K plan",
    contentSubtitle:
      "A useful 5K schedule separates easy volume from quality work, gives each session a purpose, and leaves enough recovery to repeat the week consistently.",
    contentSections: [
      [
        "Easy volume",
        "Easy runs build consistency without turning every day into a test.",
        [
          "Use conversational effort",
          "Slow down for heat and hills",
          "Keep recovery days intact",
        ],
      ],
      [
        "One quality session",
        "Intervals, hills, or tempo running develop 5K-specific speed without dominating the week.",
        [
          "Run repetitions with control",
          "Stop before form deteriorates",
          "Do not replace missed easy runs with intensity",
        ],
      ],
      [
        "Long run and taper",
        "A modest long run supports endurance; the final week cuts fatigue while preserving rhythm.",
        [
          "Keep the long run easy",
          "Reduce volume before race day",
          "Avoid last-minute fitness tests",
        ],
      ],
    ],
    conversionTitle: "Turn the free 5K schedule into your calendar",
    conversionText:
      "Choose your race date, available days, current pace, and recent training. Trainingload.ai can draft the schedule around those constraints and keep later changes reviewable before they reach your calendar.",
    aiTitle: "How Trainingload.ai personalizes a 5K plan",
    aiSubtitle:
      "The public schedule answers what to do. Personalization decides where sessions fit, which pace anchors apply, and whether completed runs support building, holding, or recovering.",
    aiSignals: [
      [
        "Plan versus actual",
        "Compare the intended workout with the run you completed instead of judging pace alone.",
      ],
      [
        "Training load",
        "Review recent load and recovery before increasing volume or adding another hard session.",
      ],
      [
        "Confirmed changes",
        "AI drafts a change; you or your coach confirms it before the calendar is updated.",
      ],
    ],
    relatedTitle: "Continue your running plan",
    relatedLinks: [
      [
        "Starting from zero? Use Couch to 5K",
        "/couch-to-5k-training-plan",
        "Use a run-walk progression if 20 minutes of continuous easy running is not yet comfortable.",
      ],
      [
        "Build from 5K to 10K",
        "/10k-training-plan",
        "Extend endurance and threshold work with the complete 10K schedule.",
      ],
      [
        "Set training paces with VDOT",
        "/vdot-calculator",
        "Use a recent performance as one reference for controlled training paces.",
      ],
    ],
    faq: [
      [
        "How long should I train for a 5K?",
        "This schedule uses eight weeks. Runners with less base fitness may need longer; runners already training consistently may enter later only after reviewing the workload.",
      ],
      [
        "How many days per week should I run?",
        "The plan uses four running days. Keep the easy days easy and preserve rest or strength days between harder sessions.",
      ],
      [
        "Is this a beginner 5K plan?",
        "Yes, for a beginner who can already run easily for 20 to 30 minutes. Complete non-runners should use the separate Couch to 5K plan.",
      ],
      [
        "What if I miss a workout?",
        "Skip it or move it only when recovery remains protected. Do not stack two quality sessions or cram missed mileage into the weekend.",
      ],
      [
        "Can AI change the plan automatically?",
        "Trainingload.ai can draft adjustments from completed runs and training load, but the calendar updates only after you confirm.",
      ],
    ],
  },
  zh: {
    weeks: "8 周",
    level: "新手到进阶",
    weeklyVolume: "每周 4 次跑步",
    metaTitle: "免费 8 周 5 公里训练计划：新手完赛安排",
    metaDescription:
      "给已能连续跑 20–30 分钟的跑者：免费 8 周 5 公里训练计划，每周 4 跑，含轻松跑、受控稳定跑、长跑和赛前减量。",
    keywords: [
      "5 公里训练计划",
      "5k training plan",
      "5 公里跑步计划",
      "5 公里训练安排",
      "8 周 5 公里计划",
    ],
    eyebrow: "8 周 5 公里跑步计划",
    title: "免费 8 周 5 公里训练计划：面向新手完赛。",
    subtitle:
      "这份 5 公里计划适合已经能轻松连续跑 20-30 分钟、希望有明确备赛安排的跑者。计划结合可对话强度的轻松跑、每周一次可控质量课、一次长距离、恢复和赛前短减量。",
    primaryCta: "个性化我的 5 公里计划",
    secondaryCta: "浏览全部计划",
    promise:
      "下方完整训练安排免费公开。当可训练日期、近期训练、配速或恢复情况让通用日历不再合适时，再进行个性化。",
    planChooser: {
      title: "选择适合你的 5 公里计划",
      subtitle:
        "按照你现在能完成的跑步能力选择起点。三种计划的起步要求和训练负荷不同。",
      options: [
        {
          label: "从零开始",
          title: "Couch to 5K",
          description: "如果连续轻松跑 20 分钟仍不舒服，先从跑走交替计划开始。",
          href: "/couch-to-5k-training-plan",
        },
        {
          label: "当前计划",
          title: "完成一次 5 公里",
          description:
            "如果你已经能轻松连续跑 20–30 分钟，并能每周安排四次跑步，选择这份 8 周计划。",
          href: null,
        },
        {
          label: "已有比赛基础",
          title: "提高 5 公里成绩",
          description:
            "如果已有近期 5 公里成绩，并希望系统加入间歇和节奏跑，选择进阶计划。",
          href: "/5k-training-plan/intermediate",
        },
      ],
    },
    trustItems: ["完整课表免费", "8 周", "每周 4 跑", "需连续跑 20–30 分钟"],
    forTitle: "这份 5 公里训练计划适合谁",
    forItems: [
      "你已经能轻松连续跑 20-30 分钟，不再需要跑走交替入门。",
      "你希望稳妥完成第一次 5 公里，或提升近期 5 公里成绩，而不是每次都跑到很累。",
      "你每周可以保留 4 个跑步日，包括一次质量课和一次较长轻松跑。",
      "你目前没有会改变跑姿的疼痛、疾病或伤病。",
    ],
    previewTitle: "8 周 5 公里计划如何推进",
    previewSubtitle:
      "计划从可重复的轻松跑逐步进入 5 公里专项训练，再在比赛前降低疲劳。下方提供完整逐日安排。",
    previewRows: [
      ["第 1-2 周", "建立节奏", "保持大部分训练轻松，加入放松加速跑或短上坡。"],
      [
        "第 3-6 周",
        "构建 5 公里能力",
        "交替进行可控间歇和节奏跑，长距离逐步增加。",
      ],
      [
        "第 7-8 周",
        "减量与比赛",
        "降低总量、保留少量速度，让身体清爽地进入比赛。",
      ],
    ],
    contentTitle: "一份实用 5 公里计划需要什么",
    contentSubtitle:
      "训练安排应把轻松跑量与质量课分开，让每次训练都有目的，并留下足够恢复来稳定重复。",
    contentSections: [
      [
        "轻松跑量",
        "轻松跑建立一致性，不把每一天都变成测试。",
        ["保持能对话的强度", "炎热和上坡时主动降速", "保留恢复日"],
      ],
      [
        "每周一次质量课",
        "间歇、上坡或节奏跑发展 5 公里专项速度，但不主导整周。",
        [
          "可控地完成重复跑",
          "动作开始变形前停止",
          "不要用强度补偿错过的轻松跑",
        ],
      ],
      [
        "长距离与减量",
        "适度长距离支持耐力；最后一周降低疲劳同时保留节奏。",
        ["长距离保持轻松", "比赛前降低总量", "避免临时测试体能"],
      ],
    ],
    conversionTitle: "把免费 5 公里安排放进你的日历",
    conversionText:
      "选择比赛日期、可训练日、当前配速和近期训练。Trainingload.ai 可以围绕这些限制生成草案，并让后续变化在进入日历前保持可审阅。",
    aiTitle: "Trainingload.ai 如何个性化 5 公里计划",
    aiSubtitle:
      "公开计划回答练什么；个性化决定训练放在哪一天、使用什么配速锚点，以及完成训练后该构建、维持还是恢复。",
    aiSignals: [
      ["计划与实际", "比较计划 workout 与真实完成情况，而不是只看配速。"],
      ["训练负荷", "增加跑量或加入更多强度前，先查看近期负荷和恢复。"],
      ["确认后调整", "智能教练生成调整草案；你或教练确认后才更新日历。"],
    ],
    relatedTitle: "继续选择跑步计划",
    relatedLinks: [
      [
        "从零开始？使用 Couch to 5K",
        "/couch-to-5k-training-plan",
        "如果连续轻松跑 20 分钟仍不舒适，先使用跑走交替计划。",
      ],
      [
        "从 5 公里进阶到 10 公里",
        "/10k-training-plan",
        "通过完整 10 公里计划延长耐力并发展阈值能力。",
      ],
      [
        "使用 VDOT 参考训练配速",
        "/vdot-calculator",
        "用近期表现作为可控训练配速的一个参考。",
      ],
    ],
    faq: [
      [
        "5 公里应该训练多久？",
        "本计划为 8 周。基础较少的跑者可能需要更久；已经稳定训练的跑者也应先核对负荷再决定是否从中段开始。",
      ],
      [
        "每周应该跑几天？",
        "计划使用每周 4 个跑步日。轻松日必须轻松，并在质量课之间保留休息或力量训练日。",
      ],
      [
        "这是新手 5 公里计划吗？",
        "是，但适合已经能轻松连续跑 20-30 分钟的新手。完全没有跑步基础的人应使用独立 Couch to 5K 计划。",
      ],
      [
        "错过训练怎么办？",
        "可以跳过，或只在仍能保护恢复时移动。不要连续堆叠两次质量课，也不要把漏掉的跑量塞进周末。",
      ],
      [
        "智能教练会自动改计划吗？",
        "Trainingload.ai 可以根据完成训练和负荷背景生成调整草案，但更新日历前仍需确认。",
      ],
    ],
  },
};

fiveKCopy["zh-hant"] = {
  ...fiveKCopy.zh,
  weeks: "8 週",
  level: "新手到進階",
  weeklyVolume: "每週 4 次跑步",
  metaTitle: "免費 8 週 5 公里訓練計畫：新手完賽安排",
  metaDescription:
    "給已能連續跑 20–30 分鐘的跑者：免費 8 週 5 公里訓練計畫，每週 4 跑，含輕鬆跑、受控穩定跑、長跑和賽前減量。",
  keywords: [
    "5 公里訓練計畫",
    "5k training plan",
    "5 公里跑步計畫",
    "5 公里訓練安排",
    "8 週 5 公里計畫",
  ],
  eyebrow: "8 週 5 公里跑步計畫",
  title: "免費 8 週 5 公里訓練計畫：面向新手完賽。",
  subtitle:
    "這份 5 公里計畫適合已經能輕鬆連續跑 20–30 分鐘、希望有明確備賽安排的跑者。計畫結合可對話強度的輕鬆跑、每週一次可控品質課、一次長距離、恢復和賽前短減量。",
  primaryCta: "個人化我的 5 公里計畫",
  secondaryCta: "瀏覽全部計畫",
  promise:
    "下方完整訓練安排免費公開。當可訓練日期、近期訓練、配速或恢復情況讓通用日曆不再合適時，再進行個人化。",
  planChooser: {
    title: "選擇適合你的 5 公里計畫",
    subtitle:
      "按照你現在能完成的跑步能力選擇起點。三種計畫的起步要求和訓練負荷不同。",
    options: [
      {
        label: "從零開始",
        title: "Couch to 5K",
        description: "如果連續輕鬆跑 20 分鐘仍不舒服，先從跑走交替計畫開始。",
        href: "/couch-to-5k-training-plan",
      },
      {
        label: "目前計畫",
        title: "完成一次 5 公里",
        description:
          "如果你已經能輕鬆連續跑 20–30 分鐘，並能每週安排四次跑步，選擇這份 8 週計畫。",
        href: null,
      },
      {
        label: "已有比賽基礎",
        title: "提高 5 公里成績",
        description:
          "如果已有近期 5 公里成績，並希望系統加入間歇和節奏跑，選擇進階計畫。",
        href: "/5k-training-plan/intermediate",
      },
    ],
  },
  trustItems: ["完整課表免費", "8 週", "每週 4 跑", "需連續跑 20–30 分鐘"],
  forTitle: "這份 5 公里訓練計畫適合誰",
  forItems: [
    "你已經能輕鬆連續跑 20–30 分鐘，不再需要跑走交替入門。",
    "你希望穩妥完成第一次 5 公里，或提升近期 5 公里成績，而不是每次都跑到很累。",
    "你每週可以保留 4 個跑步日，包括一次品質課和一次較長輕鬆跑。",
    "你目前沒有會改變跑姿的疼痛、疾病或傷病。",
  ],
  previewTitle: "8 週 5 公里計畫如何推進",
  previewSubtitle:
    "計畫從可重複的輕鬆跑逐步進入 5 公里專項訓練，再在比賽前降低疲勞。下方提供完整逐日安排。",
  previewRows: [
    ["第 1–2 週", "建立節奏", "保持大部分訓練輕鬆，加入放鬆加速跑或短上坡。"],
    [
      "第 3–6 週",
      "建立 5 公里能力",
      "交替進行可控間歇和節奏跑，長距離逐步增加。",
    ],
    [
      "第 7–8 週",
      "減量與比賽",
      "降低總量、保留少量速度，讓身體清爽地進入比賽。",
    ],
  ],
  contentTitle: "一份實用 5 公里計畫需要什麼",
  contentSubtitle:
    "訓練安排應把輕鬆跑量與品質課分開，讓每次訓練都有目的，並留下足夠恢復來穩定重複。",
  contentSections: [
    [
      "輕鬆跑量",
      "輕鬆跑建立一致性，不把每一天都變成測驗。",
      ["保持能對話的強度", "炎熱和上坡時主動降速", "保留恢復日"],
    ],
    [
      "每週一次品質課",
      "間歇、上坡或節奏跑發展 5 公里專項速度，但不主導整週。",
      ["可控地完成重複跑", "動作開始變形前停止", "不要用強度補償錯過的輕鬆跑"],
    ],
    [
      "長距離與減量",
      "適度長距離支援耐力；最後一週降低疲勞同時保留節奏。",
      ["長距離保持輕鬆", "比賽前降低總量", "避免臨時測試體能"],
    ],
  ],
  conversionTitle: "把免費 5 公里安排放進你的日曆",
  conversionText:
    "選擇比賽日期、可訓練日、目前配速和近期訓練。Trainingload.ai 可以依照這些限制產生草案，並讓後續變化在進入日曆前保持可審閱。",
  aiTitle: "Trainingload.ai 如何個人化 5 公里計畫",
  aiSubtitle:
    "公開計畫回答練什麼；個人化決定訓練放在哪一天、使用什麼配速基準，以及完成訓練後該建立、維持還是恢復。",
  aiSignals: [
    ["計畫與實際", "比較計畫訓練與真實完成情況，而不是只看配速。"],
    ["訓練負荷", "增加跑量或加入更多強度前，先查看近期負荷和恢復。"],
    ["確認後調整", "AI 產生調整草案；你或教練確認後才更新日曆。"],
  ],
  relatedTitle: "繼續選擇跑步計畫",
  relatedLinks: [
    [
      "從零開始？使用 Couch to 5K",
      "/couch-to-5k-training-plan",
      "如果連續輕鬆跑 20 分鐘仍不舒服，先使用跑走交替計畫。",
    ],
    [
      "從 5 公里進階到 10 公里",
      "/10k-training-plan",
      "透過完整 10 公里計畫延長耐力並發展閾值能力。",
    ],
    [
      "使用 VDOT 參考訓練配速",
      "/vdot-calculator",
      "用近期表現作為可控訓練配速的一個參考。",
    ],
  ],
  faq: [
    [
      "5 公里應該訓練多久？",
      "本計畫為 8 週。基礎較少的跑者可能需要更久；已經穩定訓練的跑者也應先核對負荷再決定是否從中段開始。",
    ],
    [
      "每週應該跑幾天？",
      "計畫使用每週 4 個跑步日。輕鬆日必須輕鬆，並在品質課之間保留休息或肌力訓練日。",
    ],
    [
      "這是新手 5 公里計畫嗎？",
      "是，但適合已經能輕鬆連續跑 20–30 分鐘的新手。完全沒有跑步基礎的人應使用獨立 Couch to 5K 計畫。",
    ],
    [
      "錯過訓練怎麼辦？",
      "可以跳過，或只在仍能保護恢復時移動。不要連續堆疊兩次品質課，也不要把漏掉的跑量塞進週末。",
    ],
    [
      "AI 會自動改計畫嗎？",
      "Trainingload.ai 可以根據完成訓練和負荷背景產生調整草案，但更新日曆前仍需確認。",
    ],
  ],
};

fiveKCopy.ja = {
  ...fiveKCopy.en,
  weeks: "8週間",
  level: "初心者〜中級者",
  weeklyVolume: "週4回",
  metaTitle: "無料8週間5Kトレーニングプラン：初心者向け",
  metaDescription:
    "20〜30分走れる人向けの無料8週間5Kプラン。週4回、イージー走、ステディ走、ロング走、短いテーパーを含みます。",
  keywords: [
    "5Kトレーニングプラン",
    "5k training plan",
    "5Kランニングプラン",
    "5K練習メニュー",
    "8週間5Kプラン",
  ],
  eyebrow: "8週間5Kランニングプラン",
  title: "初心者向け無料8週間5Kトレーニングプラン。",
  subtitle:
    "この5Kプランは、すでに20〜30分のイージーランを続けられ、明確なレーススケジュールを求めるランナー向けです。会話できるラン、週1回の質の高いセッション、ロングラン、回復、短いテーパーを組み合わせます。",
  primaryCta: "5Kプランを個別化",
  secondaryCta: "すべてのプランを見る",
  promise:
    "完全なスケジュールは以下で無料公開しています。走れる曜日、最近の練習、ペース、回復状態に汎用カレンダーが合わない場合は個別化してください。",
  planChooser: {
    title: "自分に合う5Kプランを選ぶ",
    subtitle:
      "今の走力に合う開始地点を選びます。3つのプランは開始条件とトレーニング負荷が異なります。",
    options: [
      {
        label: "ゼロから始める",
        title: "Couch to 5K",
        description:
          "20分の連続イージーランがまだ難しい場合は、ラン・ウォークから始めます。",
        href: "/couch-to-5k-training-plan",
      },
      {
        label: "現在のプラン",
        title: "5Kを完走する",
        description:
          "20〜30分のイージーランができ、週4回走れる場合は、この8週間プランを選びます。",
        href: null,
      },
      {
        label: "レース経験あり",
        title: "5Kを速く走る",
        description:
          "最近の5K記録があり、インターバルとテンポ走を取り入れたい場合は中級プランを選びます。",
        href: "/5k-training-plan/intermediate",
      },
    ],
  },
  trustItems: [
    "全スケジュール無料",
    "8週間",
    "週4回",
    "20〜30分の連続走が目安",
  ],
  forTitle: "この5Kプランが適している人",
  forItems: [
    "ラン・ウォークではなく、20〜30分のイージーランを続けられる。",
    "すべてのランを追い込まずに、初5K完走または最近の記録更新を目指したい。",
    "質のセッションと長めのイージーランを含む週4日のランを確保できる。",
    "走り方を変える痛み、病気、けがを現在抱えていない。",
  ],
  previewTitle: "8週間5Kプランの進み方",
  previewSubtitle:
    "繰り返せるイージーランから5K特有のトレーニングへ進み、レース前に疲労を減らします。完全な日別予定は以下にあります。",
  previewRows: [
    [
      "1〜2週",
      "リズムを作る",
      "大半をイージーに保ち、リラックスした流しや短い坂を加えます。",
    ],
    [
      "3〜6週",
      "5Kの力を伸ばす",
      "制御したインターバルとテンポを交互に行い、ロングランを少しずつ伸ばします。",
    ],
    [
      "7〜8週",
      "テーパーとレース",
      "走行量を減らし、少しだけスピードを保ってフレッシュに5Kへ臨みます。",
    ],
  ],
  contentTitle: "実用的な5Kプランに必要なこと",
  contentSubtitle:
    "イージーな走行量と質の高い練習を分け、各セッションに目的を持たせ、毎週繰り返せるだけの回復を残します。",
  contentSections: [
    [
      "イージーな走行量",
      "イージーランは毎日をテストにせず、継続性を作ります。",
      ["会話できる強度にする", "暑さや坂ではペースを落とす", "回復日を守る"],
    ],
    [
      "週1回の質の高い練習",
      "インターバル、坂、テンポで5K向けのスピードを伸ばしますが、週全体を支配させません。",
      [
        "余裕を残して反復する",
        "フォームが崩れる前に止める",
        "休んだイージーランを高強度で埋めない",
      ],
    ],
    [
      "ロングランとテーパー",
      "適度なロングランで持久力を支え、最終週はリズムを残しながら疲労を減らします。",
      [
        "ロングランはイージーに",
        "レース前に走行量を減らす",
        "直前の体力テストを避ける",
      ],
    ],
  ],
  conversionTitle: "無料の5Kスケジュールを自分のカレンダーへ",
  conversionText:
    "レース日、走れる曜日、現在のペース、最近の練習を選びます。Trainingload.aiは制約に合わせて下書きを作成し、その後の変更もカレンダーへ反映する前に確認できます。",
  aiTitle: "Trainingload.aiが5Kプランを個別化する方法",
  aiSubtitle:
    "公開スケジュールは何をするかを示します。個別化では曜日、ペースの基準、完了した練習から次に積み上げるか、維持するか、回復するかを決めます。",
  aiSignals: [
    [
      "計画と実績",
      "ペースだけで判断せず、予定した練習と実際に完了した内容を比較します。",
    ],
    [
      "トレーニング負荷",
      "走行量や高強度を増やす前に、最近の負荷と回復を確認します。",
    ],
    [
      "確認できる変更",
      "AIが変更案を作り、本人またはコーチが確認してからカレンダーを更新します。",
    ],
  ],
  relatedTitle: "次のランニングプラン",
  relatedLinks: [
    [
      "ゼロから始めるなら Couch to 5K",
      "/couch-to-5k-training-plan",
      "20分の連続イージーランが難しい場合はラン・ウォークから始めます。",
    ],
    [
      "5Kから10Kへ",
      "/10k-training-plan",
      "完全な10Kスケジュールで持久力と閾値能力を伸ばします。",
    ],
    [
      "VDOTでトレーニングペースを確認",
      "/vdot-calculator",
      "最近の記録を、制御されたトレーニングペースの参考にします。",
    ],
  ],
  faq: [
    [
      "5Kに向けて何週間トレーニングすべきですか？",
      "このスケジュールは8週間です。基礎体力が少ない場合は長めに取り、継続して走っている場合も負荷を確認してから途中参加を判断してください。",
    ],
    [
      "週に何日走りますか？",
      "週4日のランを使います。イージー日はイージーに保ち、質の高い練習の間に休養または筋力トレーニング日を残します。",
    ],
    [
      "初心者向けの5Kプランですか？",
      "はい。ただし20〜30分のイージーランを続けられる初心者向けです。まったく走っていない場合は別のCouch to 5Kプランを使ってください。",
    ],
    [
      "練習を休んだらどうしますか？",
      "そのまま飛ばすか、回復を守れる場合だけ移動します。質の高い練習を連続させたり、休んだ距離を週末に詰め込んだりしないでください。",
    ],
    [
      "AIがプランを自動変更しますか？",
      "Trainingload.aiは完了した練習と負荷から変更案を作れますが、カレンダーを更新する前に確認が必要です。",
    ],
  ],
};

fiveKCopy.ko = {
  ...fiveKCopy.en,
  weeks: "8주",
  level: "초급~중급",
  weeklyVolume: "주 4회 러닝",
  metaTitle: "초보자를 위한 무료 8주 5K 훈련 플랜",
  metaDescription:
    "이미 20–30분 연속으로 달릴 수 있는 러너를 위한 무료 8주 5K 훈련 플랜. 주 4회 러닝, 이지 볼륨, 제어된 스테디 세션 1회, 짧은 테이퍼링으로 구성됩니다.",
  keywords: [
    "5K 훈련 플랜",
    "5k training plan",
    "5K 러닝 플랜",
    "5K 훈련 일정",
    "초보자 5K 훈련 플랜",
    "8주 5K 플랜",
  ],
  eyebrow: "8주 5K 러닝 플랜",
  title: "5K 훈련 플랜: 초보자를 위한 무료 8주 스케줄",
  subtitle:
    "이 5K 플랜은 이미 20~30분 이지 러닝을 무리 없이 소화할 수 있고 명확한 레이스 일정이 필요한 러너를 위한 것입니다. 대화 가능한 이지 러닝, 제어된 퀄리티 세션 1회, 주간 롱런, 회복, 그리고 레이스 전 짧은 테이퍼링을 조합합니다.",
  primaryCta: "내 5K 플랜 개인화하기",
  secondaryCta: "모든 플랜 둘러보기",
  promise:
    "아래에서 전체 일정을 무료로 확인할 수 있습니다. 운동 가능 요일, 최근 훈련, 페이스, 회복 상태 때문에 일반 달력이 잘 맞지 않을 때 개인화해 보세요.",
  planChooser: {
    title: "내게 맞는 5K 플랜 선택하기",
    subtitle:
      "오늘 달릴 수 있는 수준에 맞는 플랜에서 시작하세요. 각 옵션은 시작 기준과 훈련 부하가 다릅니다.",
    options: [
      {
        label: "처음 시작",
        title: "Couch to 5K",
        description:
          "20분 연속 이지 러닝이 아직 부담스럽다면 런-워크 점진 플랜으로 시작하세요.",
        href: "/couch-to-5k-training-plan",
      },
      {
        label: "현재 플랜",
        title: "5K 완주하기",
        description:
          "20–30분 이지 러닝을 편하게 할 수 있고 주 4일 훈련할 수 있다면 이 8주 플랜을 선택하세요.",
        href: null,
      },
      {
        label: "레이스 경험 있음",
        title: "더 빠른 5K 달리기",
        description:
          "최근 5K 기록이 있고 체계적인 인터벌과 템포 러닝을 원한다면 중급 플랜을 사용하세요.",
        href: "/5k-training-plan/intermediate",
      },
    ],
  },
  trustItems: [
    "전체 일정 무료",
    "8주",
    "주 4회 러닝",
    "20–30분 연속 러닝 기반",
  ],
  forTitle: "이 5K 훈련 플랜이 적합한 러너",
  forItems: [
    "런-워크 단계 없이도 20~30분 동안 편하게 달릴 수 있습니다.",
    "매번 강하게 달리지 않고도 첫 5K를 자신 있게 완주하거나 최근 5K 기록을 개선하고 싶습니다.",
    "퀄리티 세션 1회와 조금 더 긴 이지 러닝 1회를 포함해 주 4일 러닝 일정을 지킬 수 있습니다.",
    "현재 러닝 자세를 바꾸는 통증, 질환 또는 부상이 없습니다.",
  ],
  previewTitle: "8주 5K 플랜의 진행 방식",
  previewSubtitle:
    "반복 가능한 이지 러닝에서 5K 특화 훈련으로 발전한 뒤, 레이스 전에 피로를 줄입니다. 전체 일별 일정은 아래에 있습니다.",
  previewRows: [
    [
      "1–2주차",
      "리듬 만들기",
      "대부분의 러닝을 이지 강도로 유지하고 가벼운 스트라이드나 짧은 언덕을 도입합니다.",
    ],
    [
      "3–6주차",
      "5K 근지구력 구축",
      "제어된 인터벌과 템포 훈련을 번갈아 진행하면서 롱런을 점진적으로 늘립니다.",
    ],
    [
      "7–8주차",
      "테이퍼링과 레이스",
      "볼륨을 줄이고 약간의 스피드 감각을 유지해 상쾌한 컨디션으로 5K에 나섭니다.",
    ],
  ],
  contentTitle: "실용적인 5K 플랜의 핵심 요소",
  contentSubtitle:
    "효과적인 5K 일정은 이지 볼륨과 퀄리티 훈련을 구분하고, 각 세션에 분명한 목적을 부여하며, 매주 꾸준히 반복할 수 있을 만큼 회복을 확보합니다.",
  contentSections: [
    [
      "이지 볼륨",
      "이지 러닝은 매일을 테스트로 만들지 않고 꾸준함을 쌓습니다.",
      [
        "대화가 가능한 강도 유지",
        "더위와 오르막에서는 속도 늦추기",
        "회복일을 온전히 지키기",
      ],
    ],
    [
      "주 1회 퀄리티 세션",
      "인터벌, 언덕, 템포 러닝은 한 주 전체를 압도하지 않으면서 5K 특화 스피드를 키웁니다.",
      [
        "제어된 강도로 반복주 수행",
        "자세가 무너지기 전에 멈추기",
        "빠진 이지 러닝을 고강도로 채우지 않기",
      ],
    ],
    [
      "롱런과 테이퍼링",
      "적당한 롱런이 지구력을 뒷받침하고, 마지막 주는 리듬을 유지하면서 피로를 줄입니다.",
      [
        "롱런은 이지 강도로 유지",
        "레이스 전 전체 볼륨 줄이기",
        "막판 체력 테스트 피하기",
      ],
    ],
  ],
  conversionTitle: "무료 5K 일정을 내 캘린더로 옮기기",
  conversionText:
    "대회 날짜, 훈련 가능 요일, 현재 페이스, 최근 훈련을 선택하세요. Trainingload.ai가 이러한 조건에 맞춰 일정을 초안으로 구성하고, 이후 변경 사항도 캘린더에 반영하기 전에 검토할 수 있게 유지합니다.",
  aiTitle: "Trainingload.ai가 5K 플랜을 개인화하는 방법",
  aiSubtitle:
    "공개 일정은 무엇을 할지 알려줍니다. 개인화는 세션을 어느 요일에 배치할지, 어떤 페이스 기준을 적용할지, 완료한 러닝을 바탕으로 증량·유지·회복 중 무엇이 적절한지 결정합니다.",
  aiSignals: [
    [
      "계획 대비 실제",
      "페이스만 보지 않고 계획된 워크아웃과 실제 완료한 러닝을 비교합니다.",
    ],
    [
      "훈련 부하",
      "볼륨을 늘리거나 고강도 세션을 추가하기 전에 최근 부하와 회복을 점검합니다.",
    ],
    [
      "확인 후 변경",
      "AI가 변경안을 작성하면 본인 또는 코치가 확인한 뒤에만 캘린더가 업데이트됩니다.",
    ],
  ],
  relatedTitle: "러닝 플랜 이어서 보기",
  relatedLinks: [
    [
      "처음 시작하나요? Couch to 5K 사용하기",
      "/couch-to-5k-training-plan",
      "20분 연속 이지 러닝이 아직 편하지 않다면 런-워크 점진 플랜을 이용하세요.",
    ],
    [
      "5K에서 10K로 확장하기",
      "/10k-training-plan",
      "전체 10K 일정으로 지구력과 역치 훈련을 확장해 보세요.",
    ],
    [
      "VDOT으로 훈련 페이스 설정하기",
      "/vdot-calculator",
      "최근 기록을 제어된 훈련 페이스의 하나의 기준으로 활용하세요.",
    ],
  ],
  faq: [
    [
      "5K 준비에는 몇 주가 필요한가요?",
      "이 일정은 8주 기준입니다. 기초 체력이 부족하다면 더 긴 기간이 필요할 수 있으며, 이미 꾸준히 훈련 중인 러너라도 훈련 부하를 먼저 검토한 뒤 중반부터 합류해야 합니다.",
    ],
    [
      "일주일에 며칠 달려야 하나요?",
      "주 4일 러닝으로 구성됩니다. 이지 데이는 충분히 쉽게 달리고, 강한 세션 사이에 휴식일이나 근력 훈련일을 유지하세요.",
    ],
    [
      "초보자용 5K 플랜인가요?",
      "네, 이미 20~30분 이지 러닝을 할 수 있는 초보자에게 적합합니다. 전혀 달려본 적 없는 입문자는 별도의 Couch to 5K 플랜을 이용하세요.",
    ],
    [
      "훈련을 하루 빠지면 어떻게 하나요?",
      "회복이 보호되는 경우에만 옮기거나 그냥 건너뛰세요. 퀄리티 세션을 연속으로 붙이거나 빠진 거리를 주말에 몰아서 달리지 마세요.",
    ],
    [
      "AI가 플랜을 자동으로 바꾸나요?",
      "Trainingload.ai는 완료한 러닝과 훈련 부하를 바탕으로 조정안을 작성할 수 있지만, 캘린더는 사용자가 확인한 뒤에만 업데이트됩니다.",
    ],
  ],
};

fiveKCopy.de = {
  ...fiveKCopy.en,
  weeks: "8 Wochen",
  level: "Einsteiger bis Fortgeschrittene",
  weeklyVolume: "4 Läufe/Woche",
  metaTitle: "Kostenloser 8-Wochen-5-km-Trainingsplan für Einsteiger",
  metaDescription:
    "Kostenloser 8-Wochen-5-km-Trainingsplan für Läufer, die bereits 20–30 Minuten am Stück laufen. Vier Läufe pro Woche, lockerer Umfang, eine kontrollierte Einheit und kurzes Tapering.",
  keywords: [
    "5 km Trainingsplan",
    "5k training plan",
    "5 km Laufplan",
    "5 km Trainingsplan Anfänger",
    "8 Wochen 5 km Plan",
  ],
  eyebrow: "8-Wochen-5-km-Laufplan",
  title: "5-km-Trainingsplan: kostenloser 8-Wochen-Plan für Einsteiger",
  subtitle:
    "Dieser 5-km-Plan richtet sich an Läufer, die bereits 20 bis 30 Minuten locker laufen können und eine klare Wettkampfstruktur suchen. Er kombiniert lockere Dauerläufe im Gesprächstempo, eine kontrollierte Qualitätseinheit, einen wöchentlichen Long Run, Erholung und ein kurzes Tapering vor dem Renntag.",
  primaryCta: "Meinen 5-km-Plan personalisieren",
  secondaryCta: "Alle Pläne ansehen",
  promise:
    "Der vollständige Trainingsplan ist unten kostenlos verfügbar. Personalisiere ihn, wenn verfügbare Tage, aktuelles Training, Tempo oder Erholung nicht zu einem Standardkalender passen.",
  planChooser: {
    title: "Den passenden 5-km-Plan wählen",
    subtitle:
      "Beginne mit dem Plan, der zu dem passt, was du heute laufen kannst. Jede Option hat einen anderen Ausgangspunkt und eine andere Trainingsbelastung.",
    options: [
      {
        label: "Von Null starten",
        title: "Couch to 5K",
        description:
          "Nutze eine Lauf-Geh-Progression, wenn 20 Minuten lockeres Durchlaufen noch nicht angenehm sind.",
        href: "/couch-to-5k-training-plan",
      },
      {
        label: "Aktueller Plan",
        title: "5 km sicher ins Ziel laufen",
        description:
          "Wähle diesen 8-Wochen-Plan, wenn du bereits 20–30 Minuten locker laufen und vier Tage pro Woche trainieren kannst.",
        href: null,
      },
      {
        label: "Bereits Wettkampferfahrung",
        title: "Schnellere 5 km laufen",
        description:
          "Nutze den Plan für Fortgeschrittene, wenn du ein aktuelles 5-km-Ergebnis hast und gezielte Intervalle sowie Tempoläufe möchtest.",
        href: "/5k-training-plan/intermediate",
      },
    ],
  },
  trustItems: [
    "Kompletter Plan kostenlos",
    "8 Wochen",
    "4 Läufe pro Woche",
    "20–30 Minuten Laufbasis",
  ],
  forTitle: "Für wen dieser 5-km-Trainingsplan gedacht ist",
  forItems: [
    "Du kannst 20 bis 30 Minuten locker durchlaufen, ohne eine Lauf-Geh-Steigerung zu brauchen.",
    "Du möchtest deine ersten 5 km souverän schaffen oder eine aktuelle 5-km-Zeit verbessern, ohne jeden Lauf hart zu laufen.",
    "Du kannst vier Lauftage pro Woche einplanen, inklusive einer Qualitätseinheit und eines längeren lockeren Laufs.",
    "Du hast aktuell keine Schmerzen, Erkrankungen oder Verletzungen, die deinen Laufstil verändern.",
  ],
  previewTitle: "So baut sich der 8-Wochen-5-km-Plan auf",
  previewSubtitle:
    "Der Plan entwickelt sich von stabilen lockeren Läufen über 5-km-spezifische Reize bis zur Entlastung vor dem Wettkampf. Der vollständige Tagesplan folgt unten.",
  previewRows: [
    [
      "Wochen 1–2",
      "Rhythmus etablieren",
      "Laufe überwiegend locker und integriere entspannte Steigerungen oder kurze Hügel.",
    ],
    [
      "Wochen 3–6",
      "5-km-Stärke aufbauen",
      "Wechsle zwischen kontrollierten Intervallen und Tempoläufen, während der Long Run langsam wächst.",
    ],
    [
      "Wochen 7–8",
      "Tapering und Wettkampf",
      "Reduziere den Umfang, halte etwas Spritzigkeit und starte frisch in die 5 km.",
    ],
  ],
  contentTitle: "Was einen praxistauglichen 5-km-Plan ausmacht",
  contentSubtitle:
    "Ein guter 5-km-Plan trennt lockeren Umfang von Qualitätseinheiten, gibt jedem Lauf ein klares Ziel und lässt genug Erholung für konstante Trainingswochen.",
  contentSections: [
    [
      "Lockerer Umfang",
      "Lockere Läufe schaffen Konstanz, ohne jeden Tag zu einem Leistungstest zu machen.",
      [
        "Im Gesprächstempo laufen",
        "Bei Hitze und Steigungen langsamer werden",
        "Ruhetage konsequent einhalten",
      ],
    ],
    [
      "Eine Qualitätseinheit",
      "Intervalle, Hügel oder Tempoläufe entwickeln 5-km-spezifisches Tempo, ohne die Woche zu dominieren.",
      [
        "Wiederholungen kontrolliert laufen",
        "Aufhören, bevor die Technik nachlässt",
        "Verpasste lockere Läufe nicht durch Intensität ersetzen",
      ],
    ],
    [
      "Long Run und Tapering",
      "Ein moderater Long Run stärkt die Ausdauer; die letzte Woche baut Ermüdung ab und bewahrt den Rhythmus.",
      [
        "Den Long Run locker halten",
        "Umfang vor dem Renntag reduzieren",
        "Kurzfristige Fitnesstests vermeiden",
      ],
    ],
  ],
  conversionTitle: "Übertrage den kostenlosen 5-km-Plan in deinen Kalender",
  conversionText:
    "Wähle Wettkampfdatum, verfügbare Tage, aktuelles Tempo und bisheriges Training. Trainingload.ai erstellt daraus einen Planentwurf und lässt spätere Anpassungen vor der Übernahme in den Kalender prüfen.",
  aiTitle: "Wie Trainingload.ai einen 5-km-Plan personalisiert",
  aiSubtitle:
    "Der öffentliche Plan zeigt, was zu tun ist. Die Personalisierung entscheidet, an welchen Tagen Einheiten liegen, welche Tempo-Anker gelten und ob absolvierte Läufe für Aufbau, Halten oder Erholung sprechen.",
  aiSignals: [
    [
      "Plan versus Ist",
      "Vergleiche das geplante Workout mit dem absolvierten Lauf statt nur die Pace zu bewerten.",
    ],
    [
      "Trainingsbelastung",
      "Prüfe aktuelle Belastung und Erholung, bevor du den Umfang erhöhst oder eine weitere harte Einheit hinzufügst.",
    ],
    [
      "Bestätigte Änderungen",
      "Der KI-Coach schlägt Änderungen vor; erst nach Bestätigung durch dich oder deinen Coach wird der Kalender aktualisiert.",
    ],
  ],
  relatedTitle: "Weiter mit deinem Laufplan",
  relatedLinks: [
    [
      "Start bei Null? Nutze Couch to 5K",
      "/couch-to-5k-training-plan",
      "Nutze eine Lauf-Geh-Progression, wenn 20 Minuten lockeres Durchlaufen noch nicht leichtfallen.",
    ],
    [
      "Von 5 km auf 10 km aufbauen",
      "/10k-training-plan",
      "Erweitere Ausdauer und Schwellentraining mit dem vollständigen 10-km-Plan.",
    ],
    [
      "Trainingstempi mit VDOT festlegen",
      "/vdot-calculator",
      "Nutze eine aktuelle Leistung als Orientierung für kontrollierte Trainingstempi.",
    ],
  ],
  faq: [
    [
      "Wie lange sollte ich für 5 km trainieren?",
      "Dieser Plan dauert acht Wochen. Läufer mit geringerer Grundfitness brauchen oft länger; wer bereits konstant trainiert, sollte die Belastung prüfen, bevor er später einsteigt.",
    ],
    [
      "An wie vielen Tagen pro Woche sollte ich laufen?",
      "Der Plan nutzt vier Lauftage. Halte lockere Tage wirklich locker und plane zwischen intensiveren Einheiten Ruhe- oder Krafttage ein.",
    ],
    [
      "Ist das ein 5-km-Plan für Anfänger?",
      "Ja, für Einsteiger, die bereits 20 bis 30 Minuten locker laufen können. Komplette Laufanfänger sollten den separaten Couch-to-5K-Plan nutzen.",
    ],
    [
      "Was mache ich, wenn ich eine Einheit verpasse?",
      "Lass sie aus oder verschiebe sie nur, wenn die Erholung gewahrt bleibt. Kombiniere keine zwei Qualitätseinheiten hintereinander und hole verpasste Kilometer nicht am Wochenende nach.",
    ],
    [
      "Ändert die KI den Plan automatisch?",
      "Trainingload.ai erstellt auf Basis absolvierter Läufe und der Trainingsbelastung Anpassungsvorschläge, aber der Kalender ändert sich erst nach deiner Bestätigung.",
    ],
  ],
};

fiveKCopy.fr = {
  ...fiveKCopy.en,
  weeks: "8 semaines",
  level: "Débutant à intermédiaire",
  weeklyVolume: "4 sorties/semaine",
  metaTitle: "Plan d'entraînement 5 km gratuit sur 8 semaines pour débutants",
  metaDescription:
    "Plan d'entraînement 5 km gratuit sur 8 semaines pour les coureurs capables de courir 20–30 minutes. Quatre sorties par semaine, volume facile, une séance régulière et court affûtage.",
  keywords: [
    "plan entraînement 5 km",
    "5k training plan",
    "programme course 5 km",
    "plan 5 km débutant",
    "plan 5 km 8 semaines",
  ],
  eyebrow: "Plan course à pied 5 km sur 8 semaines",
  title: "Plan d'entraînement 5 km : programme débutant gratuit sur 8 semaines",
  subtitle:
    "Ce plan 5 km s'adresse aux coureurs capables de courir 20 à 30 minutes en aisance respiratoire et qui cherchent un programme clair jusqu'à la course. Il associe sorties en endurance fondamentale, une séance de qualité contrôlée, une sortie longue hebdomadaire, de la récupération et un court affûtage.",
  primaryCta: "Personnaliser mon plan 5 km",
  secondaryCta: "Parcourir tous les plans",
  promise:
    "Le programme complet est disponible gratuitement ci-dessous. Personnalisez-le si vos jours disponibles, votre entraînement récent, votre allure ou votre récupération rendent un calendrier générique inadapté.",
  planChooser: {
    title: "Choisir le bon plan 5 km",
    subtitle:
      "Commencez par le plan qui correspond à ce que vous pouvez courir aujourd'hui. Chaque option a un point de départ et une charge d'entraînement différents.",
    options: [
      {
        label: "Partir de zéro",
        title: "Couch to 5K",
        description:
          "Optez pour une progression course-marche si 20 minutes de course facile en continu ne sont pas encore confortables.",
        href: "/couch-to-5k-training-plan",
      },
      {
        label: "Plan actuel",
        title: "Finir un 5 km",
        description:
          "Choisissez ce plan sur 8 semaines si vous courez déjà facilement 20–30 minutes et disposez de quatre jours par semaine.",
        href: null,
      },
      {
        label: "Déjà en compétition",
        title: "Courir un 5 km plus vite",
        description:
          "Passez au plan intermédiaire si vous avez un chrono récent sur 5 km et souhaitez des intervalles et du tempo structurés.",
        href: "/5k-training-plan/intermediate",
      },
    ],
  },
  trustItems: [
    "Programme complet gratuit",
    "8 semaines",
    "4 sorties par semaine",
    "Base de 20–30 minutes de course",
  ],
  forTitle: "À qui s'adresse ce plan d'entraînement 5 km",
  forItems: [
    "Vous pouvez courir facilement 20 à 30 minutes sans avoir besoin d'une progression course-marche.",
    "Vous souhaitez finir un premier 5 km en confiance ou améliorer un chrono récent sans courir chaque sortie à fond.",
    "Vous pouvez réserver quatre jours de course par semaine, dont une séance de qualité et une sortie longue facile.",
    "Vous ne présentez actuellement aucune douleur, maladie ni blessure altérant votre foulée.",
  ],
  previewTitle: "Comment progresse ce plan 5 km sur 8 semaines",
  previewSubtitle:
    "Le plan part d'un volume facile répétable, introduit du travail spécifique 5 km puis réduit la fatigue avant la course. Le détail jour par jour suit ci-dessous.",
  previewRows: [
    [
      "Semaines 1–2",
      "Installer le rythme",
      "Gardez la majorité des sorties faciles et ajoutez des lignes droites relâchées ou de courtes côtes.",
    ],
    [
      "Semaines 3–6",
      "Construire la solidité 5 km",
      "Alternez intervalles contrôlés et séances au tempo pendant que la sortie longue s'allonge progressivement.",
    ],
    [
      "Semaines 7–8",
      "Affûtage et course",
      "Réduisez le volume, conservez un peu de vitesse et arrivez frais au départ du 5 km.",
    ],
  ],
  contentTitle: "Ce qui rend ce plan 5 km vraiment pratique",
  contentSubtitle:
    "Un bon plan 5 km sépare volume facile et qualité, donne un rôle clair à chaque séance et laisse assez de récupération pour enchaîner les semaines avec régularité.",
  contentSections: [
    [
      "Volume facile",
      "Les sorties faciles bâtissent la régularité sans transformer chaque jour en test.",
      [
        "Rester en aisance respiratoire",
        "Ralentir par temps chaud et en côte",
        "Préserver les jours de récupération",
      ],
    ],
    [
      "Une séance de qualité",
      "Intervalles, côtes ou tempo développent la vitesse spécifique 5 km sans écraser la semaine.",
      [
        "Exécuter les répétitions en contrôle",
        "S'arrêter avant que la technique ne se dégrade",
        "Ne pas compenser une sortie facile manquée par de l'intensité",
      ],
    ],
    [
      "Sortie longue et affûtage",
      "Une sortie longue modérée soutient l'endurance ; la dernière semaine élimine la fatigue tout en gardant le rythme.",
      [
        "Garder la sortie longue facile",
        "Réduire le volume avant la course",
        "Éviter les tests de forme de dernière minute",
      ],
    ],
  ],
  conversionTitle: "Intégrez le plan 5 km gratuit à votre calendrier",
  conversionText:
    "Indiquez votre date de course, vos jours disponibles, votre allure actuelle et votre entraînement récent. Trainingload.ai génère un brouillon adapté à ces contraintes et soumet chaque ajustement ultérieur à votre validation.",
  aiTitle: "Comment Trainingload.ai personnalise un plan 5 km",
  aiSubtitle:
    "Le programme public indique quoi faire. La personnalisation détermine où placer les séances, quels repères d'allure utiliser et si les sorties effectuées invitent à progresser, maintenir ou récupérer.",
  aiSignals: [
    [
      "Prévu vs réalisé",
      "Comparez la séance prévue avec celle réellement courue au lieu de juger uniquement l'allure.",
    ],
    [
      "Charge d'entraînement",
      "Analysez la charge récente et la récupération avant d'augmenter le volume ou d'ajouter une séance exigeante.",
    ],
    [
      "Modifications confirmées",
      "Le Coach IA propose une modification ; vous ou votre entraîneur la confirmez avant toute mise à jour du calendrier.",
    ],
  ],
  relatedTitle: "Poursuivre votre plan de course",
  relatedLinks: [
    [
      "Vous partez de zéro ? Utilisez Couch to 5K",
      "/couch-to-5k-training-plan",
      "Suivez une progression course-marche si 20 minutes de course facile en continu ne sont pas encore confortables.",
    ],
    [
      "Passer du 5 km au 10 km",
      "/10k-training-plan",
      "Prolongez l'endurance et le travail au seuil avec le programme complet 10 km.",
    ],
    [
      "Définir vos allures avec le VDOT",
      "/vdot-calculator",
      "Utilisez une performance récente comme référence pour des allures d'entraînement maîtrisées.",
    ],
  ],
  faq: [
    [
      "Combien de temps faut-il s'entraîner pour un 5 km ?",
      "Ce programme dure huit semaines. Les coureurs avec moins de base peuvent avoir besoin de plus de temps ; ceux déjà réguliers ne doivent rejoindre en cours de route qu'après vérification de la charge.",
    ],
    [
      "Combien de jours par semaine faut-il courir ?",
      "Le plan prévoit quatre jours de course. Gardez les jours faciles vraiment faciles et préservez les jours de repos ou de renforcement entre les séances clés.",
    ],
    [
      "Est-ce un plan 5 km pour débutant ?",
      "Oui, pour un débutant déjà capable de courir facilement 20 à 30 minutes. Les grands débutants doivent utiliser le plan Couch to 5K dédié.",
    ],
    [
      "Que faire si je manque une séance ?",
      "Sautez-la ou déplacez-la uniquement si la récupération reste protégée. N'enchaînez jamais deux séances de qualité et ne rattrapez pas le kilométrage manqué le week-end.",
    ],
    [
      "L'IA modifie-t-elle le plan automatiquement ?",
      "Trainingload.ai peut préparer des ajustements à partir des sorties réalisées et de la charge d'entraînement, mais le calendrier n'est mis à jour qu'après votre confirmation.",
    ],
  ],
};

fiveKCopy.es = {
  ...fiveKCopy.en,
  weeks: "8 semanas",
  level: "Principiante a intermedio",
  weeklyVolume: "4 carreras/semana",
  metaTitle: "Plan de entrenamiento 5K gratis de 8 semanas para principiantes",
  metaDescription:
    "Plan de entrenamiento 5K gratis de 8 semanas para corredores que ya pueden correr 20–30 minutos. Cuatro salidas semanales, volumen suave, una sesión constante y un breve tapering.",
  keywords: [
    "plan de entrenamiento 5k",
    "5k training plan",
    "plan para correr 5k",
    "plan 5k principiantes",
    "plan 5k 8 semanas",
  ],
  eyebrow: "Plan de running 5K de 8 semanas",
  title: "Plan de entrenamiento 5K: calendario gratuito de 8 semanas para principiantes",
  subtitle:
    "Este plan de 5K es para corredores que ya completan de 20 a 30 minutos de carrera suave y quieren un calendario claro hasta la meta. Combina rodajes conversacionales, una sesión de calidad controlada, una tirada larga semanal, recuperación y un breve tapering antes del día de la carrera.",
  primaryCta: "Personalizar mi plan de 5K",
  secondaryCta: "Ver todos los planes",
  promise:
    "El calendario completo es gratis más abajo. Personalízalo cuando tus días disponibles, tu entrenamiento reciente, tu ritmo o tu recuperación hagan que un calendario genérico no encaje contigo.",
  planChooser: {
    title: "Elige el plan de 5K adecuado",
    subtitle:
      "Empieza por el plan que coincide con lo que puedes correr hoy. Cada opción parte de un punto y una carga de entrenamiento distintos.",
    options: [
      {
        label: "Empezar desde cero",
        title: "Couch to 5K",
        description:
          "Usa una progresión de correr y caminar si todavía no te resultan cómodos 20 minutos seguidos de trote suave.",
        href: "/couch-to-5k-training-plan",
      },
      {
        label: "Plan actual",
        title: "Terminar un 5K",
        description:
          "Elige este plan de 8 semanas si ya corres suave 20–30 minutos y puedes entrenar cuatro días por semana.",
        href: null,
      },
      {
        label: "Ya compites",
        title: "Correr un 5K más rápido",
        description:
          "Usa el plan intermedio cuando tengas una marca reciente en 5K y busques series y trabajo de tempo estructurados.",
        href: "/5k-training-plan/intermediate",
      },
    ],
  },
  trustItems: [
    "Calendario completo gratis",
    "8 semanas",
    "4 carreras por semana",
    "Base de 20–30 minutos corriendo",
  ],
  forTitle: "Para quién es este plan de entrenamiento 5K",
  forItems: [
    "Puedes correr suavemente de 20 a 30 minutos sin necesitar una progresión de correr y caminar.",
    "Quieres terminar tu primer 5K con confianza o mejorar una marca reciente sin exigirte al máximo en cada salida.",
    "Puedes reservar cuatro días de carrera por semana, incluyendo una sesión de calidad y una tirada larga suave.",
    "Actualmente no tienes dolor, enfermedad ni lesión que altere tu técnica de carrera.",
  ],
  previewTitle: "Cómo progresa el plan de 5K de 8 semanas",
  previewSubtitle:
    "El plan avanza desde rodajes suaves repetibles hacia trabajo específico de 5K y luego reduce la fatiga antes de la carrera. El calendario completo día a día está debajo.",
  previewRows: [
    [
      "Semanas 1–2",
      "Establecer el ritmo",
      "Mantén la mayoría de los rodajes suaves e introduce rectas relajadas o cuestas cortas.",
    ],
    [
      "Semanas 3–6",
      "Construir solidez para 5K",
      "Alterna series controladas y trabajo de tempo mientras la tirada larga crece gradualmente.",
    ],
    [
      "Semanas 7–8",
      "Tapering y carrera",
      "Reduce el volumen, mantén algo de chispa y llega fresco al 5K.",
    ],
  ],
  contentTitle: "Qué hace práctico a este plan de 5K",
  contentSubtitle:
    "Un buen calendario de 5K separa el volumen suave del trabajo de calidad, da un propósito claro a cada sesión y deja recuperación suficiente para repetir la semana con constancia.",
  contentSections: [
    [
      "Volumen suave",
      "Los rodajes suaves construyen constancia sin convertir cada día en un examen.",
      [
        "Usa un esfuerzo conversacional",
        "Baja el ritmo con calor y cuestas",
        "Respeta los días de recuperación",
      ],
    ],
    [
      "Una sesión de calidad",
      "Las series, cuestas o el tempo desarrollan velocidad específica de 5K sin dominar la semana.",
      [
        "Corre las repeticiones con control",
        "Detente antes de que empeore la técnica",
        "No compenses rodajes suaves perdidos con intensidad",
      ],
    ],
    [
      "Tirada larga y tapering",
      "Una tirada larga moderada sostiene la resistencia; la última semana reduce la fatiga sin perder el ritmo.",
      [
        "Mantén la tirada larga suave",
        "Reduce el volumen antes de la carrera",
        "Evita pruebas de forma de última hora",
      ],
    ],
  ],
  conversionTitle: "Convierte el calendario gratis de 5K en tu agenda",
  conversionText:
    "Elige tu fecha de carrera, días disponibles, ritmo actual y entrenamiento reciente. Trainingload.ai prepara el borrador alrededor de esas condiciones y mantiene cada ajuste posterior revisable antes de llegar a tu calendario.",
  aiTitle: "Cómo personaliza Trainingload.ai un plan de 5K",
  aiSubtitle:
    "El calendario público indica qué hacer. La personalización decide qué día encaja cada sesión, qué referencias de ritmo aplicar y si las salidas completadas respaldan construir, mantener o recuperar.",
  aiSignals: [
    [
      "Plan frente a realidad",
      "Compara el entrenamiento previsto con la carrera completada en lugar de juzgar solo el ritmo.",
    ],
    [
      "Carga de entrenamiento",
      "Revisa la carga reciente y la recuperación antes de subir volumen o añadir otra sesión exigente.",
    ],
    [
      "Cambios confirmados",
      "El Entrenador con IA propone un ajuste; tú o tu entrenador lo confirmáis antes de actualizar el calendario.",
    ],
  ],
  relatedTitle: "Continúa con tu plan de running",
  relatedLinks: [
    [
      "¿Empiezas desde cero? Usa Couch to 5K",
      "/couch-to-5k-training-plan",
      "Usa una progresión de correr y caminar si 20 minutos seguidos de carrera suave aún no resultan cómodos.",
    ],
    [
      "Da el salto de 5K a 10K",
      "/10k-training-plan",
      "Amplía tu resistencia y el trabajo de umbral con el calendario completo de 10K.",
    ],
    [
      "Define ritmos de entrenamiento con VDOT",
      "/vdot-calculator",
      "Usa una marca reciente como referencia para establecer ritmos de entrenamiento controlados.",
    ],
  ],
  faq: [
    [
      "¿Cuántas semanas debo entrenar para un 5K?",
      "Este calendario dura ocho semanas. Los corredores con menos base pueden necesitar más tiempo; quienes ya entrenan con constancia solo deben incorporarse más adelante tras revisar la carga.",
    ],
    [
      "¿Cuántos días a la semana debo correr?",
      "El plan incluye cuatro días de carrera. Mantén fáciles los días suaves y conserva días de descanso o fuerza entre las sesiones más exigentes.",
    ],
    [
      "¿Es un plan de 5K para principiantes?",
      "Sí, para un principiante que ya puede correr suave de 20 a 30 minutos. Quienes nunca han corrido deben usar el plan independiente Couch to 5K.",
    ],
    [
      "¿Qué pasa si pierdo un entrenamiento?",
      "Sáltalo o muévelo solo si la recuperación sigue protegida. No acumules dos sesiones de calidad seguidas ni metas todo el kilometraje perdido el fin de semana.",
    ],
    [
      "¿La IA cambia el plan automáticamente?",
      "Trainingload.ai puede preparar ajustes a partir de tus carreras completadas y la carga de entrenamiento, pero el calendario solo se actualiza tras tu confirmación.",
    ],
  ],
};

fiveKCopy.it = {
  ...fiveKCopy.en,
  weeks: "8 settimane",
  level: "Da principiante a intermedio",
  weeklyVolume: "4 corse/settimana",
  metaTitle: "Piano di allenamento 5 km gratis di 8 settimane per principianti",
  metaDescription:
    "Piano di allenamento 5 km gratis di 8 settimane per chi corre già 20–30 minuti. Quattro uscite a settimana, volume facile, una seduta costante e breve scarico.",
  keywords: [
    "piano allenamento 5 km",
    "5k training plan",
    "tabella corsa 5 km",
    "piano 5 km principianti",
    "piano 5 km 8 settimane",
  ],
  eyebrow: "Piano corsa 5 km di 8 settimane",
  title: "Piano di allenamento 5 km: tabella gratuita di 8 settimane per principianti",
  subtitle:
    "Questo piano 5 km è pensato per chi riesce già a correre 20–30 minuti a ritmo facile e vuole una tabella chiara verso la gara. Combina corse in respirazione agevole, una seduta di qualità controllata, un lungo settimanale, recupero e un breve scarico prima della gara.",
  primaryCta: "Personalizza il mio piano 5 km",
  secondaryCta: "Esplora tutti i piani",
  promise:
    "La tabella completa è gratuita qui sotto. Personalizzala quando i giorni disponibili, l'allenamento recente, il ritmo o il recupero rendono poco adatto un calendario generico.",
  planChooser: {
    title: "Scegli il piano 5 km giusto",
    subtitle:
      "Inizia dal piano adatto a ciò che riesci a correre oggi. Ogni opzione ha un punto di partenza e un carico di allenamento diversi.",
    options: [
      {
        label: "Partire da zero",
        title: "Couch to 5K",
        description:
          "Usa una progressione corsa-camminata se 20 minuti consecutivi di corsa facile non sono ancora confortevoli.",
        href: "/couch-to-5k-training-plan",
      },
      {
        label: "Piano attuale",
        title: "Completare una 5 km",
        description:
          "Scegli questo piano di 8 settimane se corri già facilmente 20–30 minuti e puoi allenarti quattro giorni a settimana.",
        href: null,
      },
      {
        label: "Già in gara",
        title: "Correre una 5 km più veloce",
        description:
          "Usa il piano intermedio se hai un risultato recente sui 5 km e vuoi ripetute e tempo run strutturati.",
        href: "/5k-training-plan/intermediate",
      },
    ],
  },
  trustItems: [
    "Tabella completa gratuita",
    "8 settimane",
    "4 corse a settimana",
    "Base di 20–30 minuti di corsa",
  ],
  forTitle: "A chi è adatto questo piano di allenamento 5 km",
  forItems: [
    "Riesci a correre facilmente per 20–30 minuti senza bisogno di una progressione corsa-camminata.",
    "Vuoi completare la tua prima 5 km con sicurezza o migliorare un risultato recente senza forzare ogni uscita.",
    "Puoi dedicare quattro giorni a settimana alla corsa, inclusa una seduta di qualità e una corsa facile più lunga.",
    "Al momento non hai dolori, malattie o infortuni che alterano la tua meccanica di corsa.",
  ],
  previewTitle: "Come progredisce il piano 5 km di 8 settimane",
  previewSubtitle:
    "Il piano parte da corse facili ripetibili, introduce lavori specifici per i 5 km e riduce la fatica prima della gara. La tabella completa giorno per giorno è riportata sotto.",
  previewRows: [
    [
      "Settimane 1–2",
      "Costruire il ritmo",
      "Mantieni la maggior parte delle corse facili e inserisci allunghi rilassati o brevi salite.",
    ],
    [
      "Settimane 3–6",
      "Costruire forza sui 5 km",
      "Alterna ripetute controllate e tempo run mentre il lungo cresce gradualmente.",
    ],
    [
      "Settimane 7–8",
      "Scarico e gara",
      "Riduci il volume, mantieni un po' di brillantezza e arriva fresco ai 5 km.",
    ],
  ],
  contentTitle: "Cosa rende pratico questo piano 5 km",
  contentSubtitle:
    "Una tabella efficace per i 5 km separa volume facile e qualità, assegna uno scopo chiaro a ogni seduta e lascia recupero sufficiente per ripetere la settimana con continuità.",
  contentSections: [
    [
      "Volume facile",
      "Le corse facili creano continuità senza trasformare ogni giornata in un test.",
      [
        "Mantieni uno sforzo conversazionale",
        "Rallenta con caldo e salite",
        "Rispetta i giorni di recupero",
      ],
    ],
    [
      "Una seduta di qualità",
      "Ripetute, salite o tempo run sviluppano velocità specifica sui 5 km senza dominare la settimana.",
      [
        "Corri le ripetizioni con controllo",
        "Fermati prima che la tecnica si deteriori",
        "Non sostituire corse facili saltate con intensità",
      ],
    ],
    [
      "Lungo e scarico",
      "Un lungo moderato sostiene la resistenza; l'ultima settimana riduce la fatica preservando il ritmo.",
      [
        "Mantieni il lungo facile",
        "Riduci il volume prima della gara",
        "Evita test di forma dell'ultimo minuto",
      ],
    ],
  ],
  conversionTitle: "Porta la tabella gratuita 5 km nel tuo calendario",
  conversionText:
    "Scegli la data della gara, i giorni disponibili, il passo attuale e gli allenamenti recenti. Trainingload.ai prepara la bozza su misura attorno a questi vincoli e ti permette di verificare ogni modifica successiva prima di aggiornarlo.",
  aiTitle: "Come Trainingload.ai personalizza un piano 5 km",
  aiSubtitle:
    "La tabella pubblica indica cosa fare. La personalizzazione decide in quali giorni collocare le sedute, quali riferimenti di passo applicare e se le corse completate suggeriscono di costruire, mantenere o recuperare.",
  aiSignals: [
    [
      "Piano vs svolto",
      "Confronta l'allenamento previsto con la corsa completata invece di valutare solo il passo.",
    ],
    [
      "Carico di allenamento",
      "Controlla il carico recente e il recupero prima di aumentare il volume o aggiungere un'altra seduta impegnativa.",
    ],
    [
      "Modifiche confermate",
      "Il Coach AI prepara una modifica; sei tu o il tuo allenatore a confermarla prima di aggiornare il calendario.",
    ],
  ],
  relatedTitle: "Continua il tuo piano di corsa",
  relatedLinks: [
    [
      "Parti da zero? Usa Couch to 5K",
      "/couch-to-5k-training-plan",
      "Usa una progressione corsa-camminata se 20 minuti consecutivi di corsa facile non sono ancora confortevoli.",
    ],
    [
      "Passa dai 5 km ai 10 km",
      "/10k-training-plan",
      "Estendi resistenza e lavoro di soglia con la tabella completa per i 10 km.",
    ],
    [
      "Imposta i ritmi di allenamento con VDOT",
      "/vdot-calculator",
      "Usa una prestazione recente come riferimento per ritmi di allenamento controllati.",
    ],
  ],
  faq: [
    [
      "Per quanto tempo dovrei allenarmi per una 5 km?",
      "Questa tabella dura otto settimane. Chi ha una base minore può aver bisogno di più tempo; chi si allena già con regolarità dovrebbe inserirsi a percorso avviato solo dopo aver valutato il carico.",
    ],
    [
      "Quanti giorni a settimana dovrei correre?",
      "Il piano prevede quattro giorni di corsa. Mantieni facili i giorni lenti e preserva riposo o forza tra le sedute più impegnative.",
    ],
    [
      "È un piano 5 km per principianti?",
      "Sì, per un principiante che riesce già a correre facilmente 20–30 minuti. Chi non corre affatto dovrebbe usare il piano separato Couch to 5K.",
    ],
    [
      "Cosa faccio se salto un allenamento?",
      "Saltalo o spostalo solo se il recupero resta protetto. Non affiancare due sedute di qualità e non accumulare i chilometri persi nel fine settimana.",
    ],
    [
      "L'AI modifica il piano automaticamente?",
      "Trainingload.ai può preparare aggiustamenti in base alle corse completate e al carico di allenamento, ma il calendario si aggiorna solo dopo la tua conferma.",
    ],
  ],
};

fiveKCopy["pt-BR"] = {
  ...fiveKCopy.en,
  weeks: "8 semanas",
  level: "Iniciante a intermediário",
  weeklyVolume: "4 corridas/semana",
  metaTitle: "Plano de treino de 5 km grátis de 8 semanas para iniciantes",
  metaDescription:
    "Plano de treino de 5 km grátis de 8 semanas para corredores que já correm 20–30 minutos. Quatro corridas por semana, volume leve, um treino contínuo controlado e polimento curto.",
  keywords: [
    "plano de treino 5 km",
    "5k training plan",
    "planilha de corrida 5 km",
    "plano 5 km iniciantes",
    "plano 5 km 8 semanas",
  ],
  eyebrow: "Plano de corrida 5 km de 8 semanas",
  title: "Plano de treino de 5 km: planilha gratuita de 8 semanas para iniciantes",
  subtitle:
    "Este plano de 5 km é para corredores que já conseguem correr de 20 a 30 minutos em ritmo leve e querem uma planilha clara até a prova. Ele combina rodagens conversacionais, uma sessão de qualidade controlada, um longão semanal, recuperação e um polimento curto antes do dia da prova.",
  primaryCta: "Personalizar meu plano de 5 km",
  secondaryCta: "Ver todos os planos",
  promise:
    "A planilha completa é gratuita abaixo. Personalize quando seus dias disponíveis, treinos recentes, ritmo ou recuperação tornarem um calendário genérico pouco adequado.",
  planChooser: {
    title: "Escolha o plano de 5 km certo",
    subtitle:
      "Comece pelo plano que corresponde ao que você consegue correr hoje. Cada opção tem um ponto de partida e uma carga de treino diferentes.",
    options: [
      {
        label: "Começando do zero",
        title: "Couch to 5K",
        description:
          "Use uma progressão corrida-caminhada se 20 minutos contínuos de corrida leve ainda não forem confortáveis.",
        href: "/couch-to-5k-training-plan",
      },
      {
        label: "Plano atual",
        title: "Completar 5 km",
        description:
          "Escolha este plano de 8 semanas se você já corre leve por 20–30 minutos e pode treinar quatro dias por semana.",
        href: null,
      },
      {
        label: "Já competindo",
        title: "Correr 5 km mais rápido",
        description:
          "Use o plano intermediário quando tiver um resultado recente nos 5 km e quiser treinos estruturados de intervalado e tempo run.",
        href: "/5k-training-plan/intermediate",
      },
    ],
  },
  trustItems: [
    "Planilha completa grátis",
    "8 semanas",
    "4 corridas por semana",
    "Base de 20–30 minutos correndo",
  ],
  forTitle: "Para quem é este plano de treino de 5 km",
  forItems: [
    "Você consegue correr leve por 20 a 30 minutos sem precisar de progressão corrida-caminhada.",
    "Você quer completar seus primeiros 5 km com confiança ou melhorar um resultado recente sem treinar forte todos os dias.",
    "Você consegue reservar quatro dias de corrida por semana, incluindo uma sessão de qualidade e uma corrida leve mais longa.",
    "Você não está lidando atualmente com dor, doença ou lesão que altere sua mecânica de corrida.",
  ],
  previewTitle: "Como o plano de 5 km de 8 semanas evolui",
  previewSubtitle:
    "O plano evolui de corridas leves repetíveis para estímulos específicos de 5 km e depois reduz a fadiga antes da prova. A planilha completa dia a dia segue abaixo.",
  previewRows: [
    [
      "Semanas 1–2",
      "Estabelecer o ritmo",
      "Mantenha a maior parte das corridas leve e inclua acelerações soltas ou subidas curtas.",
    ],
    [
      "Semanas 3–6",
      "Construir força para 5 km",
      "Alterne intervalados controlados e tempo run enquanto o longão cresce gradualmente.",
    ],
    [
      "Semanas 7–8",
      "Polimento e prova",
      "Reduza o volume, preserve um pouco de velocidade e chegue descansado aos 5 km.",
    ],
  ],
  contentTitle: "O que torna este plano de 5 km prático",
  contentSubtitle:
    "Uma planilha útil de 5 km separa volume leve de treinos de qualidade, dá um propósito claro a cada sessão e deixa recuperação suficiente para repetir a semana com consistência.",
  contentSections: [
    [
      "Volume leve",
      "Corridas leves constroem consistência sem transformar cada dia em um teste.",
      [
        "Mantenha esforço conversacional",
        "Reduza o ritmo no calor e nas subidas",
        "Preserve os dias de recuperação",
      ],
    ],
    [
      "Uma sessão de qualidade",
      "Intervalados, subidas ou tempo run desenvolvem velocidade específica de 5 km sem dominar a semana.",
      [
        "Execute as repetições com controle",
        "Pare antes que a técnica se deteriore",
        "Não compense corridas leves perdidas com intensidade",
      ],
    ],
    [
      "Longão e polimento",
      "Um longão moderado sustenta a resistência; a última semana reduz a fadiga preservando o ritmo.",
      [
        "Mantenha o longão leve",
        "Reduza o volume antes da prova",
        "Evite testes físicos de última hora",
      ],
    ],
  ],
  conversionTitle: "Leve a planilha gratuita de 5 km para o seu calendário",
  conversionText:
    "Escolha a data da prova, os dias disponíveis, seu ritmo atual e os treinos recentes. O Trainingload.ai monta o rascunho em torno dessas restrições e mantém ajustes futuros revisáveis antes de irem para o calendário.",
  aiTitle: "Como o Trainingload.ai personaliza um plano de 5 km",
  aiSubtitle:
    "A planilha pública responde o que fazer. A personalização decide em quais dias cada treino se encaixa, quais referências de ritmo aplicar e se os treinos concluídos indicam evoluir, manter ou recuperar.",
  aiSignals: [
    [
      "Planejado versus realizado",
      "Compare o treino previsto com a corrida concluída em vez de avaliar apenas o ritmo.",
    ],
    [
      "Carga de treino",
      "Revise a carga recente e a recuperação antes de aumentar o volume ou adicionar outra sessão forte.",
    ],
    [
      "Ajustes confirmados",
      "O Treinador de IA sugere o ajuste; você ou seu treinador confirmam antes de atualizar o calendário.",
    ],
  ],
  relatedTitle: "Continue seu plano de corrida",
  relatedLinks: [
    [
      "Começando do zero? Use o Couch to 5K",
      "/couch-to-5k-training-plan",
      "Use uma progressão corrida-caminhada se 20 minutos contínuos de corrida leve ainda não forem confortáveis.",
    ],
    [
      "Evolua dos 5 km para os 10 km",
      "/10k-training-plan",
      "Amplie resistência e trabalho de limiar com a planilha completa de 10 km.",
    ],
    [
      "Defina ritmos de treino com VDOT",
      "/vdot-calculator",
      "Use um desempenho recente como referência para ritmos de treino controlados.",
    ],
  ],
  faq: [
    [
      "Por quanto tempo devo treinar para uma prova de 5 km?",
      "Esta planilha tem oito semanas. Corredores com menos base podem precisar de mais tempo; quem já treina com regularidade deve entrar no meio do plano apenas após revisar a carga.",
    ],
    [
      "Quantos dias por semana devo correr?",
      "O plano usa quatro dias de corrida. Mantenha os dias leves realmente leves e preserve dias de descanso ou força entre as sessões mais exigentes.",
    ],
    [
      "Este é um plano de 5 km para iniciantes?",
      "Sim, para um iniciante que já consegue correr leve por 20 a 30 minutos. Quem ainda não corre deve usar o plano separado Couch to 5K.",
    ],
    [
      "E se eu perder um treino?",
      "Pule ou mova apenas quando a recuperação continuar protegida. Não junte duas sessões de qualidade nem concentre a quilometragem perdida no fim de semana.",
    ],
    [
      "A IA altera o plano automaticamente?",
      "O Trainingload.ai pode preparar ajustes com base nas corridas concluídas e na carga de treino, mas o calendário só é atualizado após sua confirmação.",
    ],
  ],
};

const finishFiveKDetails: Record<
  PlanCopyLocale,
  Pick<
    RunningPlan,
    | "previewTitle"
    | "previewSubtitle"
    | "previewRows"
    | "contentTitle"
    | "contentSubtitle"
    | "contentSections"
  >
> = {
  en: {
    previewTitle: "How the 8-week finish plan progresses",
    previewSubtitle:
      "Four repeatable runs each week develop continuous endurance, recover at the right moments, and taper into the final 5K.",
    previewRows: [
      [
        "Weeks 1–3",
        "Build the base",
        "Progress the long run from 25 to 35 minutes.",
      ],
      [
        "Week 4",
        "Absorb the work",
        "Reduce the long run and keep every session controlled.",
      ],
      [
        "Weeks 5–6",
        "Build again",
        "Reach a 40- then 45-minute conversational long run.",
      ],
      [
        "Weeks 7–8",
        "Taper and finish",
        "Reduce fatigue, then complete 5K with a controlled start.",
      ],
    ],
    contentTitle: "What each weekly run is for",
    contentSubtitle:
      "The schedule separates easy volume, controlled steady running, and the long run so no single session has to do everything.",
    contentSections: [
      [
        "Two easy runs",
        "Easy and recovery running builds consistency while preserving energy.",
        [
          "Stay conversational",
          "Slow down for heat and hills",
          "Do not stack missed sessions",
        ],
      ],
      [
        "One steady run",
        "A controlled RPE 5 effort develops rhythm without becoming a race.",
        [
          "Keep the effort repeatable",
          "Finish with good form",
          "Use RPE when pace evidence is weak",
        ],
      ],
      [
        "One long run",
        "The long run grows in two blocks with recovery and taper weeks between them.",
        [
          "Keep breathing conversational",
          "Reduce in weeks 4 and 7",
          "Control the opening of the final 5K",
        ],
      ],
    ],
  },
  zh: {
    previewTitle: "8 周完赛计划如何进阶",
    previewSubtitle:
      "每周四次可重复训练逐步建立连续跑耐力，在正确时间恢复，并减量进入最终 5K。",
    previewRows: [
      ["第 1–3 周", "建立基础", "长跑从 25 分钟逐步增加到 35 分钟。"],
      ["第 4 周", "吸收训练", "降低长跑时长，所有训练保持受控。"],
      ["第 5–6 周", "再次构建", "依次完成 40 和 45 分钟可对话长跑。"],
      ["第 7–8 周", "减量与完赛", "先降低疲劳，再控制开局完成 5K。"],
    ],
    contentTitle: "每周四次跑步分别解决什么",
    contentSubtitle:
      "计划把轻松跑量、受控稳定跑和长跑分开，让每次训练只承担清晰目的。",
    contentSections: [
      [
        "两次轻松跑",
        "轻松跑和恢复跑在积累连续性的同时保留精力。",
        ["保持可对话", "炎热和坡路主动降速", "不要堆叠错过的训练"],
      ],
      [
        "一次稳定跑",
        "受控的 RPE 5 训练改善节奏感，但不把训练跑成比赛。",
        ["强度应可重复", "保持良好跑姿结束", "配速证据不足时使用 RPE"],
      ],
      [
        "一次长跑",
        "长跑分两轮递增，中间安排恢复周，最后安排减量。",
        ["保持可对话呼吸", "第 4 和第 7 周降低负荷", "最终 5K 主动控制开局"],
      ],
    ],
  },
  "zh-hant": {
    previewTitle: "8 週完賽計畫如何進階",
    previewSubtitle:
      "每週四次可重複訓練逐步建立連續跑耐力，在正確時間恢復，並減量進入最終 5K。",
    previewRows: [
      ["第 1–3 週", "建立基礎", "長跑從 25 分鐘逐步增加到 35 分鐘。"],
      ["第 4 週", "吸收訓練", "降低長跑時長，所有訓練保持受控。"],
      ["第 5–6 週", "再次構建", "依次完成 40 和 45 分鐘可對話長跑。"],
      ["第 7–8 週", "減量與完賽", "先降低疲勞，再控制開局完成 5K。"],
    ],
    contentTitle: "每週四次跑步分別解決什麼",
    contentSubtitle:
      "計畫把輕鬆跑量、受控穩定跑和長跑分開，讓每次訓練只承擔清晰目的。",
    contentSections: [
      [
        "兩次輕鬆跑",
        "輕鬆跑和恢復跑在累積連續性的同時保留精力。",
        ["保持可對話", "炎熱和坡路主動降速", "不要堆疊錯過的訓練"],
      ],
      [
        "一次穩定跑",
        "受控的 RPE 5 訓練改善節奏感，但不把訓練跑成比賽。",
        ["強度應可重複", "保持良好跑姿結束", "配速證據不足時使用 RPE"],
      ],
      [
        "一次長跑",
        "長跑分兩輪遞增，中間安排恢復週，最後安排減量。",
        ["保持可對話呼吸", "第 4 和第 7 週降低負荷", "最終 5K 主動控制開局"],
      ],
    ],
  },
  ja: {
    previewTitle: "8週間の完走プランの進み方",
    previewSubtitle:
      "週4回の再現できる練習で連続走の持久力を伸ばし、適切に回復しながら最後の5Kへテーパーします。",
    previewRows: [
      ["1〜3週目", "土台作り", "ロング走を25分から35分へ伸ばします。"],
      ["4週目", "適応", "ロング走を短くし、すべての練習をコントロールします。"],
      ["5〜6週目", "再構築", "会話できる40分、45分のロング走へ進みます。"],
      [
        "7〜8週目",
        "テーパーと完走",
        "疲労を減らし、序盤を抑えて5Kを完走します。",
      ],
    ],
    contentTitle: "週4回の各ランの目的",
    contentSubtitle:
      "イージー走、ステディ走、ロング走の役割を分け、各練習の目的を明確にします。",
    contentSections: [
      [
        "2回のイージー走",
        "継続性を積みながら回復の余力を守ります。",
        ["会話できる強度", "暑さや坂では落とす", "欠けた練習を詰め込まない"],
      ],
      [
        "1回のステディ走",
        "RPE 5のコントロールした走りで、レースにせずリズムを磨きます。",
        ["再現できる強度", "良いフォームで終える", "根拠が弱ければRPEを使う"],
      ],
      [
        "1回のロング走",
        "2つの構築ブロックの間に回復週を置き、最後にテーパーします。",
        ["会話できる呼吸", "4・7週目に負荷を下げる", "最後の5Kは序盤を抑える"],
      ],
    ],
  },
  ko: {
    previewTitle: "8주 완주 플랜의 진행 방식",
    previewSubtitle:
      "매주 반복 가능한 4회의 러닝으로 지속 지구력을 키우고, 적절한 시점에 회복한 뒤 최종 5K에 맞춰 테이퍼링합니다.",
    previewRows: [
      ["1–3주차", "기반 구축", "롱런을 25분에서 35분까지 점진적으로 늘립니다."],
      ["4주차", "훈련 흡수", "롱런 시간을 줄이고 모든 세션을 제어된 강도로 유지합니다."],
      ["5–6주차", "재구축", "대화 가능한 강도로 40분, 이어서 45분 롱런에 도달합니다."],
      [
        "7–8주차",
        "테이퍼링과 완주",
        "피로를 줄인 뒤 초반을 차분하게 시작해 5K를 완주합니다.",
      ],
    ],
    contentTitle: "주간 4회 러닝의 각각의 역할",
    contentSubtitle:
      "이지 볼륨, 제어된 스테디 러닝, 롱런의 역할을 분리해 한 번의 훈련에 모든 부담이 쏠리지 않게 합니다.",
    contentSections: [
      [
        "이지 러닝 2회",
        "이지 러닝과 회복 러닝은 에너지를 보존하면서 꾸준함을 쌓습니다.",
        [
          "대화가 가능한 강도 유지",
          "더위와 오르막에서는 속도 늦추기",
          "빠진 세션을 몰아서 붙이지 않기",
        ],
      ],
      [
        "스테디 러닝 1회",
        "제어된 RPE 5 강도로 레이스처럼 무리하지 않으면서 리듬을 기릅니다.",
        [
          "반복 가능한 강도 유지",
          "좋은 자세로 마무리하기",
          "페이스 근거가 부족하면 RPE 활용",
        ],
      ],
      [
        "롱런 1회",
        "두 번의 구축 블록 사이에 회복주를 두고 마지막에 테이퍼링합니다.",
        [
          "대화 가능한 호흡 유지",
          "4주차와 7주차에 부하 줄이기",
          "최종 5K 초반 페이스 조절하기",
        ],
      ],
    ],
  },
  de: {
    previewTitle: "So baut sich der 8-Wochen-Finisher-Plan auf",
    previewSubtitle:
      "Vier wiederholbare Läufe pro Woche entwickeln kontinuierliche Ausdauer, sorgen zur richtigen Zeit für Erholung und führen per Tapering zu den 5 km.",
    previewRows: [
      [
        "Wochen 1–3",
        "Basis aufbauen",
        "Steigere den Long Run schrittweise von 25 auf 35 Minuten.",
      ],
      [
        "Woche 4",
        "Belastung verarbeiten",
        "Verkürze den Long Run und laufe jede Einheit kontrolliert.",
      ],
      [
        "Wochen 5–6",
        "Erneut aufbauen",
        "Erreiche einen 40- und anschließend 45-minütigen Long Run im Gesprächstempo.",
      ],
      [
        "Wochen 7–8",
        "Tapering und Zieleinlauf",
        "Baue Ermüdung ab und absolviere die 5 km mit kontrolliertem Start.",
      ],
    ],
    contentTitle: "Wofür jeder Lauf der Woche da ist",
    contentSubtitle:
      "Der Plan trennt lockeren Umfang, kontrolliertes Steady Running und den Long Run, damit keine einzelne Einheit alles leisten muss.",
    contentSections: [
      [
        "Zwei lockere Läufe",
        "Lockere und Regenerationsläufe schaffen Konstanz und schonen die Energie.",
        [
          "Im Gesprächstempo bleiben",
          "Bei Hitze und Steigungen langsamer laufen",
          "Verpasste Einheiten nicht stapeln",
        ],
      ],
      [
        "Ein Steady Run",
        "Ein kontrollierter Aufwand bei RPE 5 entwickelt Rhythmus, ohne zum Wettkampf zu werden.",
        [
          "Anstrengung wiederholbar halten",
          "Mit sauberer Technik beenden",
          "Bei schwacher Pace-Datenlage RPE nutzen",
        ],
      ],
      [
        "Ein Long Run",
        "Der Long Run wächst in zwei Blöcken mit Erholungs- und Tapering-Wochen dazwischen.",
        [
          "Atmung im Gesprächstempo halten",
          "In Woche 4 und 7 reduzieren",
          "Die ersten Kilometer der finalen 5 km kontrolliert angehen",
        ],
      ],
    ],
  },
  fr: {
    previewTitle: "Comment progresse le plan finish sur 8 semaines",
    previewSubtitle:
      "Quatre sorties répétables par semaine développent l'endurance continue, placent la récupération au bon moment et mènent à l'affûtage pour le 5 km.",
    previewRows: [
      [
        "Semaines 1–3",
        "Construire la base",
        "Faites passer la sortie longue de 25 à 35 minutes.",
      ],
      [
        "Semaine 4",
        "Assimiler le travail",
        "Réduisez la sortie longue et gardez chaque séance sous contrôle.",
      ],
      [
        "Semaines 5–6",
        "Reprendre la progression",
        "Atteignez une sortie longue en aisance respiratoire de 40 puis 45 minutes.",
      ],
      [
        "Semaines 7–8",
        "Affûtage et finish",
        "Réduisez la fatigue puis bouclez le 5 km avec un départ maîtrisé.",
      ],
    ],
    contentTitle: "À quoi sert chaque sortie de la semaine",
    contentSubtitle:
      "Le programme sépare volume facile, course régulière contrôlée et sortie longue afin qu'aucune séance n'ait à tout faire.",
    contentSections: [
      [
        "Deux sorties faciles",
        "L'endurance facile et la récupération bâtissent la régularité tout en préservant l'énergie.",
        [
          "Rester capable de parler",
          "Ralentir par temps chaud et en côte",
          "Ne pas empiler les séances manquées",
        ],
      ],
      [
        "Une sortie régulière",
        "Un effort contrôlé à RPE 5 développe le rythme sans devenir une course.",
        [
          "Garder un effort répétable",
          "Terminer avec une bonne technique",
          "Utiliser le RPE si les repères d'allure manquent",
        ],
      ],
      [
        "Une sortie longue",
        "La sortie longue progresse en deux blocs encadrés par la récupération et l'affûtage.",
        [
          "Garder une respiration conversationnelle",
          "Alléger aux semaines 4 et 7",
          "Contrôler le début du 5 km final",
        ],
      ],
    ],
  },
  es: {
    previewTitle: "Cómo progresa el plan de 8 semanas para terminar",
    previewSubtitle:
      "Cuatro salidas repetibles cada semana desarrollan resistencia continua, recuperan en el momento oportuno y afinan el cuerpo para el 5K final.",
    previewRows: [
      [
        "Semanas 1–3",
        "Construir la base",
        "Lleva la tirada larga de 25 a 35 minutos progresivamente.",
      ],
      [
        "Semana 4",
        "Asimilar el trabajo",
        "Reduce la tirada larga y mantén controlada cada sesión.",
      ],
      [
        "Semanas 5–6",
        "Volver a construir",
        "Alcanza una tirada larga conversacional de 40 y luego 45 minutos.",
      ],
      [
        "Semanas 7–8",
        "Tapering y meta",
        "Reduce la fatiga y completa el 5K con un inicio controlado.",
      ],
    ],
    contentTitle: "Para qué sirve cada carrera de la semana",
    contentSubtitle:
      "El calendario separa el volumen suave, la carrera constante controlada y la tirada larga para que ninguna sesión tenga que hacerlo todo.",
    contentSections: [
      [
        "Dos rodajes suaves",
        "La carrera suave y de recuperación construye constancia mientras conserva energía.",
        [
          "Mantén un ritmo conversacional",
          "Baja el ritmo con calor y cuestas",
          "No acumules sesiones perdidas",
        ],
      ],
      [
        "Una carrera constante",
        "Un esfuerzo controlado a RPE 5 desarrolla ritmo sin convertirse en una competición.",
        [
          "Mantén el esfuerzo repetible",
          "Termina con buena técnica",
          "Usa RPE cuando haya pocos datos de ritmo",
        ],
      ],
      [
        "Una tirada larga",
        "La tirada larga crece en dos bloques con semanas de descarga y tapering entre medias.",
        [
          "Mantén una respiración conversacional",
          "Reduce carga en las semanas 4 y 7",
          "Controla el arranque del 5K final",
        ],
      ],
    ],
  },
  it: {
    previewTitle: "Come progredisce il piano di 8 settimane per completare i 5 km",
    previewSubtitle:
      "Quattro corse ripetibili a settimana sviluppano resistenza continua, recuperano nei momenti giusti e portano allo scarico per i 5 km finali.",
    previewRows: [
      [
        "Settimane 1–3",
        "Costruire la base",
        "Porta il lungo da 25 a 35 minuti in modo graduale.",
      ],
      [
        "Settimana 4",
        "Assorbire il lavoro",
        "Riduci il lungo e mantieni ogni seduta sotto controllo.",
      ],
      [
        "Settimane 5–6",
        "Costruire di nuovo",
        "Raggiungi un lungo in respirazione agevole di 40 e poi 45 minuti.",
      ],
      [
        "Settimane 7–8",
        "Scarico e traguardo",
        "Riduci la fatica e completa i 5 km con una partenza controllata.",
      ],
    ],
    contentTitle: "A cosa serve ogni corsa della settimana",
    contentSubtitle:
      "La tabella separa volume facile, corsa costante controllata e lungo così che nessuna singola seduta debba fare tutto.",
    contentSections: [
      [
        "Due corse facili",
        "Corsa facile e recupero costruiscono continuità preservando energia.",
        [
          "Resta in ritmo conversazionale",
          "Rallenta con caldo e salite",
          "Non accumulare sedute saltate",
        ],
      ],
      [
        "Una corsa costante",
        "Uno sforzo controllato a RPE 5 sviluppa il ritmo senza diventare una gara.",
        [
          "Mantieni lo sforzo ripetibile",
          "Concludi con buona tecnica",
          "Usa l'RPE quando i riferimenti di passo sono deboli",
        ],
      ],
      [
        "Un lungo",
        "Il lungo cresce in due blocchi separati da settimane di recupero e scarico.",
        [
          "Mantieni la respirazione conversazionale",
          "Riduci nelle settimane 4 e 7",
          "Controlla l'avvio dei 5 km finali",
        ],
      ],
    ],
  },
  "pt-BR": {
    previewTitle: "Como o plano de 8 semanas para completar evolui",
    previewSubtitle:
      "Quatro corridas repetíveis por semana desenvolvem resistência contínua, recuperam nos momentos certos e fazem o polimento para os 5 km finais.",
    previewRows: [
      [
        "Semanas 1–3",
        "Construir a base",
        "Evolua o longão de 25 para 35 minutos.",
      ],
      [
        "Semana 4",
        "Absorver o trabalho",
        "Reduza o longão e mantenha todas as sessões controladas.",
      ],
      [
        "Semanas 5–6",
        "Construir novamente",
        "Chegue a um longão conversacional de 40 e depois 45 minutos.",
      ],
      [
        "Semanas 7–8",
        "Polimento e chegada",
        "Reduza a fadiga e complete os 5 km com uma largada controlada.",
      ],
    ],
    contentTitle: "Para que serve cada corrida da semana",
    contentSubtitle:
      "A planilha separa volume leve, corrida contínua controlada e longão para que nenhum treino precise fazer tudo sozinho.",
    contentSections: [
      [
        "Duas corridas leves",
        "Corrida leve e regenerativa constroem consistência preservando energia.",
        [
          "Mantenha o ritmo conversacional",
          "Desacelere no calor e nas subidas",
          "Não acumule treinos perdidos",
        ],
      ],
      [
        "Uma corrida contínua controlada",
        "Um esforço controlado em RPE 5 desenvolve ritmo sem virar uma prova.",
        [
          "Mantenha o esforço repetível",
          "Termine com boa técnica",
          "Use RPE quando houver poucos dados de ritmo",
        ],
      ],
      [
        "Um longão",
        "O longão cresce em dois blocos com semanas de recuperação e polimento entre eles.",
        [
          "Mantenha a respiração conversacional",
          "Reduza nas semanas 4 e 7",
          "Controle o início dos 5 km finais",
        ],
      ],
    ],
  },
};

export function createFiveKTrainingPlan(
  basePlan: RunningPlan,
  lang = "en",
): RunningPlan {
  const locale = planCopyLocale(lang);
  const copy = fiveKCopy[locale] ?? fiveKCopy.en;
  const templateLocale = normalizePlanTemplateLocale(lang);
  const localized = getRunPlanTemplate("finish-5k")!.copy[templateLocale];
  const details = finishFiveKDetails[locale];
  const templateMetaDescriptions: Record<PlanCopyLocale, string> = {
    en: "Free 8-week 5K training plan for runners who can already run 20–30 minutes. Four runs a week, easy volume, one steady session, and a short taper.",
    zh: "给已能连续跑 20–30 分钟的跑者：免费 8 周 5 公里训练计划，每周 4 跑，含轻松跑、受控稳定跑、长跑和赛前减量。",
    "zh-hant":
      "給已能連續跑 20–30 分鐘的跑者：免費 8 週 5 公里訓練計畫，每週 4 跑，含輕鬆跑、受控穩定跑、長跑和賽前減量。",
    ja: "20〜30分走れる人向けの無料8週間5Kプラン。週4回、イージー走、ステディ走、ロング走、短いテーパーを含みます。",
    ko: "이미 20–30분 연속으로 달릴 수 있는 러너를 위한 무료 8주 5K 훈련 플랜. 주 4회 러닝, 이지 볼륨, 제어된 스테디 세션 1회, 짧은 테이퍼링으로 구성됩니다.",
    de: "Kostenloser 8-Wochen-5-km-Trainingsplan für Läufer, die bereits 20–30 Minuten am Stück laufen. Vier Läufe pro Woche, lockerer Umfang, eine kontrollierte Einheit und kurzes Tapering.",
    fr: "Plan d'entraînement 5 km gratuit sur 8 semaines pour les coureurs capables de courir 20–30 minutes. Quatre sorties par semaine, volume facile, une séance régulière et court affûtage.",
    es: "Plan de entrenamiento 5K gratis de 8 semanas para corredores que ya pueden correr 20–30 minutos. Cuatro salidas semanales, volumen suave, una sesión constante y un breve tapering.",
    it: "Piano di allenamento 5 km gratis di 8 settimane per chi corre già 20–30 minuti. Quattro uscite a settimana, volume facile, una seduta costante e breve scarico.",
    "pt-BR":
      "Plano de treino de 5 km grátis de 8 semanas para corredores que já correm 20–30 minutos. Quatro corridas por semana, volume leve, um treino contínuo controlado e polimento curto.",
  };
  const existingRelatedLinks = copy.relatedLinks ?? basePlan.relatedLinks ?? [];
  const [firstRelated, ...restRelated] = existingRelatedLinks;
  const intermediateLinksByLocale: Record<
    PlanCopyLocale,
    [string, string, string]
  > = {
    en: [
      "Intermediate 5K training plan",
      "/5k-training-plan/intermediate",
      "Use intervals and tempo work when you have a recent 5K anchor.",
    ],
    zh: [
      "进阶 5K 训练计划",
      "/5k-training-plan/intermediate",
      "已有近期 5K 成绩时，加入更明确的间歇和节奏训练。",
    ],
    "zh-hant": [
      "進階 5K 訓練計畫",
      "/5k-training-plan/intermediate",
      "已有近期 5K 成績時，加入更明確的間歇和節奏訓練。",
    ],
    ja: [
      "中級者向け5Kトレーニングプラン",
      "/5k-training-plan/intermediate",
      "最近の5K記録があるなら、インターバルとテンポ走を加えます。",
    ],
    ko: [
      "중급 5K 훈련 플랜",
      "/5k-training-plan/intermediate",
      "최근 5K 기준 기록이 있다면 인터벌과 템포 훈련을 활용해 보세요.",
    ],
    de: [
      "5-km-Trainingsplan für Fortgeschrittene",
      "/5k-training-plan/intermediate",
      "Nutze Intervalle und Tempoläufe, wenn du ein aktuelles 5-km-Referenzergebnis hast.",
    ],
    fr: [
      "Plan d'entraînement 5 km intermédiaire",
      "/5k-training-plan/intermediate",
      "Intégrez des intervalles et du tempo si vous disposez d'un chrono récent sur 5 km.",
    ],
    es: [
      "Plan de entrenamiento 5K intermedio",
      "/5k-training-plan/intermediate",
      "Añade series y trabajo de tempo cuando tengas una referencia reciente de 5K.",
    ],
    it: [
      "Piano di allenamento 5 km intermedio",
      "/5k-training-plan/intermediate",
      "Usa ripetute e tempo run quando hai un riferimento recente sui 5 km.",
    ],
    "pt-BR": [
      "Plano de treino de 5 km intermediário",
      "/5k-training-plan/intermediate",
      "Inclua intervalados e tempo run quando tiver uma referência recente nos 5 km.",
    ],
  };
  const intermediateLink = intermediateLinksByLocale[locale];
  return {
    ...basePlan,
    ...copy,
    slug: "5k-training-plan",
    routePath: "/5k-training-plan",
    templateSlug: "finish-5k",
    title: copy.title ?? basePlan.title,
    subtitle: copy.subtitle ?? localized.description,
    promise: copy.promise ?? localized.promise,
    ...details,
    metaDescription:
      templateMetaDescriptions[locale] ?? templateMetaDescriptions.en,
    relatedLinks: mergeRelatedLinks(
      [
        ...(firstRelated ? [firstRelated] : []),
        intermediateLink,
        ...restRelated,
      ],
      productLoopRelatedLinks(lang),
    ),
  };
}

type IntermediateFiveKLocaleCopy = {
  title?: string;
  promise?: string;
  heroSubtitle: string;
  previewRows: RunningPlan["previewRows"];
  contentTitle: string;
  contentSubtitle: string;
  contentSections: NonNullable<RunningPlan["contentSections"]>;
  level: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  eyebrow: string;
  forTitle: string;
  forItems: string[];
  standardFinishLink: [string, string, string];
  faq: RunningPlan["faq"];
};

const intermediateFiveKCopyByLocale: Record<
  PlanCopyLocale,
  IntermediateFiveKLocaleCopy
> = {
  en: {
    heroSubtitle:
      "Build a stronger 5K with two easy aerobic runs, one controlled quality session and one long run each week. Odd weeks use repeatable intervals and even weeks use controlled tempo running, with an easy day separating quality from the long run. Week 4 reduces load, weeks 5–6 rebuild, week 7 tapers and week 8 ends with a 5K effort.",
    previewRows: [
      [
        "Weeks 1–3",
        "Build 5K capacity",
        "Alternate intervals and tempo while the long run reaches 50 minutes.",
      ],
      [
        "Week 4",
        "Recover",
        "Shorten the quality session and long run to absorb the first block.",
      ],
      [
        "Weeks 5–6",
        "Build again",
        "Progress to 6×2-minute intervals and a 20-minute tempo.",
      ],
      [
        "Weeks 7–8",
        "Taper and run 5K",
        "Keep a short quality touch, reduce volume, then complete the 5K.",
      ],
    ],
    contentTitle: "How this intermediate 5K plan makes speed repeatable",
    contentSubtitle:
      "There is one main quality session each week. The rest of the running absorbs that work instead of turning every day into a test.",
    contentSections: [
      [
        "Easy running protects the quality session",
        "Keep most mileage conversational so the key workout gets the rhythm and form it needs.",
        [
          "Do not chase easy-day pace",
          "Recover between quality days",
          "Reduce volume first when fatigue rises",
        ],
      ],
      [
        "Intervals make 5K pace repeatable",
        "Short repetitions accumulate time near 5K effort without turning any repeat into a sprint.",
        [
          "Use a recent result or RPE",
          "Keep repetitions even",
          "Stop adding work when form fades",
        ],
      ],
      [
        "Tempo and long runs build durability",
        "Tempo raises sustainable effort while the long run extends aerobic time for the second half of a 5K.",
        [
          "Keep tempo controlled",
          "Keep the long run easy",
          "Deload in weeks 4 and 7–8",
        ],
      ],
    ],
    level: "Intermediate",
    metaTitle: "Intermediate 5K Training Plan: Free 8-Week Schedule",
    metaDescription:
      "Free 8-week intermediate 5K plan for runners who already train four days a week. Intervals, tempo, long runs, and taper, with VDOT or RPE.",
    keywords: [
      "intermediate 5k training plan",
      "5k training plan intermediate",
      "8 week 5k improvement plan",
      "5k interval training",
      "5k tempo plan",
      "faster 5k training plan",
      "5k training plan sub 25",
    ],
    eyebrow: "8-week intermediate 5K plan",
    forTitle: "Who this intermediate 5K plan is for",
    forItems: [
      "You can consistently run four days per week.",
      "You have a recent 5K result or an adequate training base.",
      "You can protect recovery between quality sessions.",
      "You are not currently managing pain or injury that changes your gait.",
    ],
    standardFinishLink: [
      "Use the standard finish plan first",
      "/5k-training-plan",
      "Build a repeatable base first if four training days are not yet sustainable.",
    ],
    faq: [
      [
        "Is this an intermediate 5K training plan?",
        "Yes. It is for runners who already train four days a week and want faster 5K work with intervals and tempo, not a first-finish schedule.",
      ],
      [
        "How is this different from the beginner 5K plan?",
        "The beginner hub finishes a first 5K from a 20–30 minute base. This page adds clearer quality work after that base is stable. Use the finish plan first if four running days are not yet repeatable.",
      ],
      [
        "How many quality sessions are in the week?",
        "One main quality session plus easy volume and a long run. Do not stack two hard days.",
      ],
      [
        "Can this plan help me run a sub-25 5K?",
        "It can be a useful faster-5K framework if your current result is already close to 25 minutes. Set intensity from a recent 5K. If the gap is larger, complete a cycle and retest instead of forcing sub-25 pace.",
      ],
      [
        "Can AI change this intermediate plan automatically?",
        "Trainingload.ai can draft adjustments from completed runs and training load, but the calendar updates only after you confirm.",
      ],
    ],
  },
  zh: {
    heroSubtitle:
      "每周用两次轻松有氧跑、一次受控质量课和一次长跑提升 5K 表现。单数周安排可重复间歇，双数周安排受控节奏跑，并用轻松日隔开质量课和长跑。第 4 周降低负荷，第 5–6 周重新构建，第 7 周减量，第 8 周完成 5K。",
    previewRows: [
      [
        "第 1–3 周",
        "建立专项能力",
        "间歇与节奏跑交替，长跑增加至 50 分钟。",
      ],
      ["第 4 周", "恢复", "缩短质量课和长跑，吸收前三周负荷。"],
      [
        "第 5–6 周",
        "重新构建",
        "间歇增加至 6×2 分钟，节奏跑增加至 20 分钟。",
      ],
      ["第 7–8 周", "减量与 5K", "保留短质量刺激，降低总量后完成 5K。"],
    ],
    contentTitle: "进阶 5K 如何把速度练成可重复的能力",
    contentSubtitle:
      "每周只安排一堂主要质量课，其他跑量用来吸收刺激，避免把每次训练都跑成测试。",
    contentSections: [
      [
        "轻松跑保护质量课",
        "大部分跑量保持可对话强度，让你能在关键训练中完成正确的节奏与动作。",
        ["不追逐轻松跑配速", "质量课之间保留恢复", "疲劳上升时先减量"],
      ],
      [
        "间歇让 5K 配速可重复",
        "用短组数累积接近 5K 强度的时间，不把任何一组做成冲刺。",
        ["以近期成绩或 RPE 定强度", "每组保持一致", "动作走样就停止增加"],
      ],
      [
        "节奏跑与长跑建立耐力",
        "节奏跑提高可持续强度，长跑延长有氧时间，两者共同支撑比赛后半段。",
        ["节奏跑保持受控", "长跑维持轻松", "第 4、7–8 周主动减量"],
      ],
    ],
    level: "进阶",
    metaTitle: "进阶 5 公里训练计划：免费 8 周提速安排",
    metaDescription:
      "给已能稳定每周跑 4 天的跑者：免费 8 周进阶 5K 计划，含间歇、节奏跑、长跑和减量。有成绩用 VDOT，没有则用 RPE。",
    keywords: [
      "进阶 5K 训练计划",
      "5k training plan intermediate",
      "5 公里提速计划",
      "VDOT 5K",
    ],
    eyebrow: "8 周进阶 5 公里计划",
    forTitle: "这份进阶 5K 计划适合谁",
    forItems: [
      "你能稳定完成每周 4 次跑步。",
      "你有近期 5K 成绩或足够训练基线。",
      "你能在质量课之间保留恢复日。",
      "你目前没有影响跑姿的疼痛或伤病。",
    ],
    standardFinishLink: [
      "先使用标准 5K 完赛计划",
      "/5k-training-plan",
      "如果尚未稳定训练 4 天，先建立可重复的基础。",
    ],
    faq: [
      [
        "这是进阶 5 公里训练计划吗？",
        "是。给已经能稳定每周跑 4 天、想用间歇和节奏跑提高 5K 的人，不是第一次完赛课表。",
      ],
      [
        "和免费新手 5K 计划有什么不同？",
        "新手页从连续跑 20–30 分钟开始完赛。这页在基础稳定后加入更明确的质量课。还不能稳定跑 4 天时，先用 5K 完赛计划。",
      ],
      [
        "每周有几次质量课？",
        "一次主要质量课，再加轻松跑量和长跑。不要连续两天高强度。",
      ],
      [
        "这份计划能帮我跑进 25 分钟吗？",
        "如果你目前成绩已接近 25 分钟，它可以作为提速框架；请用近期 5K 成绩设置强度。若差距较大，先完成一轮并重新测试，不要直接套用过快配速。",
      ],
      [
        "智能教练会自动改这份进阶计划吗？",
        "Trainingload.ai 可以根据完成训练和训练负荷生成调整草案，但日历只有在你确认后才会更新。",
      ],
    ],
  },
  "zh-hant": {
    heroSubtitle:
      "每週用兩次輕鬆有氧跑、一次受控品質課和一次長跑提升 5K 表現。單數週安排可重複間歇，雙數週安排受控節奏跑，並用輕鬆日隔開品質課和長跑。第 4 週降低負荷，第 5–6 週重新構建，第 7 週減量，第 8 週完成 5K。",
    previewRows: [
      [
        "第 1–3 週",
        "建立專項能力",
        "間歇與節奏跑交替，長跑增加至 50 分鐘。",
      ],
      ["第 4 週", "恢復", "縮短品質課和長跑，吸收前三週負荷。"],
      [
        "第 5–6 週",
        "重新構建",
        "間歇增加至 6×2 分鐘，節奏跑增加至 20 分鐘。",
      ],
      ["第 7–8 週", "減量與 5K", "保留短品質刺激，降低總量後完成 5K。"],
    ],
    contentTitle: "進階 5K 如何把速度練成可重複的能力",
    contentSubtitle:
      "每週只安排一堂主要品質課，其他跑量用來吸收刺激，避免把每次訓練都跑成測驗。",
    contentSections: [
      [
        "輕鬆跑保護品質課",
        "大部分跑量保持可對話強度，讓你能在關鍵訓練中完成正確的節奏與動作。",
        ["不追逐輕鬆跑配速", "品質課之間保留恢復", "疲勞上升時先減量"],
      ],
      [
        "間歇讓 5K 配速可重複",
        "用短組數累積接近 5K 強度的時間，不把任何一組做成衝刺。",
        ["以近期成績或 RPE 定強度", "每組保持一致", "動作走樣就停止增加"],
      ],
      [
        "節奏跑與長跑建立耐力",
        "節奏跑提高可持續強度，長跑延長有氧時間，兩者共同支撐比賽後半段。",
        ["節奏跑保持受控", "長跑維持輕鬆", "第 4、7–8 週主動減量"],
      ],
    ],
    level: "進階",
    metaTitle: "進階 5 公里訓練計畫：免費 8 週提速安排",
    metaDescription:
      "給已能穩定每週跑 4 天的跑者：免費 8 週進階 5K 計畫，含間歇、節奏跑、長跑和減量。有成績用 VDOT，沒有則用 RPE。",
    keywords: [
      "進階 5K 訓練計畫",
      "5k training plan intermediate",
      "5 公里提速計畫",
      "VDOT 5K",
    ],
    eyebrow: "8 週進階 5 公里計畫",
    forTitle: "這份進階 5K 計畫適合誰",
    forItems: [
      "你能穩定完成每週 4 次跑步。",
      "你有近期 5K 成績或足夠訓練基線。",
      "你能在品質課之間保留恢復日。",
      "你目前沒有影響跑姿的疼痛或傷病。",
    ],
    standardFinishLink: [
      "先使用標準 5K 完賽計畫",
      "/5k-training-plan",
      "如果尚未穩定訓練 4 天，先建立可重複的基礎。",
    ],
    faq: [
      [
        "這是進階 5 公里訓練計畫嗎？",
        "是。給已經能穩定每週跑 4 天、想用間歇和節奏跑提高 5K 的人，不是第一次完賽課表。",
      ],
      [
        "和免費新手 5K 計畫有何不同？",
        "新手頁從連續跑 20–30 分鐘開始完賽。這頁在基礎穩定後加入更明確的品質課。還不能穩定跑 4 天時，先用 5K 完賽計畫。",
      ],
      [
        "每週有幾次品質課？",
        "一次主要品質課，再加輕鬆跑量和長跑。不要連續兩天高強度。",
      ],
      [
        "這份計畫能幫我跑進 25 分鐘嗎？",
        "如果你目前成績已接近 25 分鐘，它可以作為提速框架；請用近期 5K 成績設定強度。若差距較大，先完成一輪並重新測試，不要直接套用過快配速。",
      ],
      [
        "AI 會自動改這份進階計畫嗎？",
        "Trainingload.ai 可以根據完成訓練和訓練負荷產生調整草案，但日曆只有在你確認後才會更新。",
      ],
    ],
  },
  ja: {
    heroSubtitle:
      "週2回のイージー有酸素走、1回のコントロールした質の高い練習、1回のロング走で5Kの走力を伸ばします。奇数週は再現できるインターバル、偶数週はコントロールしたテンポ走を行い、質の高い練習とロング走の間にはイージー日を置きます。4週目に負荷を下げ、5〜6週目に再構築、7週目にテーパーし、8週目に5Kを走ります。",
    previewRows: [
      [
        "1〜3週目",
        "5K能力を構築",
        "インターバルとテンポを交互に行い、ロング走を50分まで伸ばします。",
      ],
      [
        "4週目",
        "回復",
        "質の高い練習とロング走を短くし、負荷に適応します。",
      ],
      ["5〜6週目", "再構築", "6×2分インターバルと20分テンポ走へ進みます。"],
      [
        "7〜8週目",
        "テーパーと5K",
        "短い刺激を残し、総量を下げて5Kを走ります。",
      ],
    ],
    contentTitle: "中級5Kでスピードを再現できる力に変える方法",
    contentSubtitle:
      "主な質練習は週1回だけにし、ほかの走行で刺激を吸収します。毎回をタイムトライアルにはしません。",
    contentSections: [
      [
        "イージーランで質練習を守る",
        "大半を会話できる強度に保ち、重要な練習で正しいリズムとフォームを再現します。",
        [
          "楽な日のペースを追わない",
          "質練習の間に回復を入れる",
          "疲労が増えたら先に量を減らす",
        ],
      ],
      [
        "インターバルで5Kペースを反復する",
        "短い反復で5Kに近い強度の時間を積み、どの反復も全力疾走にはしません。",
        [
          "最近の記録かRPEで設定",
          "各反復をそろえる",
          "フォームが崩れたら追加しない",
        ],
      ],
      [
        "テンポとロング走で持久力を作る",
        "テンポ走で持続可能な強度を高め、ロング走で有酸素時間を延ばします。",
        [
          "テンポはコントロール",
          "ロング走は楽に",
          "4週目と7〜8週目は減量",
        ],
      ],
    ],
    level: "中級",
    metaTitle: "中級者向け5Kトレーニングプラン：無料8週間",
    metaDescription:
      "週4日走れる中級者向けの無料8週間5Kプラン。インターバル、テンポ、ロング走、テーパーを含み、記録がなければRPEを使います。",
    keywords: [
      "中級者 5K トレーニングプラン",
      "5K インターバル",
      "5K テンポ走",
      "VDOT 5K",
    ],
    eyebrow: "8週間中級5Kプラン",
    forTitle: "この中級5Kプランの対象",
    forItems: [
      "週4日安定して走れます。",
      "最近の5K記録、または十分な走力の土台があります。",
      "質の高い練習の間に回復日を残せます。",
      "走姿が変わる痛みやケガはありません。",
    ],
    standardFinishLink: [
      "先に標準の5K完走プランを使う",
      "/5k-training-plan",
      "週4日がまだ安定しないなら、先に再現できる土台を作ります。",
    ],
    faq: [
      [
        "中級者向けの5Kプランですか？",
        "はい。すでに週4日走れて、インターバルとテンポで5Kを速くしたい人向けです。初完走用ではありません。",
      ],
      [
        "初心者向け5Kプランとの違いは？",
        "初心者ページは20〜30分走れる人の完走用です。このページは土台が安定した後に質の高い練習を加えます。週4日がまだ難しい場合は、先に5K完走プランを使ってください。",
      ],
      [
        "週に質の高い練習は何回ですか？",
        "メインの質練習は1回で、イージー走とロング走を組み合わせます。高強度を2日連続させないでください。",
      ],
      [
        "このプランで25分切りを狙えますか？",
        "現在の記録が25分に近ければ、スピード向上の枠組みとして使えます。最近の5K記録で強度を設定してください。差が大きい場合は、まず1サイクル終えて再テストします。",
      ],
      [
        "AIがこの中級プランを自動変更しますか？",
        "Trainingload.aiは完了した練習とトレーニング負荷から変更案を作れますが、カレンダーは確認後にだけ更新されます。",
      ],
    ],
  },
  ko: {
    title: "8주 5K 퍼포먼스 향상 플랜",
    promise:
      "유산소 일관성을 해치지 않으면서 제어된 고강도를 유지하는 능력을 키웁니다.",
    heroSubtitle:
      "매주 2회의 이지 유산소 러닝, 1회의 제어된 퀄리티 세션, 1회의 롱런으로 더 강한 5K를 만듭니다. 홀수 주에는 반복 가능한 인터벌, 짝수 주에는 제어된 템포 러닝을 배치하고 퀄리티 세션과 롱런 사이에 이지 데이를 둡니다. 4주차에 부하를 낮추고, 5–6주차에 재구축하며, 7주차 테이퍼링 후 8주차에 5K에 도전합니다.",
    previewRows: [
      [
        "1–3주차",
        "5K 능력 구축",
        "인터벌과 템포를 번갈아 진행하며 롱런을 50분까지 늘립니다.",
      ],
      [
        "4주차",
        "회복",
        "퀄리티 세션과 롱런을 줄여 첫 블록의 부하를 흡수합니다.",
      ],
      [
        "5–6주차",
        "재구축",
        "6×2분 인터벌과 20분 템포 러닝으로 발전합니다.",
      ],
      [
        "7–8주차",
        "테이퍼링과 5K",
        "짧은 퀄리티 자극만 남기고 볼륨을 줄인 뒤 5K를 완주합니다.",
      ],
    ],
    contentTitle: "이 중급 5K 플랜이 스피드를 반복 가능하게 만드는 방식",
    contentSubtitle:
      "매주 핵심 퀄리티 세션은 1회만 배치합니다. 나머지 러닝은 매일을 테스트로 만들지 않고 그 자극을 흡수하는 역할을 합니다.",
    contentSections: [
      [
        "이지 러닝이 퀄리티 세션을 보호합니다",
        "대부분의 거리를 대화 가능한 강도로 유지해야 핵심 훈련에서 올바른 리듬과 자세를 낼 수 있습니다.",
        [
          "이지 데이 페이스에 집착하지 않기",
          "퀄리티 데이 사이에 충분히 회복하기",
          "피로가 오르면 볼륨부터 줄이기",
        ],
      ],
      [
        "인터벌이 5K 페이스를 반복 가능하게 합니다",
        "짧은 반복주로 어느 한 세트도 전력 질주로 만들지 않으면서 5K 강도에 가까운 시간을 누적합니다.",
        [
          "최근 기록 또는 RPE로 강도 설정",
          "각 반복을 고르게 유지하기",
          "자세가 무너지면 추가하지 않기",
        ],
      ],
      [
        "템포와 롱런이 지구력을 키웁니다",
        "템포 러닝은 지속 가능한 강도를 높이고, 롱런은 5K 후반부를 버틸 유산소 시간을 확장합니다.",
        [
          "템포는 제어된 강도로 유지",
          "롱런은 편하게 달리기",
          "4주차와 7–8주차에 부하 줄이기",
        ],
      ],
    ],
    level: "중급",
    metaTitle: "중급 5K 훈련 플랜: 무료 8주 기록 향상 스케줄",
    metaDescription:
      "이미 주 4일 훈련하는 러너를 위한 무료 8주 중급 5K 플랜. 인터벌, 템포, 롱런, 테이퍼링이 포함되며 VDOT 또는 RPE로 강도를 설정합니다.",
    keywords: [
      "중급 5K 훈련 플랜",
      "5k training plan intermediate",
      "8주 5K 기록 단축 플랜",
      "5K 인터벌 훈련",
      "5K 템포 플랜",
      "VDOT 5K",
    ],
    eyebrow: "8주 중급 5K 플랜",
    forTitle: "이 중급 5K 플랜이 적합한 러너",
    forItems: [
      "주 4일 러닝을 꾸준히 소화할 수 있습니다.",
      "최근 5K 기록 또는 충분한 훈련 기반을 갖추고 있습니다.",
      "퀄리티 세션 사이에 회복일을 지킬 수 있습니다.",
      "현재 러닝 보행을 바꾸는 통증이나 부상이 없습니다.",
    ],
    standardFinishLink: [
      "먼저 표준 5K 완주 플랜 사용하기",
      "/5k-training-plan",
      "주 4일 훈련이 아직 안정적이지 않다면 먼저 반복 가능한 기반을 다지세요.",
    ],
    faq: [
      [
        "이 플랜은 중급 5K 훈련 플랜인가요?",
        "네. 이미 주 4일 훈련하고 있으며 인터벌과 템포로 더 빠른 5K를 목표로 하는 러너를 위한 플랜으로, 첫 완주용 스케줄은 아닙니다.",
      ],
      [
        "초보자 5K 플랜과 무엇이 다른가요?",
        "초보자 허브는 20–30분 연속 러닝 기반에서 첫 5K 완주를 돕습니다. 이 페이지는 기반이 안정된 뒤 더 명확한 퀄리티 훈련을 추가합니다. 주 4일 러닝이 아직 반복하기 어렵다면 완주 플랜부터 시작하세요.",
      ],
      [
        "일주일에 퀄리티 세션은 몇 회인가요?",
        "핵심 퀄리티 세션 1회에 이지 볼륨과 롱런을 더합니다. 강한 훈련을 이틀 연속 배치하지 마세요.",
      ],
      [
        "이 플랜으로 5K 25분 이내 기록을 노릴 수 있나요?",
        "현재 기록이 이미 25분에 가깝다면 기록 단축 프레임워크로 유용합니다. 최근 5K 기록으로 강도를 설정하세요. 격차가 크다면 무리하게 25분 페이스를 밀어붙이지 말고 한 주기를 마친 뒤 다시 측정하세요.",
      ],
      [
        "AI가 이 중급 플랜을 자동으로 변경하나요?",
        "Trainingload.ai는 완료한 러닝과 훈련 부하를 바탕으로 조정안을 작성할 수 있지만, 캘린더는 확인 후에만 업데이트됩니다.",
      ],
    ],
  },
  de: {
    title: "8-Wochen-5-km-Leistungsplan",
    promise:
      "Verbessere deine Fähigkeit, ein kontrolliert hohes Tempo zu halten, ohne die aerobe Konstanz zu verlieren.",
    heroSubtitle:
      "Baue jede Woche mit zwei lockeren aeroben Läufen, einer kontrollierten Qualitätseinheit und einem Long Run mehr Stärke für 5 km auf. Ungerade Wochen setzen auf wiederholbare Intervalle, gerade Wochen auf kontrollierte Tempoläufe – getrennt vom Long Run durch einen lockeren Tag. Woche 4 reduziert die Belastung, Wochen 5–6 bauen neu auf, Woche 7 tapert und Woche 8 endet mit einem 5-km-Test oder Wettkampf.",
    previewRows: [
      [
        "Wochen 1–3",
        "5-km-Kapazität aufbauen",
        "Wechsle Intervalle und Tempoläufe ab, während der Long Run auf 50 Minuten anwächst.",
      ],
      [
        "Woche 4",
        "Erholen",
        "Verkürze Qualitätseinheit und Long Run, um den ersten Block zu verarbeiten.",
      ],
      [
        "Wochen 5–6",
        "Erneut aufbauen",
        "Steigere auf 6×2-Minuten-Intervalle und einen 20-Minuten-Tempolauf.",
      ],
      [
        "Wochen 7–8",
        "Tapering und 5 km laufen",
        "Setze einen kurzen Qualitätsimpuls, reduziere den Umfang und absolviere die 5 km.",
      ],
    ],
    contentTitle: "Wie dieser 5-km-Plan für Fortgeschrittene Tempo wiederholbar macht",
    contentSubtitle:
      "Pro Woche gibt es genau eine Haupt-Qualitätseinheit. Die übrigen Läufe verarbeiten diesen Reiz, statt jeden Tag in einen Leistungstest zu verwandeln.",
    contentSections: [
      [
        "Lockere Läufe schützen die Qualitätseinheit",
        "Laufe den Großteil der Kilometer im Gesprächstempo, damit die Schlüsseleinheit mit sauberem Rhythmus und guter Technik gelingt.",
        [
          "Kein Tempo an lockeren Tagen jagen",
          "Zwischen Qualitätstagen erholen",
          "Bei steigender Ermüdung zuerst den Umfang reduzieren",
        ],
      ],
      [
        "Intervalle machen 5-km-Tempo wiederholbar",
        "Kurze Wiederholungen sammeln Zeit nahe am 5-km-Aufwand, ohne einzelne Abschnitte zum Sprint zu machen.",
        [
          "Aktuelles Ergebnis oder RPE nutzen",
          "Wiederholungen gleichmäßig halten",
          "Belastung stoppen, wenn die Technik nachlässt",
        ],
      ],
      [
        "Tempoläufe und Long Runs schaffen Belastbarkeit",
        "Tempoläufe erhöhen die nachhaltige Intensität, während der Long Run die aerobe Basis für die zweite Hälfte der 5 km stärkt.",
        [
          "Tempolauf kontrolliert halten",
          "Long Run locker laufen",
          "In Woche 4 und 7–8 entlasten",
        ],
      ],
    ],
    level: "Fortgeschrittene",
    metaTitle: "5-km-Trainingsplan für Fortgeschrittene: Kostenloser 8-Wochen-Plan",
    metaDescription:
      "Kostenloser 8-Wochen-Plan für fortgeschrittene 5-km-Läufer mit vier Lauftagen pro Woche. Intervalle, Tempoläufe, Long Runs und Tapering – gesteuert über VDOT oder RPE.",
    keywords: [
      "5 km Trainingsplan Fortgeschrittene",
      "5k training plan intermediate",
      "8 Wochen 5 km schneller werden",
      "5 km Intervalltraining",
      "5 km Tempolauf Plan",
      "VDOT 5K",
    ],
    eyebrow: "8-Wochen-5-km-Plan für Fortgeschrittene",
    forTitle: "Für wen dieser 5-km-Plan für Fortgeschrittene geeignet ist",
    forItems: [
      "Du kannst konstant vier Tage pro Woche laufen.",
      "Du hast ein aktuelles 5-km-Ergebnis oder eine solide Trainingsbasis.",
      "Du kannst die Erholung zwischen Qualitätseinheiten einhalten.",
      "Du hast aktuell keine Schmerzen oder Verletzungen, die deinen Laufstil verändern.",
    ],
    standardFinishLink: [
      "Zuerst den Standard-5-km-Finisher-Plan nutzen",
      "/5k-training-plan",
      "Baue zuerst eine wiederholbare Basis auf, wenn vier Trainingstage noch nicht stabil machbar sind.",
    ],
    faq: [
      [
        "Ist das ein 5-km-Trainingsplan für Fortgeschrittene?",
        "Ja. Er richtet sich an Läufer, die bereits vier Tage pro Woche trainieren und mit Intervallen sowie Tempoläufen schneller über 5 km werden möchten – kein Einsteigerplan.",
      ],
      [
        "Worin unterscheidet er sich vom Einsteiger-5-km-Plan?",
        "Der Einsteigerplan führt ab einer Basis von 20–30 Minuten sicher ins erste 5-km-Ziel. Dieser Plan ergänzt gezielte Qualitätseinheiten auf stabiler Basis. Wenn vier Lauftage noch nicht verlässlich klappen, starte mit dem Finisher-Plan.",
      ],
      [
        "Wie viele Qualitätseinheiten stehen pro Woche an?",
        "Eine Haupt-Qualitätseinheit plus lockerer Umfang und ein Long Run. Lege keine zwei harten Tage direkt hintereinander.",
      ],
      [
        "Hilft mir dieser Plan unter 25 Minuten über 5 km?",
        "Er bietet ein gutes Gerüst für schnellere 5 km, wenn dein aktuelles Ergebnis bereits nahe an 25 Minuten liegt. Richte die Intensität an einer aktuellen 5-km-Zeit aus. Ist der Abstand größer, absolviere erst einen Zyklus und teste erneut.",
      ],
      [
        "Ändert die KI diesen Plan automatisch?",
        "Trainingload.ai erstellt Anpassungsvorschläge aus deinen absolvierten Läufen und der Trainingsbelastung, aktualisiert den Kalender aber erst nach deiner Bestätigung.",
      ],
    ],
  },
  fr: {
    title: "Plan performance 5 km sur 8 semaines",
    promise:
      "Développez votre capacité à soutenir un effort élevé maîtrisé sans sacrifier la régularité aérobie.",
    heroSubtitle:
      "Construisez un 5 km plus solide chaque semaine avec deux sorties faciles en aérobie, une séance de qualité contrôlée et une sortie longue. Les semaines impaires proposent des intervalles répétables et les semaines paires un tempo maîtrisé, séparés de la sortie longue par un jour facile. La semaine 4 allège la charge, les semaines 5–6 relancent la progression, la semaine 7 affûte et la semaine 8 se conclut par un 5 km.",
    previewRows: [
      [
        "Semaines 1–3",
        "Construire la capacité 5 km",
        "Alternez intervalles et tempo tandis que la sortie longue atteint 50 minutes.",
      ],
      [
        "Semaine 4",
        "Récupérer",
        "Raccourcissez la séance de qualité et la sortie longue pour assimiler le premier bloc.",
      ],
      [
        "Semaines 5–6",
        "Reprendre la progression",
        "Passez à 6×2 minutes d'intervalles et un tempo de 20 minutes.",
      ],
      [
        "Semaines 7–8",
        "Affûtage et 5 km",
        "Conservez un court rappel de qualité, réduisez le volume puis courez votre 5 km.",
      ],
    ],
    contentTitle: "Comment ce plan 5 km intermédiaire rend la vitesse répétable",
    contentSubtitle:
      "Le programme comporte une seule séance de qualité principale par semaine. Le reste du volume sert à assimiler ce travail plutôt qu'à transformer chaque sortie en test.",
    contentSections: [
      [
        "L'endurance facile protège la séance clé",
        "Gardez l'essentiel du volume en aisance respiratoire pour aborder la séance clé avec le bon rythme et une foulée propre.",
        [
          "Ne pas chasser l'allure les jours faciles",
          "Récupérer entre les séances de qualité",
          "Réduire d'abord le volume si la fatigue monte",
        ],
      ],
      [
        "Les intervalles rendent l'allure 5 km répétable",
        "Des répétitions courtes accumulent du temps proche de l'effort 5 km sans transformer aucune fraction en sprint.",
        [
          "S'appuyer sur un chrono récent ou le RPE",
          "Garder des répétitions régulières",
          "Arrêter d'ajouter du volume dès que la technique baisse",
        ],
      ],
      [
        "Le tempo et la sortie longue renforcent l'endurance",
        "Le tempo élève l'effort soutenable tandis que la sortie longue prolonge le temps aérobie pour la seconde moitié du 5 km.",
        [
          "Garder le tempo sous contrôle",
          "Garder la sortie longue facile",
          "Alléger aux semaines 4 et 7–8",
        ],
      ],
    ],
    level: "Intermédiaire",
    metaTitle: "Plan d'entraînement 5 km intermédiaire : programme gratuit 8 semaines",
    metaDescription:
      "Plan 5 km intermédiaire gratuit sur 8 semaines pour coureurs s'entraînant déjà quatre jours par semaine. Intervalles, tempo, sorties longues et affûtage avec VDOT ou RPE.",
    keywords: [
      "plan 5 km intermédiaire",
      "5k training plan intermediate",
      "plan progression 5 km 8 semaines",
      "fractionné 5 km",
      "tempo 5 km",
      "VDOT 5K",
    ],
    eyebrow: "Plan 5 km intermédiaire sur 8 semaines",
    forTitle: "À qui s'adresse ce plan 5 km intermédiaire",
    forItems: [
      "Vous courez déjà régulièrement quatre jours par semaine.",
      "Vous disposez d'un chrono récent sur 5 km ou d'une base d'entraînement solide.",
      "Vous pouvez préserver la récupération entre les séances de qualité.",
      "Vous ne présentez actuellement ni douleur ni blessure modifiant votre foulée.",
    ],
    standardFinishLink: [
      "Commencer par le plan 5 km standard",
      "/5k-training-plan",
      "Construisez d'abord une base répétable si quatre jours d'entraînement ne sont pas encore durables.",
    ],
    faq: [
      [
        "Est-ce un plan d'entraînement 5 km intermédiaire ?",
        "Oui. Il s'adresse aux coureurs qui s'entraînent déjà quatre jours par semaine et veulent progresser sur 5 km grâce aux intervalles et au tempo, pas à un premier finish.",
      ],
      [
        "Quelle est la différence avec le plan 5 km débutant ?",
        "Le plan débutant permet de boucler un premier 5 km à partir d'une base de 20–30 minutes. Cette page ajoute un travail de qualité plus net une fois cette base stable. Commencez par le plan finish si quatre sorties hebdomadaires ne sont pas encore acquises.",
      ],
      [
        "Combien de séances de qualité comporte une semaine ?",
        "Une séance de qualité principale, complétée par du volume facile et une sortie longue. N'enchaînez pas deux journées intenses.",
      ],
      [
        "Ce plan peut-il m'aider à passer sous les 25 minutes au 5 km ?",
        "Il constitue un bon cadre de progression si votre chrono actuel est déjà proche de 25 minutes. Réglez l'intensité d'après un 5 km récent. Si l'écart est plus grand, bouclez un cycle puis retestez plutôt que de forcer l'allure.",
      ],
      [
        "L'IA modifie-t-elle ce plan intermédiaire automatiquement ?",
        "Trainingload.ai peut proposer des ajustements à partir des sorties réalisées et de la charge d'entraînement, mais le calendrier n'est mis à jour qu'après votre confirmation.",
      ],
    ],
  },
  es: {
    title: "Plan de rendimiento 5K de 8 semanas",
    promise:
      "Mejora tu capacidad para sostener un esfuerzo exigente controlado sin sacrificar la constancia aeróbica.",
    heroSubtitle:
      "Construye un 5K más sólido cada semana con dos rodajes aeróbicos suaves, una sesión de calidad controlada y una tirada larga. Las semanas impares incluyen series repetibles y las pares un tempo controlado, con un día suave entre la calidad y la tirada larga. La semana 4 descarga, las semanas 5–6 vuelven a construir, la semana 7 aplica tapering y la semana 8 culmina con un 5K.",
    previewRows: [
      [
        "Semanas 1–3",
        "Construir capacidad de 5K",
        "Alterna series y tempo mientras la tirada larga alcanza los 50 minutos.",
      ],
      [
        "Semana 4",
        "Recuperar",
        "Acorta la sesión de calidad y la tirada larga para asimilar el primer bloque.",
      ],
      [
        "Semanas 5–6",
        "Volver a construir",
        "Avanza hasta series de 6×2 minutos y un tempo de 20 minutos.",
      ],
      [
        "Semanas 7–8",
        "Tapering y correr 5K",
        "Mantén un breve toque de calidad, reduce volumen y completa el 5K.",
      ],
    ],
    contentTitle: "Cómo hace repetible la velocidad este plan de 5K intermedio",
    contentSubtitle:
      "Hay una única sesión principal de calidad por semana. El resto de los rodajes sirve para asimilar ese estímulo en lugar de convertir cada día en un examen.",
    contentSections: [
      [
        "Los rodajes suaves protegen la sesión de calidad",
        "Mantén conversacional la mayor parte del kilometraje para llegar a la sesión clave con buen ritmo y técnica.",
        [
          "No persigas ritmos en días suaves",
          "Recupera entre días de calidad",
          "Reduce primero el volumen cuando suba la fatiga",
        ],
      ],
      [
        "Las series hacen repetible el ritmo de 5K",
        "Repeticiones cortas acumulan tiempo cerca del esfuerzo de 5K sin convertir ninguna serie en un esprint.",
        [
          "Usa una marca reciente o RPE",
          "Mantén las repeticiones homogéneas",
          "Deja de sumar trabajo cuando decaiga la técnica",
        ],
      ],
      [
        "El tempo y la tirada larga aportan resistencia",
        "El tempo eleva el esfuerzo sostenible y la tirada larga amplía el tiempo aeróbico para la segunda mitad del 5K.",
        [
          "Mantén el tempo controlado",
          "Corre suave la tirada larga",
          "Descarga en las semanas 4 y 7–8",
        ],
      ],
    ],
    level: "Intermedio",
    metaTitle: "Plan de entrenamiento 5K intermedio: calendario gratis de 8 semanas",
    metaDescription:
      "Plan de 5K intermedio gratis de 8 semanas para corredores que ya entrenan cuatro días a la semana. Series, tempo, tiradas largas y tapering con VDOT o RPE.",
    keywords: [
      "plan de entrenamiento 5k intermedio",
      "5k training plan intermediate",
      "plan mejorar 5k 8 semanas",
      "series 5k",
      "plan tempo 5k",
      "VDOT 5K",
    ],
    eyebrow: "Plan de 5K intermedio de 8 semanas",
    forTitle: "Para quién es este plan de 5K intermedio",
    forItems: [
      "Puedes correr de forma constante cuatro días por semana.",
      "Tienes una marca reciente de 5K o una base de entrenamiento adecuada.",
      "Puedes proteger la recuperación entre sesiones de calidad.",
      "Actualmente no tienes dolor ni lesión que altere tu pisada.",
    ],
    standardFinishLink: [
      "Usa primero el plan estándar de 5K",
      "/5k-training-plan",
      "Construye antes una base repetible si aún no sostienes cuatro días de entrenamiento.",
    ],
    faq: [
      [
        "¿Es este un plan de entrenamiento 5K intermedio?",
        "Sí. Está pensado para corredores que ya entrenan cuatro días a la semana y buscan mejorar su 5K con series y tempo, no para un primer debut.",
      ],
      [
        "¿En qué se diferencia del plan de 5K para principiantes?",
        "El plan para principiantes lleva de una base de 20–30 minutos a terminar tu primer 5K. Esta página añade trabajo de calidad más definido sobre una base estable. Usa primero el plan de inicio si todavía no repites cuatro días semanales.",
      ],
      [
        "¿Cuántas sesiones de calidad hay por semana?",
        "Una sesión principal de calidad, además de volumen suave y una tirada larga. No encadenes dos días exigentes.",
      ],
      [
        "¿Puede ayudarme este plan a bajar de 25 minutos en 5K?",
        "Es una buena estructura si tu marca actual ya está cerca de 25 minutos. Ajusta la intensidad con un 5K reciente. Si la diferencia es mayor, completa un ciclo y vuelve a evaluarte en lugar de forzar ese ritmo.",
      ],
      [
        "¿La IA cambia este plan intermedio automáticamente?",
        "Trainingload.ai puede preparar ajustes a partir de tus carreras completadas y la carga de entrenamiento, pero el calendario solo se actualiza cuando lo confirmas.",
      ],
    ],
  },
  it: {
    title: "Piano performance 5 km di 8 settimane",
    promise:
      "Migliora la capacità di sostenere uno sforzo intenso controllato senza sacrificare la continuità aerobica.",
    heroSubtitle:
      "Costruisci una 5 km più solida ogni settimana con due corse aerobiche facili, una seduta di qualità controllata e un lungo. Le settimane dispari usano ripetute ripetibili e le settimane pari una tempo run controllata, con un giorno facile tra qualità e lungo. La settimana 4 riduce il carico, le settimane 5–6 ricostruiscono, la settimana 7 scarica e la settimana 8 si conclude con una 5 km.",
    previewRows: [
      [
        "Settimane 1–3",
        "Costruire capacità sui 5 km",
        "Alterna ripetute e tempo run mentre il lungo raggiunge i 50 minuti.",
      ],
      [
        "Settimana 4",
        "Recuperare",
        "Accorcia la seduta di qualità e il lungo per assorbire il primo blocco.",
      ],
      [
        "Settimane 5–6",
        "Costruire di nuovo",
        "Passa a 6×2 minuti di ripetute e a una tempo run di 20 minuti.",
      ],
      [
        "Settimane 7–8",
        "Scarico e 5 km",
        "Mantieni un breve richiamo di qualità, riduci il volume e corri i 5 km.",
      ],
    ],
    contentTitle: "Come questo piano 5 km intermedio rende la velocità ripetibile",
    contentSubtitle:
      "C'è una sola seduta principale di qualità a settimana. Il resto della corsa serve ad assorbire quel lavoro invece di trasformare ogni uscita in un test.",
    contentSections: [
      [
        "La corsa facile protegge la seduta di qualità",
        "Mantieni la maggior parte dei chilometri in respirazione agevole così l'allenamento chiave avrà ritmo e tecnica corretti.",
        [
          "Non inseguire il passo nei giorni facili",
          "Recupera tra le giornate di qualità",
          "Riduci prima il volume quando cresce la fatica",
        ],
      ],
      [
        "Le ripetute rendono ripetibile il ritmo 5 km",
        "Ripetizioni brevi accumulano tempo vicino allo sforzo 5 km senza trasformare alcuna prova in uno sprint.",
        [
          "Usa un risultato recente o l'RPE",
          "Mantieni regolari le ripetizioni",
          "Smetti di aggiungere lavoro se la tecnica cala",
        ],
      ],
      [
        "Tempo run e lungo costruiscono tenuta",
        "La tempo run innalza lo sforzo sostenibile mentre il lungo estende la base aerobica per la seconda metà dei 5 km.",
        [
          "Mantieni controllata la tempo run",
          "Corri facile il lungo",
          "Scarica nelle settimane 4 e 7–8",
        ],
      ],
    ],
    level: "Intermedio",
    metaTitle: "Piano di allenamento 5 km intermedio: tabella gratis di 8 settimane",
    metaDescription:
      "Piano 5 km intermedio gratis di 8 settimane per chi si allena già quattro giorni a settimana. Ripetute, tempo run, lunghi e scarico con VDOT o RPE.",
    keywords: [
      "piano allenamento 5 km intermedio",
      "5k training plan intermediate",
      "piano miglioramento 5 km 8 settimane",
      "ripetute 5 km",
      "tempo run 5 km",
      "VDOT 5K",
    ],
    eyebrow: "Piano 5 km intermedio di 8 settimane",
    forTitle: "A chi è adatto questo piano 5 km intermedio",
    forItems: [
      "Riesci a correre con continuità quattro giorni a settimana.",
      "Hai un risultato recente sui 5 km o una base di allenamento adeguata.",
      "Riesci a proteggere il recupero tra le sedute di qualità.",
      "Al momento non hai dolori o infortuni che alterano la falcata.",
    ],
    standardFinishLink: [
      "Usa prima il piano standard per completare i 5 km",
      "/5k-training-plan",
      "Costruisci prima una base ripetibile se quattro giorni di allenamento non sono ancora sostenibili.",
    ],
    faq: [
      [
        "È un piano di allenamento 5 km intermedio?",
        "Sì. È pensato per chi si allena già quattro giorni a settimana e vuole migliorare i 5 km con ripetute e tempo run, non per il primo traguardo.",
      ],
      [
        "In cosa differisce dal piano 5 km per principianti?",
        "Il piano principianti porta da una base di 20–30 minuti a finire la prima 5 km. Questa pagina aggiunge qualità più definita su una base stabile. Usa prima il piano standard se quattro uscite a settimana non sono ancora regolari.",
      ],
      [
        "Quante sedute di qualità ci sono a settimana?",
        "Una seduta principale di qualità, più volume facile e un lungo. Non programmare due giornate dure di fila.",
      ],
      [
        "Questo piano può aiutarmi a scendere sotto i 25 minuti nei 5 km?",
        "Può essere una struttura valida se il tuo risultato attuale è già vicino ai 25 minuti. Imposta l'intensità da una 5 km recente. Se il divario è maggiore, completa un ciclo e ripeti il test invece di forzare il passo.",
      ],
      [
        "L'AI modifica automaticamente questo piano intermedio?",
        "Trainingload.ai può preparare aggiustamenti dalle corse completate e dal carico di allenamento, ma il calendario si aggiorna solo dopo la tua conferma.",
      ],
    ],
  },
  "pt-BR": {
    title: "Plano de performance 5 km de 8 semanas",
    promise:
      "Melhore a capacidade de sustentar um esforço forte controlado sem sacrificar a consistência aeróbica.",
    heroSubtitle:
      "Construa um 5 km mais forte toda semana com duas corridas aeróbicas leves, uma sessão de qualidade controlada e um longão. Semanas ímpares trazem intervalados repetíveis e semanas pares trazem tempo run controlado, com um dia leve separando a qualidade do longão. A semana 4 reduz a carga, as semanas 5–6 reconstroem, a semana 7 faz o polimento e a semana 8 termina com um 5 km.",
    previewRows: [
      [
        "Semanas 1–3",
        "Construir capacidade para 5 km",
        "Alterne intervalados e tempo run enquanto o longão chega a 50 minutos.",
      ],
      [
        "Semana 4",
        "Recuperar",
        "Encurte a sessão de qualidade e o longão para absorver o primeiro bloco.",
      ],
      [
        "Semanas 5–6",
        "Construir novamente",
        "Evolua para intervalados de 6×2 minutos e tempo run de 20 minutos.",
      ],
      [
        "Semanas 7–8",
        "Polimento e 5 km",
        "Mantenha um estímulo curto de qualidade, reduza o volume e complete os 5 km.",
      ],
    ],
    contentTitle: "Como este plano intermediário de 5 km torna a velocidade repetível",
    contentSubtitle:
      "Há apenas uma sessão principal de qualidade por semana. O restante do volume absorve esse estímulo em vez de transformar todo dia em um teste.",
    contentSections: [
      [
        "Corridas leves protegem a sessão de qualidade",
        "Mantenha a maior parte do volume em ritmo conversacional para que o treino-chave tenha o ritmo e a técnica certos.",
        [
          "Não persiga ritmo em dias leves",
          "Recupere entre sessões de qualidade",
          "Reduza primeiro o volume se a fadiga aumentar",
        ],
      ],
      [
        "Intervalados tornam o ritmo de 5 km repetível",
        "Repetições curtas acumulam tempo perto do esforço de 5 km sem transformar nenhuma repetição em sprint.",
        [
          "Use um resultado recente ou RPE",
          "Mantenha as repetições uniformes",
          "Pare de adicionar volume se a técnica cair",
        ],
      ],
      [
        "Tempo run e longão constroem resistência",
        "O tempo run eleva o esforço sustentável enquanto o longão amplia o tempo aeróbico para a segunda metade dos 5 km.",
        [
          "Mantenha o tempo run controlado",
          "Corra o longão em ritmo leve",
          "Reduza a carga nas semanas 4 e 7–8",
        ],
      ],
    ],
    level: "Intermediário",
    metaTitle: "Plano de treino de 5 km intermediário: planilha grátis de 8 semanas",
    metaDescription:
      "Plano intermediário grátis de 8 semanas para 5 km voltado a quem já treina quatro dias por semana. Intervalados, tempo run, longões e polimento com VDOT ou RPE.",
    keywords: [
      "plano de treino 5 km intermediário",
      "5k training plan intermediate",
      "plano evoluir 5 km 8 semanas",
      "treino intervalado 5 km",
      "tempo run 5 km",
      "VDOT 5K",
    ],
    eyebrow: "Plano intermediário de 5 km de 8 semanas",
    forTitle: "Para quem é este plano intermediário de 5 km",
    forItems: [
      "Você consegue correr com regularidade quatro dias por semana.",
      "Você tem um resultado recente nos 5 km ou uma base de treino adequada.",
      "Você consegue preservar a recuperação entre sessões de qualidade.",
      "Você não está lidando atualmente com dor ou lesão que altere sua passada.",
    ],
    standardFinishLink: [
      "Use primeiro o plano padrão de 5 km",
      "/5k-training-plan",
      "Construa primeiro uma base repetível se quatro dias de treino ainda não forem sustentáveis.",
    ],
    faq: [
      [
        "Este é um plano de treino de 5 km intermediário?",
        "Sim. É voltado a corredores que já treinam quatro dias por semana e buscam evoluir nos 5 km com intervalados e tempo run, não para a primeira conclusão.",
      ],
      [
        "Qual é a diferença para o plano iniciante de 5 km?",
        "O plano iniciante leva de uma base de 20–30 minutos até completar os primeiros 5 km. Esta página adiciona qualidade mais clara sobre uma base estável. Use primeiro o plano padrão se quatro corridas semanais ainda não forem repetíveis.",
      ],
      [
        "Quantas sessões de qualidade existem na semana?",
        "Uma sessão principal de qualidade, além de volume leve e um longão. Não empilhe dois dias fortes seguidos.",
      ],
      [
        "Este plano pode me ajudar a correr 5 km abaixo de 25 minutos?",
        "Pode ser uma ótima estrutura se seu tempo atual já estiver próximo de 25 minutos. Defina a intensidade por um 5 km recente. Se a diferença for maior, complete um ciclo e refaça o teste em vez de forçar o ritmo.",
      ],
      [
        "A IA altera este plano intermediário automaticamente?",
        "O Trainingload.ai pode preparar ajustes a partir das corridas concluídas e da carga de treino, mas o calendário só muda após sua confirmação.",
      ],
    ],
  },
};

export function createIntermediateFiveKPlan(
  basePlan: RunningPlan,
  lang = "en",
): RunningPlan {
  const finish = createFiveKTrainingPlan(basePlan, lang);
  const locale = planCopyLocale(lang);
  const sourceCopy = fiveKCopy[locale] ?? fiveKCopy.en;
  const localized =
    getRunPlanTemplate("improve-5k")!.copy[normalizePlanTemplateLocale(lang)];
  const copy = intermediateFiveKCopyByLocale[locale];
  return {
    ...finish,
    slug: "5k-training-plan-intermediate",
    routePath: "/5k-training-plan/intermediate",
    templateSlug: "improve-5k",
    level: copy.level,
    metaTitle: copy.metaTitle,
    metaDescription: copy.metaDescription,
    keywords: copy.keywords,
    eyebrow: copy.eyebrow,
    title: copy.title ?? localized.title,
    subtitle: copy.heroSubtitle,
    promise: copy.promise ?? localized.promise,
    previewTitle: sourceCopy.previewTitle ?? finish.previewTitle,
    previewSubtitle: sourceCopy.previewSubtitle ?? finish.previewSubtitle,
    previewRows: copy.previewRows,
    planChooser: createFiveKPlanChooser(lang, "intermediate"),
    contentTitle: copy.contentTitle,
    contentSubtitle: copy.contentSubtitle,
    contentSections: copy.contentSections,
    forTitle: copy.forTitle,
    forItems: copy.forItems,
    relatedLinks: mergeRelatedLinks(
      [copy.standardFinishLink],
      productLoopRelatedLinks(lang),
    ),
    faq: copy.faq,
  };
}

export function createHalfMarathonTrainingPlan(
  basePlan: RunningPlan,
  lang = "en",
): RunningPlan {
  return {
    ...basePlan,
    slug: "half-marathon-training-plan",
    routePath: "/half-marathon-training-plan",
    templateSlug: "finish-half-marathon",
    planChooser: createRaceDistancePlanChooser(lang, "half-marathon"),
    howToTotalTime: isHalfMarathonIndexedLocale(lang)
      ? HALF_MARATHON_PLAN_FACTS.howToTotalTime
      : basePlan.howToTotalTime,
    relatedLinks: mergeRelatedLinks(
      basePlan.relatedLinks,
      productLoopRelatedLinks(lang),
    ),
  };
}

export function createMarathonTrainingPlan(
  basePlan: RunningPlan,
  lang = "en",
): RunningPlan {
  return {
    ...basePlan,
    slug: "marathon-training-plan",
    routePath: "/marathon-training-plan",
    templateSlug: "finish-marathon",
    planChooser: createRaceDistancePlanChooser(lang, "marathon"),
    howToTotalTime: isMarathonIndexedLocale(lang)
      ? MARATHON_PLAN_FACTS.howToTotalTime
      : basePlan.howToTotalTime,
    relatedLinks: mergeRelatedLinks(
      basePlan.relatedLinks,
      productLoopRelatedLinks(lang),
    ),
  };
}

export function createTenKTrainingPlan(
  basePlan: RunningPlan,
  lang = "en",
): RunningPlan {
  return {
    ...basePlan,
    slug: "10k-training-plan",
    routePath: "/10k-training-plan",
    templateSlug: "finish-10k",
    planChooser: createRaceDistancePlanChooser(lang, "10k"),
    howToTotalTime: isTenKIndexedLocale(lang)
      ? TEN_K_PLAN_FACTS.howToTotalTime
      : basePlan.howToTotalTime,
    relatedLinks: mergeRelatedLinks(
      basePlan.relatedLinks,
      productLoopRelatedLinks(lang),
    ),
  };
}

export function createDistanceTrainingPlan(
  basePlan: RunningPlan,
  lang = "en",
): RunningPlan {
  if (basePlan.slug === "5k-training-plan") {
    return createFiveKTrainingPlan(basePlan, lang);
  }
  if (basePlan.slug === "10k-training-plan") {
    return createTenKTrainingPlan(basePlan, lang);
  }
  if (basePlan.slug === "half-marathon-training-plan") {
    return createHalfMarathonTrainingPlan(basePlan, lang);
  }
  if (basePlan.slug === "marathon-training-plan") {
    return createMarathonTrainingPlan(basePlan, lang);
  }
  return {
    ...basePlan,
    relatedLinks: mergeRelatedLinks(
      basePlan.relatedLinks,
      productLoopRelatedLinks(lang),
    ),
    routePath: `/${basePlan.slug}`,
  };
}

export type RunningPlanPageLabels = {
  home: string;
  plans: string;
  runningPlan: string;
  timeline: string;
  level: string;
  volume: string;
  faqTitleSuffix: string;
  faqSubtitle: string;
  finalTitle: string;
  finalText: string;
  viewFullSchedule: string;
  addToCalendar: string;
};

export type PlanCollectionCopy = {
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  eyebrow: string;
  title: string;
  subtitle: string;
  primary: string;
  secondary: string;
  groupTitle: string;
  groupSubtitle: string;
  cardPrimary: string;
  cardSecondary: string;
  differenceTitle: string;
  differences: Array<[string, string]>;
  trustItems?: string[];
  faqTitle?: string;
  faqSubtitle?: string;
  faq?: Array<[string, string]>;
};
