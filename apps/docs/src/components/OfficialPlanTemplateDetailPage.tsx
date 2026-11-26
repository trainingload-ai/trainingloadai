import { getTranslations } from "next-intl/server";
import type messages from "@trainingloadai/messages/docs/en.json";
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
import { WorkoutStructurePreview, type WorkoutStructureCopy } from "@/components/WorkoutStructurePreview";
import { RunningPlanIntentGuide } from "@/components/RunningPlanIntentGuide";
import { getPlanIntentGuide } from "@/lib/running-plan-intents";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import { i18n, isSeoIndexedLanguage } from "@/lib/i18n";
import { optimizeSeoText } from "@/lib/seo-metadata";
import {
  breadcrumbSchema,
  schemaGraph,
  schemaId,
  schemaLanguage,
} from "@/lib/seo-schema";

export type OfficialPlanSlug =
  | "improve-10k"
  | "target-10k"
  | "improve-half-marathon"
  | "target-half-marathon"
  | "improve-marathon"
  | "target-marathon";

function getPlanTranslations(locale: string) {
  return getTranslations({
    locale: (i18n.languages as readonly string[]).includes(locale)
      ? locale
      : i18n.defaultLanguage,
    namespace: "runningPlanPages",
  });
}

export async function officialPlanTemplateHeading({
  lang,
  slug,
}: {
  lang: string;
  slug: OfficialPlanSlug;
}) {
  const t = await getPlanTranslations(lang);
  return t(`officialTemplate.pageHeadings.${slug}`);
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

export async function officialPlanTemplateMetadata({
  lang,
  slug,
}: {
  lang: string;
  slug: OfficialPlanSlug;
}): Promise<Metadata> {
  const template = getRunPlanTemplate(slug);
  if (!template) throw new Error(`Missing official template: ${slug}`);
  const t = await getPlanTranslations(lang);
  const copy = template.copy[normalizePlanTemplateLocale(lang)];
  const path = `${routeForTemplate(slug)}/${routeSuffix(slug)}`;
  const siteUrl = getSiteUrl();
  const prefix = localePrefix(lang);
  const seo = optimizeSeoText({
    locale: lang,
    context: "plan",
    title: t(`officialTemplate.seoTitles.${slug}`),
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

export async function OfficialPlanTemplateDetailPage({
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
  const t = await getPlanTranslations(lang);
  const labels = t.raw("officialTemplate.labels") as typeof messages.runningPlanPages.officialTemplate.labels;
  const pageHeading = await officialPlanTemplateHeading({ lang, slug });
  const workoutStructureCopy = t.raw("workoutStructure") as WorkoutStructureCopy;
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
                              copy={workoutStructureCopy}
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
