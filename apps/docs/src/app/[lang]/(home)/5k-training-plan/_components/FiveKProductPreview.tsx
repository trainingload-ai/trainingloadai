import { productScreenshotUrl } from "@/lib/product-screenshot-url.mjs";
import Image from "next/image";
import { ProductBrowserChrome } from "@/components/ProductBrowserChrome";
import { publicDemoDestination } from "@/lib/public-demo-url";
import type { RunningPlanSlug } from "@/lib/running-plan-pages";
import styles from "../five-k-training-plan.module.css";

type PreviewCopy = {
  webAlt: string;
  mobileAlt: string;
  webCalendarAlt: string;
  mobileCalendarAlt: string;
};

type SystemPreviewKind = "calendar" | "analysis" | "coach";
type PreviewLocale = "en" | "zh" | "zh-hant" | "ja";
type PreviewCopyLocale =
  | PreviewLocale
  | "ko"
  | "de"
  | "fr"
  | "es"
  | "it"
  | "pt-BR";
type WebPreviewSurface = "web-plan" | "web-calendar" | "web-coach";
type MobilePreviewSurface = "mobile-plan" | "mobile-calendar" | "mobile-coach";

const COPY: Record<PreviewCopyLocale, PreviewCopy> = {
  en: {
    webAlt: "TrainingLoad.ai Web training plan detail",
    mobileAlt: "TrainingLoad.ai iOS plan screen with today's workout",
    webCalendarAlt:
      "TrainingLoad.ai Web training calendar with completed and planned workouts",
    mobileCalendarAlt:
      "TrainingLoad.ai iOS training calendar with workout data",
  },
  zh: {
    webAlt: "TrainingLoad.ai Web 端训练计划详情页",
    mobileAlt: "TrainingLoad.ai iOS 端今日训练页",
    webCalendarAlt: "TrainingLoad.ai Web 端含已完成与计划训练的训练日历",
    mobileCalendarAlt: "TrainingLoad.ai iOS 端含训练数据的日历页面",
  },
  "zh-hant": {
    webAlt: "TrainingLoad.ai Web 端訓練計畫詳情頁",
    mobileAlt: "TrainingLoad.ai iOS 端今日訓練頁",
    webCalendarAlt: "TrainingLoad.ai Web 端含已完成與計畫訓練的訓練日曆",
    mobileCalendarAlt: "TrainingLoad.ai iOS 端含訓練資料的日曆頁面",
  },
  ja: {
    webAlt: "TrainingLoad.ai Web版のトレーニングプラン詳細画面",
    mobileAlt: "TrainingLoad.ai iOS版の今日のトレーニング画面",
    webCalendarAlt:
      "完了済みと予定のワークアウトが入ったTrainingLoad.ai Web版カレンダー",
    mobileCalendarAlt:
      "トレーニングデータが入ったTrainingLoad.ai iOS版カレンダー",
  },
  ko: {
    webAlt: "TrainingLoad.ai 웹 훈련 계획 상세 화면",
    mobileAlt: "오늘의 훈련이 표시된 TrainingLoad.ai iOS 계획 화면",
    webCalendarAlt:
      "완료된 훈련과 예정된 훈련이 표시된 TrainingLoad.ai 웹 훈련 캘린더",
    mobileCalendarAlt: "훈련 데이터가 표시된 TrainingLoad.ai iOS 훈련 캘린더",
  },
  de: {
    webAlt: "TrainingLoad.ai Web-Trainingsplandetail",
    mobileAlt: "TrainingLoad.ai iOS-Planansicht mit dem heutigen Training",
    webCalendarAlt:
      "TrainingLoad.ai Web-Trainingskalender mit absolvierten und geplanten Einheiten",
    mobileCalendarAlt:
      "TrainingLoad.ai iOS-Trainingskalender mit Trainingsdaten",
  },
  fr: {
    webAlt: "Détail du plan d'entraînement TrainingLoad.ai sur le Web",
    mobileAlt: "Écran de plan TrainingLoad.ai iOS avec la séance du jour",
    webCalendarAlt:
      "Calendrier d'entraînement TrainingLoad.ai Web avec séances réalisées et planifiées",
    mobileCalendarAlt:
      "Calendrier d'entraînement TrainingLoad.ai iOS avec données de séance",
  },
  es: {
    webAlt: "Detalle del plan de entrenamiento de TrainingLoad.ai en Web",
    mobileAlt:
      "Pantalla de plan en TrainingLoad.ai iOS con el entrenamiento de hoy",
    webCalendarAlt:
      "Calendario de entrenamiento de TrainingLoad.ai en Web con sesiones completadas y planificadas",
    mobileCalendarAlt:
      "Calendario de entrenamiento de TrainingLoad.ai en iOS con datos de entrenamiento",
  },
  it: {
    webAlt: "Dettaglio del piano di allenamento TrainingLoad.ai Web",
    mobileAlt: "Schermata del piano TrainingLoad.ai iOS con l'allenamento di oggi",
    webCalendarAlt:
      "Calendario di allenamento TrainingLoad.ai Web con sessioni completate e pianificate",
    mobileCalendarAlt:
      "Calendario di allenamento TrainingLoad.ai iOS con dati di allenamento",
  },
  "pt-BR": {
    webAlt: "Detalhes do plano de treino do TrainingLoad.ai na Web",
    mobileAlt: "Tela do plano no TrainingLoad.ai iOS com o treino de hoje",
    webCalendarAlt:
      "Calendário de treino do TrainingLoad.ai na Web com treinos concluídos e planejados",
    mobileCalendarAlt:
      "Calendário de treino do TrainingLoad.ai no iOS com dados de treino",
  },
};

