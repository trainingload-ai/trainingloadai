import Link from "next/link";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import { optimizeSeoText } from "@/lib/seo-metadata";
import { JsonLd } from "@/components/JsonLd";
import {
  ArrowRight,
  Bike,
  BrainCircuit,
  Calculator,
  ChartSpline,
  CircleGauge,
  Dumbbell,
  FileChartColumn,
  FlaskConical,
  Footprints,
  Heart,
  HeartPulse,
  Map,
  RefreshCw,
  ScanHeart,
  Target,
  Trophy,
  Zap,
  Waves,
  Wind,
  Workflow,
} from "lucide-react";
import {
  absoluteAlternatesForPath,
  localePrefix,
  withLocalePath,
} from "@/lib/locale-url";
import {
  breadcrumbSchema,
  itemListSchema,
  schemaGraph,
  schemaId,
  webPageSchema,
} from "@/lib/seo-schema";
import {
  endurancePlanHubSlugs,
  normalizeEndurancePlanHub,
  type EndurancePlanHub,
  type EndurancePlanHubCollection,
} from "@/lib/endurance-plan-hubs";

const toolTones = {
  ai: "var(--brand)",
  planned: "var(--chart-planned)",
  running: "var(--chart-fitness)",
  race: "var(--chart-warning)",
  physiology: "var(--chart-actual)",
  power: "var(--warning)",
  load: "var(--chart-fatigue)",
  heart: "var(--chart-danger)",
  swim: "var(--info)",
  files: "var(--muted-foreground)",
  routes: "var(--success)",
} as const;

function toolToneStyle(tone: string): CSSProperties {
  return {
    "--tool-tone": tone,
    "--tool-tone-soft": `color-mix(in srgb, ${tone} 12%, var(--card))`,
    "--tool-tone-strong": `color-mix(in srgb, ${tone} 68%, var(--foreground))`,
  } as CSSProperties;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const prefix = localePrefix(lang);
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const t = await getTranslations({
    locale: lang,
    namespace: "tools.metadata",
  });
  const keywordsRaw = t.raw("keywords");
  const keywords = Array.isArray(keywordsRaw) ? keywordsRaw : undefined;
  const seo = optimizeSeoText({
    locale: lang,
    context: "product",
    title: t("title"),
    description: t("description"),
  });
  return {
    title: seo.title,
    description: seo.description,
    keywords,
    alternates: {
      canonical: `${siteUrl}${prefix}/tools`,
      languages: absoluteAlternatesForPath(siteUrl, "/tools"),
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "website",
      url: `${siteUrl}${prefix}/tools`,
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
    },
  };
}

