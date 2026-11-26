import type { Metadata } from "next";
import Script from "next/script";
import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  Gauge,
  Route,
} from "lucide-react";
import {
  getPlanTemplateIntensityGuidance,
  getPlanTemplateVariant,
  getRunPlanTemplate,
  normalizePlanTemplateLocale,
  publicExampleCapability,
  resolveRunningWorkoutIntensity,
} from "@shared/plan-templates";
import { TrackedLink } from "@/components/TrackedLink";
import { WorkoutStructurePreview } from "@/components/WorkoutStructurePreview";
import { RunningPlanIntentGuide } from "@/components/RunningPlanIntentGuide";
import { getPlanIntentGuide } from "@/lib/running-plan-intents";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import { isSeoIndexedLanguage } from "@/lib/i18n";
import { optimizeSeoText } from "@/lib/seo-metadata";
import {
  breadcrumbSchema,
  schemaGraph,
  schemaId,
  schemaLanguage,
} from "@/lib/seo-schema";

type CopyLocale =
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
export type OfficialPlanSlug =
  | "improve-10k"
  | "target-10k"
  | "improve-half-marathon"
  | "target-half-marathon"
  | "improve-marathon"
  | "target-marathon";

const LABELS: Record<
  CopyLocale,
  {
    official: string;
    improve: string;
    target: string;
    weeks: string;
    runsPerWeek: string;
    level: string;
    schedule: string;
    scheduleText: string;
    example: string;
    exampleText: string;
    cta: string;
    back: string;
    currentPlan: string;
    workoutCount: string;
    finalTitle: string;
    finalText: string;
  }
