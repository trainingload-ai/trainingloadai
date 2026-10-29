"use client";

import Image from "next/image";
import {
  type FocusEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ArrowRight, Check } from "lucide-react";
import { ProductBrowserWindow } from "@/components/ProductBrowserChrome";
import { TrackedLink } from "@/components/TrackedLink";
import { publicDemoDestination } from "@/lib/public-demo-url";
import styles from "./home-product-showcase.module.css";

type PreviewLocale = "en" | "zh" | "zh-hant" | "ja";
type PreviewSurface = "home" | "plan" | "calendar" | "analysis" | "coach";

type PreviewCopy = {
  webAlt: string;
  mobileAlt: string;
};

type OutgoingPreview = {
  id: number;
  surface: PreviewSurface;
};

export type HomeProductShowcaseModule = {
  name: string;
  title: string;
  description: string;
  points: string[];
  sourceIndex: number;
  href: string;
  cta: string;
  eventName: string;
};

export type HomeProductShowcaseCopy = {
  eyebrow: string;
  title: string;
  subtitle: string;
};

const ROTATION_DURATION_MS = 7200;

const PREVIEW_COPY: Record<PreviewLocale, PreviewCopy> = {
  en: {
    webAlt:
      "Trainingload.ai Web calendar showing planned and completed training",
    mobileAlt: "Trainingload.ai iOS calendar showing today's training",
  },
  zh: {
    webAlt: "Trainingload.ai Web 端展示计划训练与实际完成情况",
    mobileAlt: "Trainingload.ai iOS 端展示当天训练安排",
  },
  "zh-hant": {
    webAlt: "Trainingload.ai Web 端展示計畫訓練與實際完成情況",
    mobileAlt: "Trainingload.ai iOS 端展示當天訓練安排",
  },
  ja: {
    webAlt: "予定したトレーニングと完了した実績を表示するTrainingload.ai Web版",
    mobileAlt: "今日のトレーニングを表示するTrainingload.ai iOS版",
  },
};

const HOME_PREVIEW_COPY: Record<PreviewLocale, PreviewCopy> = {
  en: {
    webAlt:
      "Trainingload.ai Web home showing today's guidance, current plan, and training status",
    mobileAlt:
      "Trainingload.ai iOS Today screen showing guidance, today's workout, and weekly load",
  },
  zh: {
    webAlt: "Trainingload.ai Web 首页展示今日建议、当前计划与训练状态",
    mobileAlt: "Trainingload.ai iOS 今日页展示智能建议、当天训练与本周负荷",
  },
  "zh-hant": {
    webAlt: "Trainingload.ai Web 首頁展示今日建議、目前計畫與訓練狀態",
    mobileAlt: "Trainingload.ai iOS 今日頁展示智慧建議、當天訓練與本週負荷",
  },
  ja: {
    webAlt:
      "今日のアドバイス、現在のプラン、トレーニング状態を表示するTrainingload.ai Webホーム",
    mobileAlt:
      "アドバイス、今日のワークアウト、週間負荷を表示するTrainingload.ai iOSの今日画面",
  },
};

const SURFACE_BY_SOURCE_INDEX: Record<number, PreviewSurface> = {
  0: "coach",
  1: "calendar",
  2: "plan",
  3: "analysis",
};

const APP_PATH_BY_SURFACE: Record<PreviewSurface, string> = {
  home: "",
  plan: "/plans",
  calendar: "/calendar",
  analysis: "/analysis",
  coach: "/ai-coach",
};

function previewLocale(lang: string): PreviewLocale {
  const normalized = lang.toLowerCase();
  if (normalized.startsWith("zh-hant")) return "zh-hant";
  if (normalized.startsWith("zh")) return "zh";
  if (normalized.startsWith("ja")) return "ja";
  return "en";
}

function previewAssets(
  surface: PreviewSurface,
  locale: PreviewLocale,
  theme: "light" | "dark",
) {
  const suffix = theme === "dark" ? "-dark" : "";

  if (surface === "analysis") {
    return {
      web: `/5k-training-plan/web-plan${suffix}-v2-${locale}.png`,
      mobile: `/5k-training-plan/mobile-analysis${suffix}-v2-${locale}.png`,
    };
  }

  return {
    web: `/5k-training-plan/web-${surface}${suffix}-v2-${locale}.png`,
    mobile: `/5k-training-plan/mobile-${surface}${suffix}-v2-${locale}.png`,
  };
}