export default async function ToolsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: "tools.page" });
  const tCommon = await getTranslations({
    locale: lang,
    namespace: "commonLinks",
  });
  const tFreeReview = await getTranslations({
    locale: lang,
    namespace: "freeAiWorkoutReview",
  });
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const prefix = localePrefix(lang);
  const pageUrl = `${siteUrl}${prefix}/tools`;
  const ui = t.raw("ui") as Record<string, string>;
  const toolDetails = t.raw("toolDetails") as Record<
    string,
    { bestFor: string; output: string; question: string; docsLabel: string }
  >;
  const tFitFileViewer = await getTranslations({
    locale: lang,
    namespace: "fitFileViewer",
  });
  const tHubs = await getTranslations({
    locale: lang,
    namespace: "endurancePlanHubs",
  });
  const hubCollection = tHubs.raw("collection") as EndurancePlanHubCollection;
  const planHubs = endurancePlanHubSlugs.map((slug) => {
    const hub = normalizeEndurancePlanHub(
      tHubs.raw(`pages.${slug}`) as EndurancePlanHub,
      slug,
    );
    const visual = slug.includes("cycling")
      ? { icon: Bike, tone: toolTones.power }
      : slug.includes("swim")
        ? { icon: Waves, tone: toolTones.swim }
        : { icon: Workflow, tone: toolTones.physiology };
    return {
      key: slug,
      title: hub.cardTitle,
      description: hub.cardDescription,
      href: withLocalePath(lang, hub.routePath),
      ...visual,
      signal: hub.cardMeta,
      type: hubCollection.toolsGroup,
      bestFor: hubCollection.cardBadge,
      output: hub.weeks,
      question: hub.honestyTitle,
      docsHref: withLocalePath(lang, hub.routePath),
      docsLabel: hubCollection.cardCta,
    };
  });

  const tools = [
    {
      key: "freeAiWorkoutReview",
      title: tFreeReview("title"),
      description: tFreeReview("metadata.description"),
      href: withLocalePath(lang, "/free-ai-workout-review"),
      icon: BrainCircuit,
      tone: toolTones.ai,
      signal: "AI REVIEW",
      type: ui.training,
      bestFor: (tFreeReview.raw("trust") as string[])[0],
      output: tFreeReview("result.title"),
      question: tFreeReview("form.questionPlaceholder"),
      docsHref: withLocalePath(lang, "/training-analysis"),
      docsLabel: tFreeReview("result.cta"),
      featured: true,
    },
    {
      key: "workoutEditor",
      title: t("workoutEditor.title"),
      description: t("workoutEditor.description"),
      href: withLocalePath(lang, "/workout-editor"),
      icon: Dumbbell,
      tone: toolTones.planned,
      signal: "WORKOUT",
      type: ui.training,
      bestFor: toolDetails.workoutEditor.bestFor,
      output: toolDetails.workoutEditor.output,
      question: toolDetails.workoutEditor.question,
      docsHref: withLocalePath(lang, "/docs/planning/manual-workout-editor"),
      docsLabel: toolDetails.workoutEditor.docsLabel,
      featured: true,
    },
    {
      key: "vdotCalculator",
      title: t("vdotCalculator.title"),
      description: t("vdotCalculator.description"),
      href: withLocalePath(lang, "/vdot-calculator"),
      icon: Target,
      tone: toolTones.running,
      signal: "VDOT",
      type: ui.training,
      bestFor: toolDetails.vdotCalculator.bestFor,
      output: toolDetails.vdotCalculator.output,
      question: toolDetails.vdotCalculator.question,
      docsHref: withLocalePath(lang, "/docs/metrics/pace/zones"),
      docsLabel: toolDetails.vdotCalculator.docsLabel,
      featured: true,
    },
    {
      key: "runningPaceCalculator",
      title: t("runningPaceCalculator.title"),
      description: t("runningPaceCalculator.description"),
      href: withLocalePath(lang, "/running-pace-calculator"),
      icon: Footprints,
      tone: toolTones.running,
      signal: "PACE",
      type: ui.training,
      bestFor: toolDetails.runningPaceCalculator.bestFor,
      output: toolDetails.runningPaceCalculator.output,
      question: toolDetails.runningPaceCalculator.question,
      docsHref: withLocalePath(lang, "/docs/metrics/pace/zones"),
      docsLabel: toolDetails.runningPaceCalculator.docsLabel,
      featured: false,
    },
    {
      key: "raceTimePredictor",
      title: t("raceTimePredictor.title"),
      description: t("raceTimePredictor.description"),
      href: withLocalePath(lang, "/race-time-predictor"),
      icon: Trophy,
      tone: toolTones.race,
      signal: "RACE",
      type: ui.training,
      bestFor: toolDetails.raceTimePredictor.bestFor,
      output: toolDetails.raceTimePredictor.output,
      question: toolDetails.raceTimePredictor.question,
      docsHref: withLocalePath(lang, "/vdot-calculator"),
      docsLabel: toolDetails.raceTimePredictor.docsLabel,
      featured: true,
    },
    {
      key: "vo2MaxCalculator",
      title: t("vo2MaxCalculator.title"),
      description: t("vo2MaxCalculator.description"),
      href: withLocalePath(lang, "/vo2-max-calculator"),
      icon: Wind,
      tone: toolTones.physiology,
      signal: "VO2 Max",
      type: ui.training,
      bestFor: toolDetails.vo2MaxCalculator.bestFor,
      output: toolDetails.vo2MaxCalculator.output,
      question: toolDetails.vo2MaxCalculator.question,
      docsHref: withLocalePath(lang, "/docs/metrics/maximal-oxygen-uptake"),
      docsLabel: toolDetails.vo2MaxCalculator.docsLabel,
      featured: true,
    },
    {
      key: "estimateCp",
      title: t("estimateCp.title"),
      description: t("estimateCp.description"),
      href: withLocalePath(lang, "/ftp-calculator"),
      icon: Bike,
      tone: toolTones.power,
      signal: "FTP",
      type: ui.training,
      bestFor: toolDetails.estimateCp.bestFor,
      output: toolDetails.estimateCp.output,
      question: toolDetails.estimateCp.question,
      docsHref: withLocalePath(lang, "/docs/metrics/power/critical-power"),
      docsLabel: toolDetails.criticalPowerCalculator.docsLabel,
      featured: true,
    },
    {
      key: "tssCalculator",
      title: t("tssCalculator.title"),
      description: t("tssCalculator.description"),
      href: withLocalePath(lang, "/tss-calculator"),
      icon: Calculator,
      tone: toolTones.load,
      signal: "TSS",
      type: ui.training,
      bestFor: toolDetails.tssCalculator.bestFor,
      output: toolDetails.tssCalculator.output,
      question: toolDetails.tssCalculator.question,
      docsHref: withLocalePath(
        lang,
        "/docs/metrics/training-load/training-stress-score",
      ),
      docsLabel: toolDetails.tssCalculator.docsLabel,
      featured: true,
    },
    {
      key: "trainingLoadCalculator",
      title: t("trainingLoadCalculator.title"),
      description: t("trainingLoadCalculator.description"),
      href: withLocalePath(lang, "/training-load-calculator"),
      icon: ChartSpline,
      tone: toolTones.load,
      signal: "PMC",
      type: ui.training,
      bestFor: toolDetails.trainingLoadCalculator.bestFor,
      output: toolDetails.trainingLoadCalculator.output,
      question: toolDetails.trainingLoadCalculator.question,
      docsHref: withLocalePath(lang, "/docs/metrics/pmc/chronic-training-load"),
      docsLabel: toolDetails.trainingLoadCalculator.docsLabel,
      featured: true,
    },
    {
      key: "criticalPowerCalculator",
      title: t("criticalPowerCalculator.title"),
      description: t("criticalPowerCalculator.description"),
      href: withLocalePath(lang, "/critical-power-calculator"),
      icon: Zap,
      tone: toolTones.power,
      signal: "CP",
      type: ui.training,
      bestFor: toolDetails.criticalPowerCalculator.bestFor,
      output: toolDetails.criticalPowerCalculator.output,
      question: toolDetails.criticalPowerCalculator.question,
      docsHref: withLocalePath(lang, "/docs/metrics/power/critical-power"),
      docsLabel: toolDetails.estimateCp.docsLabel,
      featured: false,
    },
    {
      key: "cssCalculator",
      title: t("cssCalculator.title"),
      description: t("cssCalculator.description"),
      href: withLocalePath(lang, "/css-calculator"),
      icon: Waves,
      tone: toolTones.swim,
      signal: "CSS",
      type: ui.training,
      bestFor: toolDetails.cssCalculator.bestFor,
      output: toolDetails.cssCalculator.output,
      question: toolDetails.cssCalculator.question,
      docsHref: withLocalePath(
        lang,
        "/docs/metrics/training-load/training-stress-score",
      ),
      docsLabel: toolDetails.cssCalculator.docsLabel,
      featured: true,
    },
    {
      key: "lactateThresholdCalculator",
      title: t("lactateThresholdCalculator.title"),
      description: t("lactateThresholdCalculator.description"),
      href: withLocalePath(lang, "/lactate-threshold-calculator"),
      icon: FlaskConical,
      tone: toolTones.physiology,
      signal: "THR",
      type: ui.training,
      bestFor: toolDetails.lactateThresholdCalculator.bestFor,
      output: toolDetails.lactateThresholdCalculator.output,
      question: toolDetails.lactateThresholdCalculator.question,
      docsHref: withLocalePath(
        lang,
        "/docs/metrics/physiology/lactate-threshold",
      ),
      docsLabel: toolDetails.lactateThresholdCalculator.docsLabel,
      featured: false,
    },
    {
      key: "maxHeartRateCalculator",
      title: t("maxHeartRateCalculator.title"),
      description: t("maxHeartRateCalculator.description"),
      href: withLocalePath(lang, "/max-heart-rate-calculator"),
      icon: HeartPulse,
      tone: toolTones.heart,
      signal: "HRmax",
      type: ui.training,
      bestFor: toolDetails.maxHeartRateCalculator.bestFor,
      output: toolDetails.maxHeartRateCalculator.output,
      question: toolDetails.maxHeartRateCalculator.question,
      docsHref: withLocalePath(lang, "/docs/metrics/heart-rate/zones"),
      docsLabel: toolDetails.heartRateZonesCalculator.docsLabel,
      featured: false,
    },
    {
      key: "heartRateZonesCalculator",
      title: t("heartRateZonesCalculator.title"),
      description: t("heartRateZonesCalculator.description"),
      href: withLocalePath(lang, "/heart-rate-zones-calculator"),
      icon: ScanHeart,
      tone: toolTones.heart,
      signal: "HR ZONES",
      type: ui.training,
      bestFor: toolDetails.heartRateZonesCalculator.bestFor,
      output: toolDetails.heartRateZonesCalculator.output,
      question: toolDetails.heartRateZonesCalculator.question,
      docsHref: withLocalePath(lang, "/docs/metrics/heart-rate/zones"),
      docsLabel: toolDetails.maxHeartRateCalculator.docsLabel,
      featured: false,
    },
    {
      key: "zone2HeartRateCalculator",
      title: t("zone2HeartRateCalculator.title"),
      description: t("zone2HeartRateCalculator.description"),
      href: withLocalePath(lang, "/zone-2-heart-rate-calculator"),
      icon: Heart,
      tone: toolTones.heart,
      signal: "ZONE 2",
      type: ui.training,
      bestFor: toolDetails.zone2HeartRateCalculator.bestFor,
      output: toolDetails.zone2HeartRateCalculator.output,
      question: toolDetails.zone2HeartRateCalculator.question,
      docsHref: withLocalePath(lang, "/docs/metrics/heart-rate/zones"),
      docsLabel: toolDetails.zone2HeartRateCalculator.docsLabel,
      featured: true,
    },
    {
      key: "brickWorkout",
      title: t("brickWorkout.title"),
      description: t("brickWorkout.description"),
      href: withLocalePath(lang, "/brick-workout"),
      icon: Workflow,
      tone: toolTones.planned,
      signal: "BRICK",
      type: ui.training,
      bestFor: toolDetails.brickWorkout.bestFor,
      output: toolDetails.brickWorkout.output,
      question: toolDetails.brickWorkout.question,
      docsHref: withLocalePath(lang, "/olympic-triathlon-training-plan"),
      docsLabel: toolDetails.brickWorkout.docsLabel,
      featured: false,
    },
    {
      key: "powerZonesCalculator",
      title: t("powerZonesCalculator.title"),
      description: t("powerZonesCalculator.description"),
      href: withLocalePath(lang, "/power-zones-calculator"),
      icon: CircleGauge,
      tone: toolTones.power,
      signal: "POWER",
      type: ui.training,
      bestFor: toolDetails.powerZonesCalculator.bestFor,
      output: toolDetails.powerZonesCalculator.output,
      question: toolDetails.powerZonesCalculator.question,
      docsHref: withLocalePath(lang, "/docs/metrics/power/zones"),
      docsLabel: toolDetails.powerZonesCalculator.docsLabel,
      featured: false,
    },
    {
      key: "fitFileViewer",
      title: tFitFileViewer("page.title"),
      description: tFitFileViewer("hub.description"),
      href: withLocalePath(lang, "/fit-file-viewer"),
      icon: FileChartColumn,
      tone: toolTones.files,
      signal: "FIT VIEW",
      type: ui.utility,
      bestFor: tFitFileViewer("hub.bestFor"),
      output: tFitFileViewer("hub.output"),
      question: tFitFileViewer("hub.question"),
      docsHref: "https://developer.garmin.com/fit/",
      docsLabel: tFitFileViewer("hub.docsLabel"),
      featured: false,
    },
    {
      key: "converter",
      title: t("converter.title"),
      description: t("converter.description"),
      href: withLocalePath(lang, "/converter"),
      icon: RefreshCw,
      tone: toolTones.files,
      signal: "GPX / FIT / TCX",
      type: ui.utility,
      bestFor: toolDetails.converter.bestFor,
      output: toolDetails.converter.output,
      question: toolDetails.converter.question,
      docsHref: withLocalePath(lang, "/docs"),
      docsLabel: toolDetails.converter.docsLabel,
      featured: false,
    },
    {
      key: "fitCourseConverter",
      title: t("fitCourseConverter.title"),
      description: t("fitCourseConverter.description"),
      href: withLocalePath(lang, "/fit-course-converter"),
      icon: Map,
      tone: toolTones.routes,
      signal: "FIT Course",
      type: ui.route,
      bestFor: toolDetails.fitCourseConverter.bestFor,
      output: toolDetails.fitCourseConverter.output,
      question: toolDetails.fitCourseConverter.question,
      docsHref: withLocalePath(lang, "/docs"),
      docsLabel: toolDetails.converter.docsLabel,
      featured: false,
    },
  ];

  const toolGroups = [
    {
      key: "plans",
      label: hubCollection.toolsGroup,
      tools: planHubs,
    },
    {
      key: "training",
      label: ui.training,
      tools: tools.filter((tool) => tool.type === ui.training),
    },
    {
      key: "files",
      label: `${ui.utility} / ${ui.route}`,
      tools: tools.filter((tool) => tool.type !== ui.training),
    },
  ].filter((group) => group.tools.length > 0);
  const featuredTools = tools.filter((tool) => tool.featured).slice(0, 4);
  const toolCount = planHubs.length + tools.length;

  const itemListId = schemaId(pageUrl, "tools");
  const structuredData = schemaGraph([
    webPageSchema({
      id: schemaId(pageUrl, "webpage"),
      url: pageUrl,
      name: t("title"),
      description: t("subtitle"),
      lang,
      type: "CollectionPage",
      mainEntityId: itemListId,
    }),
    itemListSchema({
      id: itemListId,
      items: [
        ...planHubs.map((hub) => ({
          name: hub.title,
          description: hub.description,
          url: `${siteUrl}${hub.href}`,
        })),
        ...tools.map((tool) => ({
          name: tool.title,
          description: tool.description,
          url: `${siteUrl}${tool.href}`,
        })),
      ],
    }),
    breadcrumbSchema({
      id: schemaId(pageUrl, "breadcrumb"),
      items: [
        {
          name: tCommon("home"),
          item: `${siteUrl}${prefix}/`,
        },
        {
          name: tCommon("tools"),
          item: pageUrl,
        },
      ],
    }),
  ]);

  return (
    <main className="client-demo-radius overflow-x-hidden bg-background text-foreground">
      <JsonLd id="tools-structured-data" data={structuredData} />

      <section className="bg-card px-4 pb-12 pt-14 md:px-6 md:pb-16 md:pt-20">
        <div className="mx-auto max-w-7xl">
          <header className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-muted-foreground">
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-brand"
              />
              {ui.badge}
            </div>
            <h1 className="font-display mt-5 text-balance text-4xl font-bold leading-[1.04] tracking-[-0.035em] md:text-6xl">
              {ui.headline}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-7 text-muted-foreground md:text-lg">
              {ui.subtitle}
            </p>
            <div className="mt-7 flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center">
              <Link
                href={withLocalePath(lang, "/running-pace-calculator")}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-control bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/88 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px"
              >
                {ui.primary}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link
                href={withLocalePath(lang, "/docs/metrics/pace/zones")}
                className="inline-flex h-11 items-center justify-center rounded-control bg-secondary px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px"
              >
                {ui.secondary}
              </Link>
            </div>
          </header>

          <section aria-labelledby="featured-tools-title" className="mt-12">
            <div className="mb-4 flex items-end justify-between gap-4 px-1 sm:mb-5">
              <div>
                <h2
                  id="featured-tools-title"
                  className="font-display text-2xl font-bold tracking-tight"
                >
                  {ui.featured}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {ui.compactIntro}
                </p>
              </div>
              <a
                href="#all-tools"
                className="hidden items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
              >
                {ui.allTools}
                <ArrowRight aria-hidden="true" className="size-4" />
              </a>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {featuredTools.map((tool, index) => {
                const Icon = tool.icon;
                return (
                  <Link
                    key={tool.href}
                    href={tool.href}
                    data-tool-key={tool.key}
                    style={toolToneStyle(tool.tone)}
                    className={[
                      "group relative flex min-h-[12.5rem] flex-col gap-4 overflow-hidden rounded-feature p-5 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      index === 0
                        ? "bg-brand-soft"
                        : "bg-secondary/70 hover:bg-secondary",
                    ].join(" ")}
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid size-12 shrink-0 place-items-center rounded-surface bg-[var(--tool-tone-soft)] text-[var(--tool-tone-strong)]">
                        <Icon aria-hidden="true" className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="line-clamp-2 text-[15px] font-semibold leading-5">
                            {tool.title}
                          </h3>
                          <ArrowRight
                            aria-hidden="true"
                            className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                          />
                        </div>
                        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--tool-tone-strong)]">
                          {tool.signal}
                        </p>
                      </div>
                    </div>
                    <p className="line-clamp-3 text-[13px] leading-5 text-muted-foreground">
                      {tool.description}
                    </p>
                    <div className="mt-auto flex items-center gap-2 text-xs font-semibold text-foreground/75">
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full bg-[var(--tool-tone)]"
                      />
                      <span className="line-clamp-2">{tool.output}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      </section>

      <section
        id="all-tools"
        className="scroll-mt-20 bg-secondary/55 px-4 py-12 dark:bg-background md:px-6 md:py-16"
      >
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 pb-7 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="max-w-2xl">
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {toolCount} · {ui.allTools}
              </div>
              <h2 className="font-display mt-2 text-3xl font-bold tracking-[-0.025em] md:text-4xl">
                {ui.choose}
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
                {ui.chooseIntro}
              </p>
            </div>
            <nav
              aria-label={ui.allTools}
              className="flex flex-wrap gap-2 md:justify-end"
            >
              {toolGroups.map((group) => (
                <a
                  key={group.key}
                  href={`#${group.key}-tools`}
                  className="inline-flex h-9 items-center gap-2 rounded-control bg-card px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {group.label}
                  <span className="tabular-nums text-xs text-muted-foreground/70">
                    {group.tools.length}
                  </span>
                </a>
              ))}
            </nav>
          </div>

          <div>
            {toolGroups.map((group) => (
              <section
                key={group.key}
                id={`${group.key}-tools`}
                aria-labelledby={`${group.key}-tools-title`}
                className="scroll-mt-20 py-10 first:pt-8 md:py-12"
              >
                <div className="mb-5 flex items-end justify-between gap-4 px-1">
                  <h3
                    id={`${group.key}-tools-title`}
                    className="font-display text-2xl font-bold tracking-tight"
                  >
                    {group.label}
                  </h3>
                  <span className="text-sm font-medium tabular-nums text-muted-foreground">
                    {group.tools.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.tools.map((tool) => {
                    const Icon = tool.icon;
                    return (
                      <Link
                        key={tool.href}
                        href={tool.href}
                        data-tool-key={tool.key}
                        style={toolToneStyle(tool.tone)}
                        className="group flex min-h-[11rem] flex-col rounded-overlay bg-card p-4 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-secondary dark:bg-secondary/75 dark:hover:bg-secondary"
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="grid size-10 shrink-0 place-items-center rounded-control-lg bg-[var(--tool-tone-soft)] text-[var(--tool-tone-strong)]">
                            <Icon aria-hidden="true" className="size-[18px]" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="line-clamp-2 text-sm font-semibold leading-5">
                                {tool.title}
                              </h4>
                              <ArrowRight
                                aria-hidden="true"
                                className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                              />
                            </div>
                            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--tool-tone-strong)]">
                              {tool.signal}
                            </div>
                          </div>
                        </div>
                        <p className="mt-3 line-clamp-3 text-[12.5px] leading-5 text-muted-foreground">
                          {tool.description}
                        </p>
                        <div className="mt-auto flex items-center gap-2 pt-4 text-[11px] text-muted-foreground">
                          <span
                            aria-hidden="true"
                            className="size-1.5 shrink-0 rounded-full bg-[var(--tool-tone)]"
                          />
                          <span className="font-semibold uppercase tracking-[0.1em]">
                            {ui.output}
                          </span>
                          <span className="ml-auto max-w-[68%] truncate font-medium text-foreground/70">
                            {tool.output}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