function previewLocale(lang: string): PreviewLocale {
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
  return "en";
}

function previewCopyLocale(lang: string): PreviewCopyLocale {
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

function previewAsset(
  surface:
    | "web-plan"
    | "mobile-plan"
    | "web-calendar"
    | "mobile-calendar"
    | "web-plan-dark"
    | "mobile-plan-dark"
    | "web-calendar-dark"
    | "mobile-calendar-dark"
    | "mobile-analysis-dark"
    | "mobile-analysis"
    | "web-coach"
    | "mobile-coach"
    | "web-coach-dark"
    | "mobile-coach-dark",
  locale: PreviewLocale,
) {
  const path = `/5k-training-plan/${surface}-v2-${locale}.png`;
  return surface.startsWith("web-") ? productScreenshotUrl(path) : path;
}

function planPreviewAsset(
  surface: "web-plan" | "web-plan-dark" | "web-calendar" | "web-calendar-dark",
  locale: PreviewLocale,
  planSlug: RunningPlanSlug,
) {
  if (
    planSlug === "10k-training-plan" ||
    planSlug === "half-marathon-training-plan" ||
    planSlug === "marathon-training-plan"
  ) {
    return productScreenshotUrl(`/${planSlug}/${surface}-v2-${locale}.png`);
  }
  return previewAsset(surface, locale);
}

function systemPreview(
  kind: SystemPreviewKind,
  locale: PreviewLocale,
  planSlug: RunningPlanSlug,
) {
  if (kind === "calendar") {
    return {
      web: planPreviewAsset("web-calendar-dark", locale, planSlug),
      mobile: previewAsset("mobile-calendar-dark", locale),
    };
  }
  if (kind === "analysis") {
    return {
      web: planPreviewAsset("web-plan-dark", locale, planSlug),
      mobile: previewAsset("mobile-analysis-dark", locale),
    };
  }
  return {
    web: previewAsset("web-coach-dark", locale),
    mobile: previewAsset("mobile-coach-dark", locale),
  };
}

function darkWebSurface(surface: WebPreviewSurface) {
  return `${surface}-dark` as const;
}

function darkMobileSurface(surface: MobilePreviewSurface) {
  return `${surface}-dark` as const;
}

function appBrowserTarget(lang: string, path: string) {
  const destination = publicDemoDestination(lang, path);
  return {
    address: destination.address,
    addressHref: destination.href,
    addressAriaLabel: destination.address,
  };
}

function WebPlanImage({
  alt,
  locale,
  surface = "web-plan",
  planSlug,
}: {
  alt: string;
  locale: PreviewLocale;
  surface?: WebPreviewSurface;
  planSlug?: RunningPlanSlug;
}) {
  const lightSrc =
    surface === "web-plan" && planSlug
      ? planPreviewAsset("web-plan", locale, planSlug)
      : previewAsset(surface, locale);
  const darkSrc =
    surface === "web-plan" && planSlug
      ? planPreviewAsset("web-plan-dark", locale, planSlug)
      : previewAsset(darkWebSurface(surface), locale);

  return (
    <>
      <Image
        className={`${styles.actualWebImage} ${styles.themeLightImage}`}
        src={lightSrc}
        width={1440}
        height={960}
        sizes="(min-width: 900px) 680px, 92vw"
        priority
        alt={alt}
      />
      <Image
        className={`${styles.actualWebImage} ${styles.themeDarkImage}`}
        src={darkSrc}
        width={1440}
        height={960}
        sizes="(min-width: 900px) 680px, 92vw"
        priority
        alt=""
        aria-hidden="true"
      />
    </>
  );
}

function MobilePlanImage({
  alt,
  locale,
  surface = "mobile-plan",
}: {
  alt: string;
  locale: PreviewLocale;
  surface?: MobilePreviewSurface;
}) {
  return (
    <>
      <Image
        className={`${styles.actualMobileImage} ${styles.themeLightImage}`}
        src={previewAsset(surface, locale)}
        width={1320}
        height={2868}
        sizes="(min-width: 900px) 190px, 34vw"
        priority
        unoptimized
        alt={alt}
      />
      <Image
        className={`${styles.actualMobileImage} ${styles.themeDarkImage}`}
        src={previewAsset(darkMobileSurface(surface), locale)}
        width={1320}
        height={2868}
        sizes="(min-width: 900px) 190px, 34vw"
        priority
        unoptimized
        alt=""
        aria-hidden="true"
      />
    </>
  );
}

function usesPlanDetail(planSlug: RunningPlanSlug) {
  return planSlug !== "couch-to-5k-training-plan";
}

function usesDistanceSpecificMobilePlan(planSlug: RunningPlanSlug) {
  return (
    planSlug === "5k-training-plan" ||
    planSlug === "5k-training-plan-intermediate"
  );
}

export function FiveKProductPreview({
  lang,
  planSlug,
  distance,
}: {
  lang: string;
  planSlug: RunningPlanSlug;
  distance: string;
}) {
  const locale = previewLocale(lang);
  const copy = COPY[previewCopyLocale(lang)];
  const showPlan = usesPlanDetail(planSlug);
  const showMobilePlan = usesDistanceSpecificMobilePlan(planSlug);
  const appPath = showPlan ? "/plans" : "/calendar";

  return (
    <figure className={styles.devicePreview}>
      <div className={styles.previewCanvas}>
        <div className={styles.webDevice}>
          <ProductBrowserChrome {...appBrowserTarget(lang, appPath)} compact />
          <WebPlanImage
            alt={showPlan ? `${distance}: ${copy.webAlt}` : copy.webCalendarAlt}
            locale={locale}
            surface={showPlan ? "web-plan" : "web-calendar"}
            planSlug={showPlan ? planSlug : undefined}
          />
        </div>
        <div className={styles.mobileDevice}>
          <MobilePlanImage
            alt={showMobilePlan ? copy.mobileAlt : copy.mobileCalendarAlt}
            locale={locale}
            surface={showMobilePlan ? "mobile-plan" : "mobile-calendar"}
          />
        </div>
      </div>
    </figure>
  );
}

export function FiveKWorkflowPreview({
  lang,
  planSlug,
  distance,
}: {
  lang: string;
  planSlug: RunningPlanSlug;
  distance: string;
}) {
  const locale = previewLocale(lang);
  const copy = COPY[previewCopyLocale(lang)];
  const showPlan = usesPlanDetail(planSlug);
  const showMobilePlan = usesDistanceSpecificMobilePlan(planSlug);
  const appPath = showPlan ? "/plans" : "/calendar";

  return (
    <figure className={styles.workflowPreview}>
      <div className={styles.workflowWeb}>
        <ProductBrowserChrome {...appBrowserTarget(lang, appPath)} compact />
        <WebPlanImage
          alt={showPlan ? `${distance}: ${copy.webAlt}` : copy.webCalendarAlt}
          locale={locale}
          surface={showPlan ? "web-plan" : "web-calendar"}
          planSlug={showPlan ? planSlug : undefined}
        />
      </div>
      <div className={styles.workflowPhone}>
        <MobilePlanImage
          alt={showMobilePlan ? copy.mobileAlt : copy.mobileCalendarAlt}
          locale={locale}
          surface={showMobilePlan ? "mobile-plan" : "mobile-calendar"}
        />
      </div>
    </figure>
  );
}

export function FiveKSystemPreview({
  kind,
  lang,
  label,
  planSlug,
}: {
  kind: SystemPreviewKind;
  lang: string;
  label: string;
  planSlug: RunningPlanSlug;
}) {
  const locale = previewLocale(lang);
  const preview = systemPreview(kind, locale, planSlug);
  const appPath =
    kind === "calendar"
      ? "/calendar"
      : kind === "analysis"
        ? "/analysis"
        : "/ai-coach";

  return (
    <figure className={styles.systemProductVisual} aria-label={label}>
      <div className={styles.systemPreviewLabels} aria-hidden="true">
        <span>WEB</span>
        <span>iOS</span>
      </div>
      <div className={styles.systemScreens}>
        <div className={styles.systemWebScreen}>
          <ProductBrowserChrome
            {...appBrowserTarget(lang, appPath)}
            compact
            variant="dark"
          />
          <Image
            src={preview.web}
            width={1440}
            height={960}
            sizes="(min-width: 900px) 620px, 92vw"
            loading="eager"
            unoptimized
            alt={`${label} · TrainingLoad.ai Web`}
          />
        </div>
        <div className={styles.systemPhoneScreen}>
          <Image
            src={preview.mobile}
            width={1320}
            height={2868}
            sizes="(min-width: 900px) 170px, 34vw"
            loading="eager"
            unoptimized
            alt={`${label} · TrainingLoad.ai iOS`}
          />
        </div>
      </div>
    </figure>
  );
}