> = {
  en: {
    official: "Official training plan",
    improve: "Performance build",
    target: "Goal-time preparation",
    weeks: "Weeks",
    runsPerWeek: "Runs per week",
    level: "Plan type",
    schedule: "Complete week-by-week schedule",
    scheduleText:
      "Open each week to review the sessions, structure and effort guidance before adding the plan to your calendar.",
    example: "Example intensity",
    exampleText:
      "Paces shown below use a VDOT 40 example and are not your personal training paces. After sign-in, Trainingload.ai uses reliable current capability data. A Target plan also requires a qualified goal race.",
    cta: "Build my plan",
    back: "Back to the distance guide",
    currentPlan: "Current plan",
    workoutCount: "sessions",
    finalTitle: "Put the complete plan on your calendar",
    finalText:
      "Use the public schedule to understand the structure, then create a personal preview with your current capability and available training days.",
  },
  zh: {
    official: "官方训练计划",
    improve: "进阶提高",
    target: "目标成绩备赛",
    weeks: "周期",
    runsPerWeek: "每周跑步",
    level: "计划类型",
    schedule: "完整逐周训练安排",
    scheduleText:
      "展开每一周，查看训练内容、结构和强度说明；确认适合自己后，再加入日历。",
    example: "示例强度",
    exampleText:
      "下方配速使用 VDOT 40 示例，不是你的个人训练配速。登录后会使用可靠的当前能力数据；目标成绩计划还需要符合条件的目标赛事。",
    cta: "生成我的计划",
    back: "返回该距离训练主页",
    currentPlan: "当前计划",
    workoutCount: "次训练",
    finalTitle: "把完整计划加入训练日历",
    finalText:
      "先通过公开课表确认结构，再结合当前能力和可训练日期生成个人预览。",
  },
  "zh-hant": {
    official: "官方訓練計畫",
    improve: "進階提高",
    target: "目標成績備賽",
    weeks: "週期",
    runsPerWeek: "每週跑步",
    level: "計畫類型",
    schedule: "完整逐週訓練安排",
    scheduleText:
      "展開每一週，查看訓練內容、結構和強度說明；確認適合自己後，再加入日曆。",
    example: "示例強度",
    exampleText:
      "下方配速使用 VDOT 40 示例，不是你的個人訓練配速。登入後會使用可靠的目前能力資料；目標成績計畫還需要符合條件的目標賽事。",
    cta: "產生我的計畫",
    back: "返回該距離訓練主頁",
    currentPlan: "目前計畫",
    workoutCount: "次訓練",
    finalTitle: "把完整計畫加入訓練日曆",
    finalText:
      "先透過公開課表確認結構，再結合目前能力和可訓練日期產生個人預覽。",
  },
  ja: {
    official: "公式トレーニングプラン",
    improve: "記録向上",
    target: "目標タイム対策",
    weeks: "期間",
    runsPerWeek: "週のラン回数",
    level: "プラン種別",
    schedule: "週ごとの全トレーニング",
    scheduleText:
      "各週を開き、セッション内容・構成・強度を確認してからカレンダーに追加できます。",
    example: "強度の例",
    exampleText:
      "下記のペースは VDOT 40 の例で、あなた個人のペースではありません。ログイン後は信頼できる現在の走力データを使用し、目標プランには条件を満たす目標レースも必要です。",
    cta: "自分のプランを作る",
    back: "距離別ガイドに戻る",
    currentPlan: "現在のプラン",
    workoutCount: "セッション",
    finalTitle: "完全なプランをカレンダーへ",
    finalText:
      "公開メニューで構成を確認し、現在の走力と走れる曜日を使って個人向けプレビューを作成します。",
  },
  ko: {
    official: "공식 훈련 계획",
    improve: "기록 향상",
    target: "목표 기록 대비",
    weeks: "기간",
    runsPerWeek: "주당 러닝",
    level: "계획 유형",
    schedule: "주차별 전체 훈련 일정",
    scheduleText:
      "각 주차를 열어 훈련 내용, 구성, 강도 가이드를 확인한 뒤 캘린더에 추가하세요.",
    example: "예시 강도",
    exampleText:
      "아래 페이스는 VDOT 40 예시이며 개인 훈련 페이스가 아닙니다. 로그인 후에는 신뢰할 수 있는 현재 기량 데이터를 사용하며, 목표 기록 계획에는 기준을 충족하는 목표 대회가 필요합니다.",
    cta: "내 계획 만들기",
    back: "거리별 가이드로 돌아가기",
    currentPlan: "현재 계획",
    workoutCount: "세션",
    finalTitle: "완성된 계획을 캘린더에 추가하세요",
    finalText:
      "공개 일정으로 구성을 먼저 확인한 뒤, 현재 기량과 훈련 가능한 요일에 맞춰 개인 미리보기를 만들어 보세요.",
  },
  de: {
    official: "Offizieller Trainingsplan",
    improve: "Leistungsaufbau",
    target: "Zielzeit-Vorbereitung",
    weeks: "Wochen",
    runsPerWeek: "Läufe pro Woche",
    level: "Plantyp",
    schedule: "Kompletter Wochenplan",
    scheduleText:
      "Öffne jede Woche, um Einheiten, Struktur und Intensitätsführung zu prüfen, bevor du den Plan deinem Kalender hinzufügst.",
    example: "Beispiel-Intensität",
    exampleText:
      "Die unten gezeigten Tempi basieren auf einem VDOT-40-Beispiel und sind nicht deine persönlichen Trainingstempi. Nach der Anmeldung nutzt Trainingload.ai belastbare aktuelle Leistungsdaten. Ein Zielzeit-Plan erfordert zudem ein geeignetes Zielrennen.",
    cta: "Meinen Plan erstellen",
    back: "Zurück zum Distanz-Guide",
    currentPlan: "Aktueller Plan",
    workoutCount: "Einheiten",
    finalTitle: "Übertrage den kompletten Plan in deinen Kalender",
    finalText:
      "Nutze den öffentlichen Wochenplan für die Struktur und erstelle dann eine persönliche Vorschau mit deiner aktuellen Leistungsfähigkeit und deinen verfügbaren Trainingstagen.",
  },
  fr: {
    official: "Plan d'entraînement officiel",
    improve: "Progression performance",
    target: "Préparation chrono cible",
    weeks: "Semaines",
    runsPerWeek: "Sorties / semaine",
    level: "Type de plan",
    schedule: "Programme complet semaine par semaine",
    scheduleText:
      "Ouvre chaque semaine pour examiner les séances, la structure et les repères d'effort avant d'ajouter le plan à ton calendrier.",
    example: "Intensité d'exemple",
    exampleText:
      "Les allures affichées ci-dessous correspondent à un exemple VDOT 40 et ne sont pas tes allures personnelles. Après connexion, Trainingload.ai utilise tes données de niveau actuel fiables. Un plan Chrono cible requiert aussi une course objectif éligible.",
    cta: "Créer mon plan",
    back: "Retour au guide de la distance",
    currentPlan: "Plan actuel",
    workoutCount: "séances",
    finalTitle: "Ajoute le plan complet à ton calendrier",
    finalText:
      "Parcours le programme public pour comprendre la structure, puis crée un aperçu personnalisé selon ton niveau actuel et tes jours disponibles.",
  },
  es: {
    official: "Plan de entrenamiento oficial",
    improve: "Mejora de rendimiento",
    target: "Preparación de marca objetivo",
    weeks: "Semanas",
    runsPerWeek: "Sesiones por semana",
    level: "Tipo de plan",
    schedule: "Calendario completo semana a semana",
    scheduleText:
      "Abre cada semana para revisar las sesiones, la estructura y la guía de esfuerzo antes de añadir el plan a tu calendario.",
    example: "Intensidad de ejemplo",
    exampleText:
      "Los ritmos mostrados abajo usan un ejemplo de VDOT 40 y no son tus ritmos personales. Al iniciar sesión, Trainingload.ai usa datos fiables de tu capacidad actual. Un plan de marca objetivo también requiere una carrera objetivo válida.",
    cta: "Crear mi plan",
    back: "Volver a la guía de distancia",
    currentPlan: "Plan actual",
    workoutCount: "sesiones",
    finalTitle: "Lleva el plan completo a tu calendario",
    finalText:
      "Revisa el calendario público para entender la estructura y luego crea una vista previa personalizada con tu capacidad actual y tus días disponibles.",
  },
  it: {
    official: "Piano di allenamento ufficiale",
    improve: "Miglioramento prestazione",
    target: "Preparazione tempo obiettivo",
    weeks: "Settimane",
    runsPerWeek: "Corse a settimana",
    level: "Tipo di piano",
    schedule: "Programma completo settimana per settimana",
    scheduleText:
      "Apri ogni settimana per esaminare sessioni, struttura e indicazioni di sforzo prima di aggiungere il piano al tuo calendario.",
    example: "Intensità di esempio",
    exampleText:
      "I ritmi mostrati qui sotto usano un esempio VDOT 40 e non sono i tuoi ritmi personali. Dopo l'accesso, Trainingload.ai usa dati affidabili sulla tua capacità attuale. Un piano tempo obiettivo richiede anche una gara obiettivo idonea.",
    cta: "Crea il mio piano",
    back: "Torna alla guida della distanza",
    currentPlan: "Piano attuale",
    workoutCount: "sessioni",
    finalTitle: "Porta il piano completo nel tuo calendario",
    finalText:
      "Esplora il programma pubblico per capire la struttura, poi genera un'anteprima personalizzata con la tua capacità attuale e i giorni disponibili.",
  },
  "pt-BR": {
    official: "Plano de treino oficial",
    improve: "Evolução de performance",
    target: "Preparação para tempo-alvo",
    weeks: "Semanas",
    runsPerWeek: "Corridas por semana",
    level: "Tipo de plano",
    schedule: "Programação completa semana a semana",
    scheduleText:
      "Abra cada semana para revisar sessões, estrutura e orientação de esforço antes de adicionar o plano ao seu calendário.",
    example: "Intensidade de exemplo",
    exampleText:
      "Os ritmos exibidos abaixo usam um exemplo de VDOT 40 e não são seus ritmos pessoais. Após o login, o Trainingload.ai usa dados confiáveis da sua capacidade atual. Um plano de tempo-alvo também exige uma prova-alvo qualificada.",
    cta: "Montar meu plano",
    back: "Voltar ao guia da distância",
    currentPlan: "Plano atual",
    workoutCount: "sessões",
    finalTitle: "Coloque o plano completo no seu calendário",
    finalText:
      "Use a programação pública para entender a estrutura e depois gere uma prévia pessoal com sua capacidade atual e dias disponíveis para treinar.",
  },
};