function ProductImagePair({
  alt,
  darkSrc,
  lightSrc,
  mobile = false,
  priority = false,
}: {
  alt: string;
  darkSrc: string;
  lightSrc: string;
  mobile?: boolean;
  priority?: boolean;
}) {
  const dimensions = mobile
    ? { width: 1320, height: 2868 }
    : { width: 1440, height: 960 };
  const sizes = mobile
    ? "(min-width: 1024px) 190px, 28vw"
    : "(min-width: 1024px) 760px, 92vw";

  return (
    <>
      <Image
        className="block h-auto w-full dark:hidden"
        src={lightSrc}
        width={dimensions.width}
        height={dimensions.height}
        sizes={sizes}
        priority={priority}
        unoptimized
        alt={alt}
      />
      <Image
        className="hidden h-auto w-full dark:block"
        src={darkSrc}
        width={dimensions.width}
        height={dimensions.height}
        sizes={sizes}
        priority={priority}
        unoptimized
        alt=""
        aria-hidden="true"
      />
    </>
  );
}

function ProductScreens({
  lang,
  priority = false,
  surface,
  wide = false,
}: {
  lang: string;
  priority?: boolean;
  surface: PreviewSurface;
  wide?: boolean;
}) {
  const locale = previewLocale(lang);
  const copy =
    surface === "home" ? HOME_PREVIEW_COPY[locale] : PREVIEW_COPY[locale];
  const light = previewAssets(surface, locale, "light");
  const dark = previewAssets(surface, locale, "dark");
  const appPath = APP_PATH_BY_SURFACE[surface];
  const destination = publicDemoDestination(lang, appPath);

  return (
    <figure
      className={[
        "relative mx-auto w-full",
        wide
          ? "max-w-[1080px] pb-[7%] pr-[7.5%]"
          : "max-w-[860px] pb-[7%] pr-[7%]",
      ].join(" ")}
      aria-label={`${copy.webAlt}；${copy.mobileAlt}`}
    >
      <ProductBrowserWindow
        address={destination.address}
        addressHref={destination.href}
        addressAriaLabel={`${copy.webAlt}: ${destination.address}`}
        compact
        className={[
          "bg-card",
          wide
            ? "rounded-[4px] shadow-[0_38px_90px_-58px_rgba(15,23,42,0.65)] dark:shadow-black/70"
            : "rounded-compact shadow-[0_24px_65px_-42px_rgba(15,23,42,0.58)] dark:shadow-black/55",
        ].join(" ")}
      >
        <ProductImagePair
          alt={copy.webAlt}
          lightSrc={light.web}
          darkSrc={dark.web}
          priority={priority}
        />
      </ProductBrowserWindow>
      <div
        className={[
          "absolute bottom-0 right-0 z-20 min-w-[82px] overflow-hidden border border-border bg-card shadow-[0_28px_70px_-34px_rgba(15,23,42,0.68)] dark:shadow-black/70",
          wide
            ? "w-[31%] max-w-[220px] rounded-[1.05rem] sm:w-[28%] sm:min-w-[96px] sm:rounded-[1.4rem] lg:w-[25%]"
            : "w-[24%] max-w-[190px] rounded-[1.15rem] sm:rounded-[1.55rem]",
        ].join(" ")}
      >
        <ProductImagePair
          alt={copy.mobileAlt}
          lightSrc={light.mobile}
          darkSrc={dark.mobile}
          mobile
          priority={priority}
        />
      </div>
    </figure>
  );
}

export function HomeHeroProductPreview({ lang }: { lang: string }) {
  return (
    <div className="relative px-2 py-5 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
      <div className="relative z-10">
        <ProductScreens lang={lang} priority surface="home" wide />
      </div>
    </div>
  );
}

