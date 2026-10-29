import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { ProductBrowserWindow } from "@/components/ProductBrowserChrome";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Home,
  LayoutList,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import { publicDemoDestination } from "@/lib/public-demo-url";
import { schemaLanguage } from "@/lib/seo-schema";
import { HomeProductDemo } from "../_components/HomeProductDemo";
import { HomeChatPreview } from "../_components/HomeChatPreview";
import { HomeCalendarDemo } from "../_components/HomeCalendarDemo";
import { HomeDashboardPreview } from "../_components/HomeDashboardPreview";
import { HomeDemoLightbox } from "../_components/HomeDemoLightbox";
import { HomePlanPreview } from "../_components/HomePlanPreview";

const featurePrimaryButtonClass =
  "h-11 border-0 px-5 text-sm font-medium shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:bg-primary/90 dark:shadow-none";

const featureOutlineButtonClass =
  "h-11 border-input bg-background px-5 text-sm font-medium shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-neutral-200 hover:text-foreground dark:border-border dark:bg-muted/60 dark:text-foreground dark:shadow-none dark:hover:bg-muted";

const featureIconMap = {
  Home,
  LayoutList,
  CalendarDays,
  BarChart3,
  Bot,
  ClipboardCheck,
};

const coreFeatureIcons = new Set<keyof typeof featureIconMap>([
  "LayoutList",
  "CalendarDays",
  "BarChart3",
  "Bot",
]);

function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  return raw.replace(/\/+$/, "");
}

function integratedFeatureHref(prefix: string, appUrl: string, href: string) {
  if (href.startsWith("APP:")) {
    return `${appUrl}${href.slice("APP:".length)}`;
  }
  return `${prefix}${href}`;
}