const SEO_TITLES: Record<CopyLocale, Record<OfficialPlanSlug, string>> = {
  en: {
    "improve-10k": "Intermediate 10K Training Plan | 8-Week Schedule",
    "target-10k": "10K Goal-Time Training Plan | Sub-40, 45 & 50",
    "improve-half-marathon":
      "Intermediate Half Marathon Plan | 12-Week Schedule",
    "target-half-marathon":
      "Half Marathon Goal-Time Plan | Sub-2 Hour Training",
    "improve-marathon":
      "Intermediate Marathon Training Plan | 18-Week Schedule",
    "target-marathon": "Marathon Goal-Time Plan | Sub-3 & Sub-4, 18 Weeks",
  },
  zh: {
    "improve-10k": "10公里进阶训练计划：8周提高成绩课表",
    "target-10k": "10公里目标成绩训练计划：跑进40、45或50分钟",
    "improve-half-marathon": "半马进阶训练计划：12周提高成绩课表",
    "target-half-marathon": "半马目标成绩训练计划：14周备战半马破二",
    "improve-marathon": "马拉松进阶训练计划：18周提高成绩课表",
    "target-marathon": "马拉松目标成绩训练计划：18周备战破三与破四",
  },
  "zh-hant": {
    "improve-10k": "10公里進階訓練計畫：8週提高成績課表",
    "target-10k": "10公里目標成績訓練計畫：跑進40、45或50分鐘",
    "improve-half-marathon": "半馬進階訓練計畫：12週提高成績課表",
    "target-half-marathon": "半馬目標成績訓練計畫：14週備戰半馬破二",
    "improve-marathon": "馬拉松進階訓練計畫：18週提高成績課表",
    "target-marathon": "馬拉松目標成績訓練計畫：18週備戰破三與破四",
  },
  ja: {
    "improve-10k": "10km中級者向け練習メニュー｜8週間で記録向上",
    "target-10k": "10km目標タイム練習メニュー｜40分・45分・50分切り",
    "improve-half-marathon": "ハーフマラソン中級者向け練習メニュー｜12週間",
    "target-half-marathon":
      "ハーフマラソン目標タイム練習｜14週間で2時間切りを目指す",
    "improve-marathon": "フルマラソン中級者向け練習メニュー｜18週間",
    "target-marathon": "フルマラソン目標タイム練習｜サブ3・サブ4の18週間",
  },
  ko: {
    "improve-10k": "10K 중급 훈련 계획 | 8주 기록 향상 일정",
    "target-10k": "10K 목표 기록 훈련 계획 | 40분·45분·50분 돌파",
    "improve-half-marathon": "하프마라톤 중급 훈련 계획 | 12주 일정",
    "target-half-marathon": "하프마라톤 목표 기록 훈련 계획 | 서브2 대비 14주",
    "improve-marathon": "마라톤 중급 훈련 계획 | 18주 기록 향상 일정",
    "target-marathon": "마라톤 목표 기록 훈련 계획 | 서브3·서브4 18주",
  },
  de: {
    "improve-10k": "10-km-Trainingsplan für Fortgeschrittene | 8 Wochen",
    "target-10k": "10-km-Zielzeit-Trainingsplan | Sub-40, 45 & 50",
    "improve-half-marathon": "Halbmarathon-Plan für Fortgeschrittene | 12 Wochen",
    "target-half-marathon": "Halbmarathon-Zielzeit-Plan | Sub-2-Stunden-Training",
    "improve-marathon": "Marathon-Plan für Fortgeschrittene | 18 Wochen",
    "target-marathon": "Marathon-Zielzeit-Plan | Sub-3 & Sub-4, 18 Wochen",
  },
  fr: {
    "improve-10k": "Plan d'entraînement 10 km intermédiaire | 8 semaines",
    "target-10k": "Plan 10 km chrono cible | Sub-40, 45 & 50 min",
    "improve-half-marathon": "Plan semi-marathon intermédiaire | 12 semaines",
    "target-half-marathon": "Plan semi-marathon chrono cible | Objectif Sub-2h",
    "improve-marathon": "Plan marathon intermédiaire | Programme 18 semaines",
    "target-marathon": "Plan marathon chrono cible | Sub-3h & Sub-4h, 18 sem.",
  },
  es: {
    "improve-10k": "Plan de entrenamiento 10K intermedio | 8 semanas",
    "target-10k": "Plan 10K marca objetivo | Sub-40, 45 y 50 min",
    "improve-half-marathon": "Plan de media maratón intermedio | 12 semanas",
    "target-half-marathon": "Plan de media maratón marca objetivo | Sub-2 horas",
    "improve-marathon": "Plan de maratón intermedio | Programa de 18 semanas",
    "target-marathon": "Plan de maratón marca objetivo | Sub-3 y Sub-4, 18 sem.",
  },
  it: {
    "improve-10k": "Piano di allenamento 10 km intermedio | 8 settimane",
    "target-10k": "Piano 10 km tempo obiettivo | Sub-40, 45 e 50 min",
    "improve-half-marathon": "Piano mezza maratona intermedio | 12 settimane",
    "target-half-marathon": "Piano mezza maratona tempo obiettivo | Sub-2 ore",
    "improve-marathon": "Piano maratona intermedio | Programma 18 settimane",
    "target-marathon": "Piano maratona tempo obiettivo | Sub-3 e Sub-4, 18 sett.",
  },
  "pt-BR": {
    "improve-10k": "Plano de treino 10 km intermediário | 8 semanas",
    "target-10k": "Plano 10 km tempo-alvo | Sub-40, 45 e 50 min",
    "improve-half-marathon": "Plano de meia maratona intermediário | 12 semanas",
    "target-half-marathon": "Plano meia maratona tempo-alvo | Treino Sub-2h",
    "improve-marathon": "Plano de maratona intermediário | 18 semanas",
    "target-marathon": "Plano maratona tempo-alvo | Sub-3h e Sub-4h, 18 sem.",
  },
};