export function HomeProductShowcase({
  copy,
  lang,
  modules,
}: {
  copy: HomeProductShowcaseCopy;
  lang: string;
  modules: HomeProductShowcaseModule[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [inView, setInView] = useState(false);
  const [pointerPaused, setPointerPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [documentHidden, setDocumentHidden] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [outgoingPreview, setOutgoingPreview] =
    useState<OutgoingPreview | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const progressRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const elapsedRef = useRef(0);
  const transitionIdRef = useRef(0);

  const resetProgress = useCallback(() => {
    elapsedRef.current = 0;
    for (const progress of progressRefs.current) {
      if (progress) progress.style.transform = "scaleX(0)";
    }
  }, []);

  const activate = useCallback(
    (index: number) => {
      resetProgress();
      if (index === activeIndex) return;

      const currentModule = modules[activeIndex];
      if (!reduceMotion && currentModule) {
        transitionIdRef.current += 1;
        setOutgoingPreview({
          id: transitionIdRef.current,
          surface: SURFACE_BY_SOURCE_INDEX[currentModule.sourceIndex] ?? "plan",
        });
      } else {
        setOutgoingPreview(null);
      }

      setActiveIndex(index);
      setCycle((current) => current + 1);
    },
    [activeIndex, modules, reduceMotion, resetProgress],
  );

  useEffect(() => {
    if (!outgoingPreview) return;

    const timeout = window.setTimeout(() => {
      setOutgoingPreview((current) =>
        current?.id === outgoingPreview.id ? null : current,
      );
    }, 560);

    return () => window.clearTimeout(timeout);
  }, [outgoingPreview]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      ([entry]) => setInView(Boolean(entry?.isIntersecting)),
      {
        rootMargin: "-18% 0px -18% 0px",
        threshold: 0,
      },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const update = () => setDocumentHidden(document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const canRotate =
    modules.length > 1 &&
    inView &&
    !pointerPaused &&
    !focusPaused &&
    !documentHidden &&
    !reduceMotion;

  useEffect(() => {
    // A resumed carousel always gets a full viewing interval. Carrying over a
    // nearly completed timer makes the next transition feel unpredictable.
    resetProgress();
  }, [canRotate, resetProgress]);

  useEffect(() => {
    if (!canRotate) return;

    let animationFrame = 0;
    let previousTime: number | null = null;

    const tick = (time: number) => {
      if (previousTime === null) previousTime = time;
      elapsedRef.current += time - previousTime;
      previousTime = time;

      const progress = Math.min(elapsedRef.current / ROTATION_DURATION_MS, 1);
      const progressElement = progressRefs.current[activeIndex];
      if (progressElement) {
        progressElement.style.transform = `scaleX(${progress})`;
      }

      if (progress >= 1) {
        activate((activeIndex + 1) % modules.length);
        return;
      }

      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [activate, activeIndex, canRotate, cycle, modules.length]);

  if (modules.length === 0) return null;

  const activeModule = modules[activeIndex] ?? modules[0];
  const activeSurface =
    SURFACE_BY_SOURCE_INDEX[activeModule.sourceIndex] ?? "plan";

  const handleFocusLeave = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setFocusPaused(false);
    }
  };

  const handleTabKey = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const lastIndex = modules.length - 1;
    let nextIndex: number | null = null;

    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      nextIndex = index === lastIndex ? 0 : index + 1;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      nextIndex = index === 0 ? lastIndex : index - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = lastIndex;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    activate(nextIndex);
    buttonRefs.current[nextIndex]?.focus();
  };

  return (
    <section
      ref={rootRef}
      className="marketing-section relative overflow-hidden bg-background text-foreground"
      onPointerEnter={() => setPointerPaused(true)}
      onPointerLeave={() => setPointerPaused(false)}
      onFocusCapture={() => setFocusPaused(true)}
      onBlurCapture={handleFocusLeave}
    >
      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.38fr)_minmax(0,0.62fr)] lg:items-end lg:gap-12">
          <div>
            <div className="marketing-eyebrow">{copy.eyebrow}</div>
            <h2 className="marketing-title max-w-xl leading-[1.06]">
              {copy.title}
            </h2>
          </div>
          <p className="max-w-2xl text-[15px] leading-7 text-muted-foreground md:text-base lg:justify-self-end">
            {copy.subtitle}
          </p>
        </div>

        <div className="mt-9 grid overflow-hidden rounded-overlay bg-card shadow-xs ring-1 ring-border/70 md:mt-10 lg:grid-cols-[minmax(17rem,0.36fr)_minmax(0,0.64fr)]">
          <div
            role="tablist"
            aria-label={copy.title}
            aria-orientation="vertical"
            className="order-2 grid bg-card sm:grid-cols-2 lg:order-1 lg:grid-cols-1 lg:grid-rows-4"
          >
            {modules.map((module, index) => {
              const active = index === activeIndex;
              return (
                <button
                  key={module.name}
                  ref={(node) => {
                    buttonRefs.current[index] = node;
                  }}
                  id={`home-product-tab-${index}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls="home-product-panel"
                  tabIndex={active ? 0 : -1}
                  className={[
                    "group relative min-h-[7rem] border-b border-border/80 px-5 py-4 text-left outline-none transition-colors last:border-b-0 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:[&:nth-child(odd)]:border-r lg:[&:nth-child(odd)]:border-r-0",
                    active
                      ? "bg-brand-soft before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-full before:bg-brand"
                      : "bg-card hover:bg-secondary",
                  ].join(" ")}
                  onClick={() => activate(index)}
                  onKeyDown={(event) => handleTabKey(event, index)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <span
                      className={[
                        "text-xs font-black tabular-nums",
                        active ? "text-foreground" : "text-muted-foreground",
                      ].join(" ")}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={[
                        "text-[10px] font-black uppercase tracking-[0.16em]",
                        active ? "text-foreground" : "text-muted-foreground",
                      ].join(" ")}
                    >
                      {module.name}
                    </span>
                  </div>
                  <h3 className="mt-2.5 text-base font-bold leading-tight text-foreground">
                    {module.title}
                  </h3>
                  <p className="mt-2 text-sm leading-5 text-muted-foreground">
                    {module.description}
                  </p>
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-5 bottom-0 h-px overflow-hidden bg-border"
                  >
                    <span
                      ref={(node) => {
                        progressRefs.current[index] = node;
                      }}
                      className={[
                        "block h-full origin-left bg-brand",
                        active ? "opacity-100" : "opacity-0",
                      ].join(" ")}
                      style={{ transform: "scaleX(0)" }}
                    />
                  </span>
                </button>
              );
            })}
          </div>

          <div
            id="home-product-panel"
            role="tabpanel"
            aria-labelledby={`home-product-tab-${activeIndex}`}
            className="order-1 flex min-w-0 flex-col bg-secondary p-4 sm:p-6 lg:order-2 lg:p-8"
          >
            <div
              className={`${styles.previewStage} grid min-h-0 flex-1 items-center`}
            >
              {outgoingPreview ? (
                <div
                  key={`outgoing-${outgoingPreview.id}`}
                  className={`${styles.previewLayer} ${styles.previewExit}`}
                  aria-hidden="true"
                >
                  <div className="mx-auto w-full max-w-[850px] py-5 sm:py-7">
                    <ProductScreens
                      lang={lang}
                      surface={outgoingPreview.surface}
                    />
                  </div>
                </div>
              ) : null}
              <div
                key={`${activeModule.sourceIndex}-${cycle}`}
                className={`${styles.previewLayer} ${styles.previewEnter}`}
              >
                <div className="mx-auto w-full max-w-[850px] py-5 sm:py-7">
                  <ProductScreens lang={lang} surface={activeSurface} />
                </div>
              </div>
            </div>

            <div className="mt-auto flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {activeModule.points.map((point) => (
                  <span
                    key={point}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"
                  >
                    <Check className="size-3.5 text-success" />
                    {point}
                  </span>
                ))}
              </div>
              <TrackedLink
                href={activeModule.href}
                eventName={activeModule.eventName}
                eventProperties={{ placement: "product_showcase" }}
                className="inline-flex shrink-0 items-center gap-2 text-sm font-black text-foreground transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {activeModule.cta}
                <ArrowRight className="size-4" />
              </TrackedLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