function featureId(item: {
  title: string;
  href: string;
  originalHref?: string;
  iconKey: keyof typeof featureIconMap;
}) {
  const href = item.originalHref ?? item.href;
  if (href === "/training-load") return "training-load";
  if (href === "/ai-training-plan" || item.iconKey === "Bot") return "ai-coach";
  if (item.iconKey === "LayoutList") return "training-plan";
  if (item.iconKey === "CalendarDays") return "calendar";
  return item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function accentForFeature(iconKey: keyof typeof featureIconMap) {
  if (iconKey === "LayoutList") {
    return {
      icon: "text-emerald-700 dark:text-emerald-300",
      bg: "bg-emerald-500/10",
      ring: "ring-emerald-500/20",
      bar: "bg-emerald-500",
      soft: "bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200",
    };
  }
  if (iconKey === "CalendarDays") {
    return {
      icon: "text-sky-700 dark:text-sky-300",
      bg: "bg-sky-500/10",
      ring: "ring-sky-500/20",
      bar: "bg-sky-500",
      soft: "bg-sky-50 text-sky-800 dark:bg-sky-400/10 dark:text-sky-200",
    };
  }
  if (iconKey === "BarChart3") {
    return {
      icon: "text-amber-700 dark:text-amber-300",
      bg: "bg-amber-500/10",
      ring: "ring-amber-500/20",
      bar: "bg-amber-500",
      soft: "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200",
    };
  }
  if (iconKey === "Bot") {
    return {
      icon: "text-violet-700 dark:text-violet-300",
      bg: "bg-violet-500/10",
      ring: "ring-violet-500/20",
      bar: "bg-violet-500",
      soft: "bg-violet-50 text-violet-800 dark:bg-violet-400/10 dark:text-violet-200",
    };
  }
  return {
    icon: "text-neutral-700 dark:text-neutral-300",
    bg: "bg-neutral-500/10",
    ring: "ring-neutral-500/20",
    bar: "bg-neutral-500",
    soft: "bg-neutral-100 text-neutral-800 dark:bg-white/10 dark:text-neutral-200",
  };
}

function FeatureDemoPreview({
  item,
  lang,
  expandDemoLabel,
}: {
  item: {
    title: string;
    iconKey: keyof typeof featureIconMap;
  };
  lang: string;
  expandDemoLabel: string;
}) {
  const label = expandDemoLabel + ": " + item.title;
  const appPath =
    item.iconKey === "LayoutList"
      ? "/plans"
      : item.iconKey === "CalendarDays"
        ? "/calendar"
        : item.iconKey === "BarChart3"
          ? "/dashboard"
          : "/ai-coach";
  const destination = publicDemoDestination(lang, appPath);
  const frameClass =
    "relative overflow-hidden rounded-surface border border-neutral-200/80 bg-background shadow-2xl shadow-neutral-900/15 dark:border-white/10 dark:bg-neutral-950 dark:shadow-emerald-900/10";

  if (item.iconKey === "LayoutList") {
    return (
      <ProductBrowserWindow
        address={destination.address}
        addressHref={destination.href}
        addressAriaLabel={`${item.title}: ${destination.address}`}
        className={frameClass}
      >
        <HomeDemoLightbox
          label={label}
          expanded={<HomePlanPreview lang={lang} variant="expanded" />}
        >
          <HomePlanPreview lang={lang} />
        </HomeDemoLightbox>
      </ProductBrowserWindow>
    );
  }

  if (item.iconKey === "CalendarDays") {
    return (
      <ProductBrowserWindow
        address={destination.address}
        addressHref={destination.href}
        addressAriaLabel={`${item.title}: ${destination.address}`}
        className={frameClass}
      >
        <HomeDemoLightbox
          label={label}
          expanded={<HomeCalendarDemo lang={lang} variant="expanded" />}
        >
          <HomeCalendarDemo lang={lang} />
        </HomeDemoLightbox>
      </ProductBrowserWindow>
    );
  }

  if (item.iconKey === "BarChart3") {
    return (
      <ProductBrowserWindow
        address={destination.address}
        addressHref={destination.href}
        addressAriaLabel={`${item.title}: ${destination.address}`}
        className={frameClass}
      >
        <HomeDemoLightbox
          label={label}
          expanded={<HomeDashboardPreview lang={lang} variant="expanded" />}
        >
          <HomeDashboardPreview lang={lang} />
        </HomeDemoLightbox>
      </ProductBrowserWindow>
    );
  }

  return (
    <ProductBrowserWindow
      address={destination.address}
      addressHref={destination.href}
      addressAriaLabel={`${item.title}: ${destination.address}`}
      className={frameClass}
    >
      <HomeDemoLightbox
        label={label}
        expanded={<HomeChatPreview lang={lang} variant="expanded" />}
      >
        <HomeChatPreview lang={lang} />
      </HomeDemoLightbox>
    </ProductBrowserWindow>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const prefix = localePrefix(lang);
  const siteUrl = getSiteUrl();
  const t = await getTranslations({
    locale: lang,
    namespace: "features.metadata",
  });
  const keywordsRaw = t.raw("keywords");
  const keywords = Array.isArray(keywordsRaw) ? keywordsRaw : undefined;

  return {
    title: t("title"),
    description: t("description"),
    keywords,
    alternates: {
      canonical: `${siteUrl}${prefix}/features`,
      languages: absoluteAlternatesForPath(siteUrl, "/features"),
    },
    openGraph: {
      title: t("openGraph.title"),
      description: t("openGraph.description"),
      type: "website",
      url: `${siteUrl}${prefix}/features`,
    },
    twitter: {
      card: "summary_large_image",
      title: t("openGraph.title"),
      description: t("openGraph.description"),
    },
  };
}

export default async function FeaturesPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const tMeta = await getTranslations({
    locale: lang,
    namespace: "features.metadata",
  });
  const t = await getTranslations({ locale: lang, namespace: "features.page" });
  const siteUrl = getSiteUrl();
  const prefix = localePrefix(lang);
  const pageUrl = `${siteUrl}${prefix}/features`;
  const appUrl = `https://app.trainingload.ai/${lang}`;
  const ui = t.raw("ui") as Record<string, string>;
  const stats = t.raw("stats") as string[];
  const intentPages = t.raw("intentPages") as Array<{
    title: string;
    summary: string;
    href: string;
    cta: string;
  }>;
  const modulePages = t.raw("modulePages") as Array<{
    title: string;
    summary: string;
    href: string;
    cta: string;
  }>;
  const rawFeaturePages = t.raw("featurePages") as Array<{
    title: string;
    href: string;
    icon: keyof typeof featureIconMap;
    summary: string;
    bullets: string[];
    cta?: string;
  }>;
  const featurePages = rawFeaturePages.map((item) => ({
    ...item,
    iconKey: item.icon,
    icon: featureIconMap[item.icon] ?? Home,
    href: integratedFeatureHref(prefix, appUrl, item.href),
    originalHref: item.href,
  }));
  const coreFeatures = featurePages.filter((item) =>
    coreFeatureIcons.has(item.iconKey),
  );
  const supportingFeatures = featurePages.filter(
    (item) => !coreFeatureIcons.has(item.iconKey),
  );
  const expandDemoLabel = ui.expandDemoLabel ?? "Expand demo";
  const mcpCopy =
    lang === "zh"
      ? {
          eyebrow: "TrainingLoad MCP",
          title: "让你的 AI 读取训练，也让每个结论可验证。",
          text: "24 个只读训练工具，加上原生 Resources 与 Prompts，覆盖当前状态、周期比较、活动细节、计划执行、比赛与同步诊断。",
          cta: "查看 MCP",
        }
      : {
          eyebrow: "TrainingLoad MCP",
          title:
            "Let your AI read training—and make every conclusion verifiable.",
          text: "24 read-only training tools plus native resources and prompts for current state, period comparison, activity detail, plan execution, competitions, and sync diagnostics.",
          cta: "Explore MCP",
        };

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: tMeta("title"),
        description: tMeta("description"),
        url: pageUrl,
        inLanguage: schemaLanguage(lang),
      },
      {
        "@type": "ItemList",
        name: tMeta("title"),
        itemListElement: featurePages.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: item.title,
          description: item.summary,
          url: item.href.startsWith("http")
            ? item.href
            : `${siteUrl}${item.href}`,
        })),
      },
    ],
  };

  return (
    <main className="client-demo-radius overflow-x-hidden bg-background text-neutral-950 dark:bg-background dark:text-white">
      <JsonLd id="features-structured-data" data={jsonLd} />

      <section className="relative overflow-hidden border-b border-neutral-200/80 px-4 pb-12 pt-12 text-neutral-950 dark:border-white/10 dark:text-white md:px-6 md:pb-16 md:pt-16">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 rounded-compact border border-emerald-500/20 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-400/10 dark:text-emerald-200">
              <Sparkles className="size-3.5" />
              {ui.badge}
            </div>
            <h1
              className="mx-auto mt-5 max-w-5xl text-balance text-[2rem] font-black leading-[1.08] tracking-normal md:text-6xl lg:text-7xl"
              style={
                lang === "en"
                  ? undefined
                  : { overflowWrap: "anywhere", wordBreak: "break-all" }
              }
            >
              {ui.headline}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-neutral-700 dark:text-neutral-300 md:text-lg">
              {ui.intro}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href={appUrl}>
                <Button className={featurePrimaryButtonClass}>
                  {ui.primary}
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </Link>
              <Link href={`${prefix}/docs`}>
                <Button variant="outline" className={featureOutlineButtonClass}>
                  {ui.docs}
                </Button>
              </Link>
            </div>
          </div>

          <div className="relative mx-auto mt-10 max-w-6xl md:mt-14">
            <div className="relative overflow-hidden rounded-surface border border-neutral-200/80 bg-background shadow-2xl shadow-neutral-900/15 dark:border-white/10 dark:bg-neutral-950 dark:shadow-emerald-900/10">
              <HomeDemoLightbox
                label={`${expandDemoLabel}: Trainingload.ai`}
                expanded={<HomeProductDemo lang={lang} variant="expanded" />}
              >
                <HomeProductDemo lang={lang} />
              </HomeDemoLightbox>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-neutral-200/70 bg-white/75 px-4 py-10 dark:border-white/10 dark:bg-card/50">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-4 lg:gap-6">
          {[LayoutList, Activity, BarChart3, Bot].map((Icon, index) => (
            <div
              key={stats[index] ?? index}
              className="rounded-compact border border-neutral-200 bg-card p-4 dark:border-white/10 dark:bg-white/5"
            >
              <Icon className="size-5 text-neutral-900 dark:text-white" />
              <div className="mt-3 text-sm font-black">{stats[index]}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-b border-neutral-800 bg-neutral-950 px-4 py-12 md:px-6 md:py-16 text-white">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="max-w-3xl">
            <div className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
              {mcpCopy.eyebrow}
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
              {mcpCopy.title}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-neutral-400">
              {mcpCopy.text}
            </p>
          </div>
          <Link
            href={`${prefix}/features/mcp`}
            className="inline-flex h-11 items-center gap-2 rounded-compact bg-emerald-400 px-5 text-sm font-semibold text-neutral-950 hover:bg-emerald-300"
          >
            {mcpCopy.cta}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <section className="border-b border-neutral-200/70 bg-white px-4 py-12 md:px-6 md:py-16 dark:border-white/10 dark:bg-card/50">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600 dark:text-emerald-300">
              {ui.intentEyebrow}
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
              {ui.intentTitle}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
              {ui.intentSubtitle}
            </p>
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {intentPages.map((item) => (
              <article
                key={item.href}
                className="rounded-compact border border-neutral-200 bg-card p-5 dark:border-white/10 dark:bg-white/[0.04]"
              >
                <h3 className="text-xl font-black">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {item.summary}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-neutral-200/70 bg-white px-4 py-12 md:px-6 md:py-16 dark:border-white/10 dark:bg-card/50">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600 dark:text-emerald-300">
              {ui.moduleEyebrow}
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
              {ui.moduleTitle}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
              {ui.moduleSubtitle}
            </p>
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {modulePages.map((item) => (
              <article
                key={item.href}
                className="rounded-compact border border-neutral-200 bg-card p-5 dark:border-white/10 dark:bg-white/[0.04]"
              >
                <h3 className="text-xl font-black">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {item.summary}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-16">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600 dark:text-emerald-300">
            {ui.workflow}
          </div>
          <h2 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
            {ui.workflowTitle}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
            {ui.workflowText}
          </p>
        </div>

        <div className="mt-12 space-y-12 md:mt-16 md:space-y-16">
          {coreFeatures.map((item, index) => {
            const Icon = item.icon;
            const accent = accentForFeature(item.iconKey);
            const reverse = index % 2 === 1;

            return (
              <article
                id={featureId(item)}
                key={item.title}
                className={[
                  "grid gap-10 lg:items-center lg:gap-16",
                  reverse
                    ? "lg:grid-cols-[minmax(0,0.58fr)_minmax(0,0.42fr)]"
                    : "lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]",
                ].join(" ")}
              >
                <div className={reverse ? "lg:order-2" : undefined}>
                  <div
                    className={`grid size-11 place-items-center rounded-compact ${accent.bg} ${accent.icon} ring-1 ${accent.ring}`}
                  >
                    <Icon className="size-5" />
                  </div>
                  <h3 className="mt-5 text-2xl font-black tracking-tight md:text-4xl">
                    {item.title}
                  </h3>
                  <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {item.summary}
                  </p>
                  <ul className="mt-6 grid gap-3">
                    {item.bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className="flex gap-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300"
                      >
                        <CheckCircle2
                          className={`mt-0.5 size-4 shrink-0 ${accent.icon}`}
                        />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={reverse ? "lg:order-1" : undefined}>
                  <FeatureDemoPreview
                    item={item}
                    lang={lang}
                    expandDemoLabel={expandDemoLabel}
                  />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-neutral-200/70 bg-white px-4 py-12 md:px-6 md:py-16 dark:border-white/10 dark:bg-card/50">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <ShieldCheck className="size-6 text-emerald-600 dark:text-emerald-300" />
            <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
              {ui.ctaTitle}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
              {ui.ctaText}
            </p>
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {supportingFeatures.map((item) => {
              const Icon = item.icon;
              const accent = accentForFeature(item.iconKey);
              return (
                <article
                  key={item.title}
                  className="rounded-compact border border-neutral-200 bg-card p-5 dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <div className="flex gap-4">
                    <div
                      className={`grid size-10 shrink-0 place-items-center rounded-compact ${accent.bg} ${accent.icon} ring-1 ${accent.ring}`}
                    >
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-black">{item.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                        {item.summary}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.bullets.map((bullet) => (
                      <span
                        key={bullet}
                        className="rounded-compact bg-neutral-200/70 px-2.5 py-1 text-xs font-semibold text-neutral-700 dark:bg-white/10 dark:text-neutral-300"
                      >
                        {bullet}
                      </span>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 py-12 md:px-6 md:py-16">
        <div className="mx-auto grid max-w-7xl gap-6 rounded-compact bg-emerald-500 p-8 text-white shadow-2xl shadow-emerald-500/20 md:p-12 lg:grid-cols-[1fr_auto] lg:items-center dark:text-neutral-950">
          <div>
            <h2 className="text-3xl font-black tracking-tight md:text-5xl">
              {t("cta.title")}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/85 dark:text-neutral-950/75">
              {t("cta.subtitle")}
            </p>
          </div>
          <Link href={appUrl}>
            <Button className={featurePrimaryButtonClass}>
              {t("cta.button")}
              <ArrowRight className="ml-2 size-4" />
            </Button>
          </Link>
        </div>
      </section>
    </main>
  );
}