const PAGE_HEADINGS: Record<CopyLocale, Record<OfficialPlanSlug, string>> = {
  en: {
    "improve-10k": "Intermediate 10K Training Plan",
    "target-10k": "10K Goal-Time Training Plan",
    "improve-half-marathon": "Intermediate Half Marathon Training Plan",
    "target-half-marathon": "Half Marathon Goal-Time Training Plan",
    "improve-marathon": "Intermediate Marathon Training Plan",
    "target-marathon": "Marathon Goal-Time Training Plan",
  },
  zh: {
    "improve-10k": "10公里进阶训练计划",
    "target-10k": "10公里目标成绩训练计划",
    "improve-half-marathon": "半马进阶训练计划",
    "target-half-marathon": "半马目标成绩训练计划",
    "improve-marathon": "马拉松进阶训练计划",
    "target-marathon": "马拉松目标成绩训练计划",
  },
  "zh-hant": {
    "improve-10k": "10公里進階訓練計畫",
    "target-10k": "10公里目標成績訓練計畫",
    "improve-half-marathon": "半馬進階訓練計畫",
    "target-half-marathon": "半馬目標成績訓練計畫",
    "improve-marathon": "馬拉松進階訓練計畫",
    "target-marathon": "馬拉松目標成績訓練計畫",
  },
  ja: {
    "improve-10k": "10km中級者向け練習メニュー",
    "target-10k": "10km目標タイム練習メニュー",
    "improve-half-marathon": "ハーフマラソン中級者向け練習メニュー",
    "target-half-marathon": "ハーフマラソン目標タイム練習メニュー",
    "improve-marathon": "フルマラソン中級者向け練習メニュー",
    "target-marathon": "フルマラソン目標タイム練習メニュー",
  },
  ko: {
    "improve-10k": "10K 중급 훈련 계획",
    "target-10k": "10K 목표 기록 훈련 계획",
    "improve-half-marathon": "하프마라톤 중급 훈련 계획",
    "target-half-marathon": "하프마라톤 목표 기록 훈련 계획",
    "improve-marathon": "마라톤 중급 훈련 계획",
    "target-marathon": "마라톤 목표 기록 훈련 계획",
  },
  de: {
    "improve-10k": "10-km-Trainingsplan für Fortgeschrittene",
    "target-10k": "10-km-Zielzeit-Trainingsplan",
    "improve-half-marathon": "Halbmarathon-Trainingsplan für Fortgeschrittene",
    "target-half-marathon": "Halbmarathon-Zielzeit-Trainingsplan",
    "improve-marathon": "Marathon-Trainingsplan für Fortgeschrittene",
    "target-marathon": "Marathon-Zielzeit-Trainingsplan",
  },
  fr: {
    "improve-10k": "Plan d'entraînement 10 km intermédiaire",
    "target-10k": "Plan d'entraînement 10 km chrono cible",
    "improve-half-marathon": "Plan d'entraînement semi-marathon intermédiaire",
    "target-half-marathon": "Plan d'entraînement semi-marathon chrono cible",
    "improve-marathon": "Plan d'entraînement marathon intermédiaire",
    "target-marathon": "Plan d'entraînement marathon chrono cible",
  },
  es: {
    "improve-10k": "Plan de entrenamiento 10K intermedio",
    "target-10k": "Plan de entrenamiento 10K marca objetivo",
    "improve-half-marathon": "Plan de entrenamiento media maratón intermedio",
    "target-half-marathon": "Plan de entrenamiento media maratón marca objetivo",
    "improve-marathon": "Plan de entrenamiento maratón intermedio",
    "target-marathon": "Plan de entrenamiento maratón marca objetivo",
  },
  it: {
    "improve-10k": "Piano di allenamento 10 km intermedio",
    "target-10k": "Piano di allenamento 10 km tempo obiettivo",
    "improve-half-marathon": "Piano di allenamento mezza maratona intermedio",
    "target-half-marathon": "Piano di allenamento mezza maratona tempo obiettivo",
    "improve-marathon": "Piano di allenamento maratona intermedio",
    "target-marathon": "Piano di allenamento maratona tempo obiettivo",
  },
  "pt-BR": {
    "improve-10k": "Plano de treino de 10 km intermediário",
    "target-10k": "Plano de treino de 10 km tempo-alvo",
    "improve-half-marathon": "Plano de treino de meia maratona intermediário",
    "target-half-marathon": "Plano de treino de meia maratona tempo-alvo",
    "improve-marathon": "Plano de treino de maratona intermediário",
    "target-marathon": "Plano de treino de maratona tempo-alvo",
  },
};

