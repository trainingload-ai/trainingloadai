import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { JsonLd } from "@/components/JsonLd";
import { ContentFreshness } from "@/components/ContentFreshness";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  CalendarDays,
  Gauge,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  breadcrumbSchema,
  schemaGraph,
  schemaId,
  schemaLanguage,
} from "@/lib/seo-schema";

function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  return raw.replace(/\/+$/, "");
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
    namespace: "trainingLoadPage.metadata",
  });
  const keywordsRaw = t.raw("keywords");
  const keywords = Array.isArray(keywordsRaw) ? keywordsRaw : undefined;

  return {
    title: t("title"),
    description: t("description"),
    keywords,
    alternates: {
      canonical: `${siteUrl}${prefix}/training-load`,
      languages: absoluteAlternatesForPath(siteUrl, "/training-load"),
    },
    openGraph: {
      title: t("title"),
      description: t("description"),
      type: "website",
      url: `${siteUrl}${prefix}/training-load`,
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("description"),
    },
  };
}

export default async function TrainingLoadPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const prefix = localePrefix(lang);
  const siteUrl = getSiteUrl();
  const t = await getTranslations({
    locale: lang,
    namespace: "trainingLoadPage",
  });
  const tCommon = await getTranslations({
    locale: lang,
    namespace: "commonLinks",
  });
  const appUrl = `https://app.trainingload.ai/${lang}`;
  const pageUrl = `${siteUrl}${prefix}/training-load`;
  const screenshotLocale = ["zh", "zh-hant", "ja"].includes(lang) ? lang : "en";
  const productScreenshot = `/5k-training-plan/web-home-dark-v2-${screenshotLocale}.png`;
  const ui = t.raw("ui") as Record<string, string>;
  const loop = t.raw("loop") as string[][];
  const cards = t.raw("cards") as string[][];
  const pmcActions = t.raw("pmcActions") as string[][];
  const answerBlocks = t.raw("answerBlocks") as string[][];
  const faq = t.raw("faq") as string[][];
  const appId = schemaId(siteUrl, "app");
  const webpageId = schemaId(pageUrl, "webpage");
  const faqId = schemaId(pageUrl, "faq");
  const answerListId = schemaId(pageUrl, "answer-blocks");

  const jsonLd = schemaGraph([
    {
      "@type": "WebApplication",
      "@id": appId,
      name: "Trainingload.ai",
      url: appUrl,
      description: ui.subtitle,
      applicationCategory: "HealthApplication",
      operatingSystem: "Web",
      isAccessibleForFree: true,
      inLanguage: schemaLanguage(lang),
      featureList: cards.map(([title]) => title).filter(Boolean),
    },
    {
      "@type": "WebPage",
      "@id": webpageId,
      name: ui.title,
      description: ui.subtitle,
      url: pageUrl,
      inLanguage: schemaLanguage(lang),
      dateModified: ui.lastUpdatedDate,
      about: { "@id": appId },
      mainEntity: { "@id": appId },
    },
    {
      "@type": "ItemList",
      "@id": answerListId,
      name: ui.answerTitle,
      inLanguage: schemaLanguage(lang),
      itemListElement: answerBlocks.map(([name, description], index) => ({
        "@type": "ListItem",
        position: index + 1,
        name,
        description,
      })),
    },
    {
      "@type": "FAQPage",
      "@id": faqId,
      url: `${pageUrl}#faq`,
      inLanguage: schemaLanguage(lang),
      mainEntity: faq.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: {
          "@type": "Answer",
          text: answer,
        },
      })),
    },
    breadcrumbSchema({
      id: schemaId(pageUrl, "breadcrumb"),
      items: [
        { name: tCommon("home"), item: `${siteUrl}${prefix}/` },
        { name: ui.title, item: pageUrl },
      ],
    }),
  ]);

  const metricColors = [
    "var(--chart-fitness)",
    "var(--chart-fatigue)",
    "var(--chart-form)",
    "var(--brand)",
  ];

  return (
    <main className="overflow-x-hidden bg-background text-foreground">
      <JsonLd id="training-load-structured-data" data={jsonLd} />

      <section className="relative overflow-hidden bg-secondary/60 px-4 py-14 md:px-6 md:py-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--chart-fitness) 36%, transparent) 1px, transparent 1.35px)",
            backgroundSize: "26px 26px",
            maskImage:
              "radial-gradient(ellipse 72% 110% at 100% 100%, #000 0%, rgba(0,0,0,.72) 38%, rgba(0,0,0,.2) 70%, transparent 92%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 72% 110% at 100% 100%, #000 0%, rgba(0,0,0,.72) 38%, rgba(0,0,0,.2) 70%, transparent 92%)",
          }}
        />
        <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.88fr)_minmax(24rem,0.72fr)] lg:items-center lg:gap-16">
          <div>
            <h1 className="font-display max-w-4xl text-balance text-4xl font-bold leading-[1.04] tracking-[-0.035em] md:text-6xl">
              {ui.title}
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-7 text-muted-foreground md:text-lg md:leading-8">
              {t("definition")}
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              {ui.subtitle}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={appUrl}
                className="inline-flex h-11 items-center justify-center rounded-control bg-brand px-5 text-sm font-bold text-brand-foreground transition-colors hover:bg-brand/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {ui.primary}
                <ArrowRight aria-hidden="true" className="ml-2 size-4" />
              </Link>
              <Link
                href={`${prefix}/ai-coach`}
                className="inline-flex h-11 items-center justify-center rounded-control bg-card px-5 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {ui.secondary}
              </Link>
            </div>
          </div>

          <figure className="relative overflow-hidden rounded-feature bg-neutral-950 shadow-[0_28px_80px_-44px_rgba(0,0,0,0.72)]">
            <div className="aspect-[3/2] overflow-hidden">
              <Image
                src={productScreenshot}
                alt={`${ui.title} — Trainingload.ai`}
                width={1440}
                height={960}
                priority
                sizes="(min-width: 1024px) 44vw, 100vw"
                className="size-full object-cover object-left-top"
              />
            </div>
          </figure>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 md:px-6 md:py-20">
        <div className="grid gap-8 lg:grid-cols-[0.62fr_1fr] lg:gap-16">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-brand-strong">
              {ui.answerEyebrow}
            </div>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-[-0.025em] md:text-4xl">
              {ui.answerTitle}
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground md:text-base">
              {ui.answerSubtitle}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {answerBlocks.map(([title, text], index) => (
              <article
                key={title}
                className="rounded-overlay bg-secondary/70 p-5 sm:p-6"
              >
                <div className="text-xs font-bold tabular-nums text-brand-strong">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <h3 className="mt-8 text-lg font-bold tracking-[-0.015em]">
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-secondary/55 px-4 py-14 md:px-6 md:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <h2 className="font-display text-3xl font-bold tracking-[-0.025em] md:text-4xl">
              {ui.loopTitle}
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              {ui.loopSubtitle}
            </p>
          </div>
          <ol className="relative mt-9 grid gap-3 md:grid-cols-4">
            <div
              aria-hidden="true"
              className="absolute left-[12.5%] right-[12.5%] top-[1.35rem] hidden h-1 rounded-full bg-card md:block"
            />
            {[CalendarDays, Activity, Gauge, RefreshCcw].map((Icon, index) => (
              <li
                key={loop[index][0]}
                className="relative rounded-overlay bg-card p-5"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="grid size-11 place-items-center rounded-surface bg-brand-soft text-brand-strong">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="text-xs font-bold tabular-nums text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-8 text-lg font-bold">{loop[index][0]}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {loop[index][1]}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 md:px-6 md:py-20">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.72fr)_minmax(20rem,0.45fr)] lg:items-end lg:gap-16">
          <div>
            <div className="inline-flex size-11 items-center justify-center rounded-surface bg-brand-soft text-brand-strong">
              <BrainCircuit aria-hidden="true" className="size-5" />
            </div>
            <h2 className="font-display mt-5 text-3xl font-bold tracking-[-0.025em] md:text-4xl">
              {ui.proofTitle}
            </h2>
          </div>
          <p className="text-sm leading-7 text-muted-foreground md:text-base">
            {ui.proofSubtitle}
          </p>
        </div>

        <div className="mt-9 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {cards.map(([title, label, text], index) => (
            <article
              key={title}
              className="flex min-h-[17rem] flex-col rounded-overlay bg-secondary/70 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className="grid size-10 place-items-center rounded-surface text-sm font-black"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${metricColors[index]} 16%, transparent)`,
                    color: metricColors[index],
                  }}
                >
                  {index < 3 ? (
                    title
                  ) : (
                    <Sparkles aria-hidden="true" className="size-4" />
                  )}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {ui.signal}
                </span>
              </div>
              <h3 className="mt-7 text-lg font-bold">{label}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {text}
              </p>
              <div
                aria-hidden="true"
                className="mt-auto h-1.5 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${metricColors[index]} 0 54%, color-mix(in srgb, ${metricColors[index]} 12%, transparent) 54% 100%)`,
                }}
              />
            </article>
          ))}
        </div>
      </section>

      <section className="bg-secondary/55 px-4 py-14 md:px-6 md:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.72fr_1fr] lg:gap-16">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-[-0.025em] md:text-4xl">
              {ui.pmcTitle}
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              {ui.pmcSubtitle}
            </p>

            <aside className="mt-8 rounded-overlay bg-card p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-surface bg-brand-soft text-brand-strong">
                  <ShieldCheck aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-brand-strong">
                    {ui.methodologyEyebrow}
                  </div>
                  <h3 className="mt-1 text-base font-bold">
                    {ui.methodologyTitle}
                  </h3>
                </div>
              </div>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">
                {ui.methodologyText}
              </p>
              <div className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {ui.sourcesTitle}
              </div>
              <ul className="mt-3 grid gap-2 text-xs leading-5 text-muted-foreground">
                {(t.raw("sources") as string[]).map((source) => (
                  <li key={source} className="flex gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1 shrink-0 rounded-full bg-brand"
                    />
                    <span>{source}</span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>

          <div className="grid gap-3">
            {pmcActions.map(([signal, action], index) => {
              const Icon =
                index === 0 ? TrendingDown : index === 1 ? TrendingUp : Target;
              return (
                <article
                  key={`${signal}-${action}`}
                  className="rounded-overlay bg-card p-5 sm:p-6"
                >
                  <div className="flex items-start gap-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-surface bg-brand-soft text-brand-strong">
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <div>
                      <div className="text-sm font-bold">{signal}</div>
                      <div className="my-3 h-px w-12 bg-brand" />
                      <p className="text-sm leading-7 text-muted-foreground">
                        {action}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section
        id="faq"
        className="mx-auto max-w-7xl px-4 py-14 md:px-6 md:py-20"
      >
        <div className="max-w-3xl">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-brand-strong">
            FAQ
          </div>
          <h2 className="font-display mt-3 text-3xl font-bold tracking-[-0.025em] md:text-4xl">
            {ui.faqTitle}
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            {ui.faqSubtitle}
          </p>
        </div>
        <div className="mt-8 grid gap-2">
          {faq.map(([question, answer], index) => (
            <details
              key={question}
              className="group rounded-surface bg-secondary/70 px-5 py-5 md:px-6"
              open={index === 0}
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-5 text-base font-bold marker:content-none md:text-lg">
                <span>{question}</span>
                <span
                  aria-hidden="true"
                  className="mt-0.5 text-2xl font-light leading-none text-brand-strong transition group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-4xl pr-8 text-sm leading-7 text-muted-foreground">
                {answer}
              </p>
            </details>
          ))}
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href={`${prefix}/docs/metrics/training-load/training-stress-score`}
            className="inline-flex h-10 items-center justify-center rounded-control bg-secondary px-4 text-xs font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {ui.faqDocsAction}
          </Link>
          <Link
            href={`${prefix}/tools`}
            className="inline-flex h-10 items-center justify-center rounded-control bg-secondary px-4 text-xs font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {ui.faqToolsAction}
          </Link>
          <Link
            href={appUrl}
            className="inline-flex h-10 items-center justify-center rounded-control bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {ui.faqProductAction}
          </Link>
        </div>
      </section>

      <section className="px-4 pb-14 md:px-6 md:pb-20">
        <div className="mx-auto grid max-w-7xl gap-8 overflow-hidden rounded-feature bg-brand p-7 text-brand-foreground sm:p-8 md:p-10 lg:grid-cols-[1fr_auto] lg:items-center lg:p-12">
          <div>
            <Target aria-hidden="true" className="size-6" />
            <h2 className="font-display mt-5 text-3xl font-bold tracking-[-0.025em] md:text-5xl">
              {ui.ctaTitle}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-brand-foreground/75">
              {ui.ctaText}
            </p>
          </div>
          <Link
            href={appUrl}
            className="inline-flex h-12 items-center justify-center rounded-control bg-primary px-6 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {ui.primary}
            <ArrowRight aria-hidden="true" className="ml-2 size-4" />
          </Link>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pb-8">
        <ContentFreshness lastUpdated={ui.lastUpdatedDate} />
      </div>
    </main>
  );
}