export function officialPlanTemplateHeading({
  lang,
  slug,
}: {
  lang: string;
  slug: OfficialPlanSlug;
}) {
  return PAGE_HEADINGS[copyLocale(lang)][slug];
}

function copyLocale(lang: string): CopyLocale {
  const normalized = lang.toLowerCase();
  if (
    normalized.startsWith("zh-hant") ||
    normalized.startsWith("zh-tw") ||
    normalized.startsWith("zh-hk")
  ) {
    return "zh-hant";
  }
  if (normalized.startsWith("zh")) return "zh";
  if (normalized.startsWith("ja")) return "ja";
  if (normalized.startsWith("ko")) return "ko";
  if (normalized.startsWith("de")) return "de";
  if (normalized.startsWith("fr")) return "fr";
  if (normalized.startsWith("es")) return "es";
  if (normalized.startsWith("it")) return "it";
  if (normalized.startsWith("pt")) return "pt-BR";
  return "en";
}

function routeForTemplate(slug: OfficialPlanSlug) {
  if (slug.endsWith("10k")) return "/10k-training-plan";
  if (slug.endsWith("half-marathon")) return "/half-marathon-training-plan";
  return "/marathon-training-plan";
}

function routeSuffix(slug: OfficialPlanSlug) {
  return slug.startsWith("improve-") ? "improve" : "target";
}

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai"
  ).replace(/\/+$/, "");
}

export function officialPlanTemplateMetadata({
  lang,
  slug,
}: {
  lang: string;
  slug: OfficialPlanSlug;
}): Metadata {
  const template = getRunPlanTemplate(slug);
  if (!template) throw new Error(`Missing official template: ${slug}`);
  const locale = copyLocale(lang);
  const copy = template.copy[normalizePlanTemplateLocale(lang)];
  const path = `${routeForTemplate(slug)}/${routeSuffix(slug)}`;
  const siteUrl = getSiteUrl();
  const prefix = localePrefix(lang);
  const seo = optimizeSeoText({
    locale: lang,
    context: "plan",
    title: SEO_TITLES[locale][slug],
    description: getPlanIntentGuide(slug, lang)?.intro ?? copy.description,
  });

  return {
    title: seo.title,
    description: seo.description,
    alternates: {
      canonical: `${siteUrl}${prefix}${path}`,
      languages: absoluteAlternatesForPath(siteUrl, path),
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "website",
      url: `${siteUrl}${prefix}${path}`,
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
    },
    robots: isSeoIndexedLanguage(lang)
      ? undefined
      : { index: false, follow: true },
  };
}

export function OfficialPlanTemplateDetailPage({
  lang,
  slug,
}: {
  lang: string;
  slug: OfficialPlanSlug;
}) {
  const template = getRunPlanTemplate(slug);
  const variant = template ? getPlanTemplateVariant(template) : null;
  if (!template || !variant)
    throw new Error(`Missing official template: ${slug}`);

  const normalizedLocale = normalizePlanTemplateLocale(lang);
  const locale = copyLocale(lang);
  const labels = LABELS[locale];
  const pageHeading = officialPlanTemplateHeading({ lang, slug });
  const copy = template.copy[normalizedLocale];
  const hubPath = routeForTemplate(slug);
  const pagePath = `${hubPath}/${routeSuffix(slug)}`;
  const prefix = localePrefix(lang);
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}${prefix}${pagePath}`;
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.trainingload.ai"
  ).replace(/\/$/, "");
  const outcomeLabel =
    template.outcome === "IMPROVE" ? labels.improve : labels.target;
  const totalSessions = variant.workouts.length;
  const intentGuide = getPlanIntentGuide(slug, lang);

  const jsonLd = schemaGraph([
    intentGuide?.faq.length
      ? {
          "@type": "FAQPage",
          "@id": schemaId(pageUrl, "faq"),
          mainEntity: intentGuide.faq.map(([question, answer]) => ({
            "@type": "Question",
            name: question,
            acceptedAnswer: { "@type": "Answer", text: answer },
          })),
        }
      : null,
    {
      "@type": "WebPage",
      "@id": schemaId(pageUrl, "webpage"),
      name: pageHeading,
      description: copy.description,
      url: pageUrl,
      inLanguage: schemaLanguage(lang),
      mainEntity: { "@id": schemaId(pageUrl, "schedule") },
    },
    {
      "@type": "ItemList",
      "@id": schemaId(pageUrl, "schedule"),
      name: labels.schedule,
      numberOfItems: variant.weeks.length,
      itemListElement: variant.weeks.map((week, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: week.copy[normalizedLocale].title,
      })),
    },
    breadcrumbSchema({
      id: schemaId(pageUrl, "breadcrumb"),
      items: [
        { name: "Trainingload.ai", item: `${siteUrl}${prefix}/` },
        { name: template.goal, item: `${siteUrl}${prefix}${hubPath}` },
        { name: outcomeLabel, item: pageUrl },
      ],
    }),
  ]);

  return (
    <div className="overflow-x-clip bg-[#f5f7f8] text-neutral-950 dark:bg-[#0d1113] dark:text-neutral-50">
      <Script
        id={`${slug}-structured-data`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="border-b border-white/10 bg-[#0b0f10] px-5 py-12 md:py-16 text-white">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">
              {labels.official} · {template.goal} · {outcomeLabel}
            </p>
            <h1 className="mt-5 max-w-4xl text-balance text-4xl font-black tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              {pageHeading}
            </h1>
            <p className="mt-6 max-w-3xl text-base font-medium leading-8 text-neutral-300 sm:text-lg">
              {copy.description}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <TrackedLink
                href={`${appUrl}/plans/templates/${template.slug}?source=docs&placement=hero`}
                eventName="plan_template_open"
                eventProperties={{ slug, placement: "hero" }}
                className="group inline-flex min-h-11 items-center justify-center gap-2 bg-emerald-500 px-5 text-sm font-black text-neutral-950 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
              >
                {labels.cta}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </TrackedLink>
              <TrackedLink
                href={`${prefix}${hubPath}`}
                eventName="plan_related_click"
                eventProperties={{
                  slug,
                  target: hubPath,
                  cta_location: "hero",
                }}
                className="inline-flex min-h-11 items-center justify-center gap-2 border border-white/20 px-5 text-sm font-bold text-white transition-colors hover:border-emerald-300 hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
              >
                {labels.back}
              </TrackedLink>
            </div>
          </div>

          <dl className="grid grid-cols-3 border border-white/15 bg-white/[0.03]">
            <div className="border-r border-white/15 p-4">
              <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                {labels.weeks}
              </dt>
              <dd className="mt-2 text-2xl font-black tabular-nums">
                {variant.periodWeeks}
              </dd>
            </div>
            <div className="border-r border-white/15 p-4">
              <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                {labels.runsPerWeek}
              </dt>
              <dd className="mt-2 text-2xl font-black tabular-nums">
                {variant.trainingDaysPerWeek}
              </dd>
            </div>
            <div className="p-4">
              <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                {labels.level}
              </dt>
              <dd className="mt-2 text-sm font-black text-emerald-300">
                {outcomeLabel}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <RunningPlanIntentGuide slug={slug} lang={lang} />

      <section className="px-5 py-12 md:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                {String(variant.weeks.length).padStart(2, "0")} {labels.weeks} ·{" "}
                {totalSessions} {labels.workoutCount}
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] sm:text-5xl">
                {labels.schedule}
              </h2>
              <p className="mt-4 max-w-2xl leading-7 text-neutral-600 dark:text-neutral-300">
                {labels.scheduleText}
              </p>
            </div>
            <div className="border-l-2 border-amber-400 bg-amber-50 px-5 py-4 text-amber-950 dark:bg-amber-300/[0.08] dark:text-amber-100">
              <strong className="flex items-center gap-2 text-sm">
                <Gauge className="size-4" />
                {labels.example}
              </strong>
              <p className="mt-2 text-sm leading-6">{labels.exampleText}</p>
            </div>
          </div>

          <div className="mt-10 divide-y divide-neutral-200 border-y border-neutral-300 dark:divide-white/10 dark:border-white/15">
            {variant.weeks.map((week, weekIndex) => {
              const workouts = variant.workouts.filter(
                (workout) => workout.weekIndex === week.weekIndex,
              );
              return (
                <details
                  key={week.weekIndex}
                  open={weekIndex === 0}
                  className="group bg-white dark:bg-white/[0.025]"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-5 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-emerald-500 sm:px-6 [&::-webkit-details-marker]:hidden">
                    <span className="text-2xl font-black tabular-nums text-neutral-300 dark:text-neutral-600">
                      {String(week.weekIndex).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-base font-black sm:text-lg">
                        {week.copy[normalizedLocale].title}
                      </strong>
                      <small className="mt-1 block text-sm text-neutral-500 dark:text-neutral-400">
                        {workouts.length} {labels.workoutCount}
                      </small>
                    </span>
                    <ChevronDown className="size-5 text-emerald-700 transition-transform group-open:rotate-180 dark:text-emerald-300" />
                  </summary>
                  <div className="grid gap-px border-t border-neutral-200 bg-neutral-200 sm:grid-cols-2 dark:border-white/10 dark:bg-white/10">
                    {workouts.map((workout) => {
                      const resolved = resolveRunningWorkoutIntensity({
                        template,
                        workout,
                        capability: publicExampleCapability(),
                      });
                      const guidance = getPlanTemplateIntensityGuidance({
                        workout,
                        locale: normalizedLocale,
                        definition: resolved.definition,
                      });
                      return (
                        <article
                          key={workout.semanticId}
                          className="min-w-0 bg-[#fafbfb] p-5 dark:bg-[#141a1d]"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <h3 className="font-black">
                              {workout.copy[normalizedLocale].name}
                            </h3>
                            <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                          </div>
                          <div className="mt-4 max-w-md">
                            <WorkoutStructurePreview
                              structure={
                                resolved.definition.source === "STRUCTURE"
                                  ? resolved.definition.structure
                                  : null
                              }
                              lang={lang}
                            />
                          </div>
                          <p className="mt-4 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
                            {workout.copy[normalizedLocale].notes}
                          </p>
                          <p className="mt-3 text-xs font-black uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300">
                            {guidance.rpe.display}
                            {guidance.pace ? ` · ${guidance.pace.display}` : ""}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#101617] px-5 py-12 text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">
              {labels.currentPlan} · {template.goal} · {outcomeLabel}
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.035em]">
              {labels.finalTitle}
            </h2>
            <p className="mt-3 max-w-2xl leading-7 text-neutral-300">
              {labels.finalText}
            </p>
          </div>
          <TrackedLink
            href={`${appUrl}/plans/templates/${template.slug}?source=docs&placement=final`}
            eventName="plan_template_open"
            eventProperties={{ slug, placement: "final" }}
            className="group inline-flex min-h-12 shrink-0 items-center justify-center gap-2 bg-emerald-500 px-6 text-sm font-black text-neutral-950 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
          >
            {labels.cta}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </TrackedLink>
        </div>
      </section>

      <nav className="px-5 py-10" aria-label={labels.back}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-5 text-sm font-bold">
          <TrackedLink
            href={`${prefix}${hubPath}`}
            eventName="plan_related_click"
            eventProperties={{ slug, target: hubPath, cta_location: "footer" }}
            className="group inline-flex items-center gap-2 text-emerald-700 dark:text-emerald-300"
          >
            <Route className="size-4" />
            {labels.back}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </TrackedLink>
          <span className="text-neutral-300 dark:text-neutral-700">/</span>
          <span className="inline-flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
            <CalendarRange className="size-4" />
            {variant.periodWeeks} {labels.weeks} · {variant.trainingDaysPerWeek}{" "}
            {labels.runsPerWeek}
          </span>
        </div>
      </nav>
    </div>
  );
}
