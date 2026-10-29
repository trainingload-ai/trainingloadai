import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { optimizeSeoText } from "@/lib/seo-metadata";
import { JsonLd } from "@/components/JsonLd";
import {
  ArrowRight,
  Bike,
  BookOpenCheck,
  CalendarDays,
  Clock3,
  Footprints,
  Route,
  Sparkles,
  Waves,
  Workflow,
} from "lucide-react";
import { TrackedLink } from "@/components/TrackedLink";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import {
  type PlanCollectionCopy,
  type RunningPlanPageLabels,
} from "@/lib/running-plan-pages";
import {
  endurancePlanHubSlugs,
  normalizeEndurancePlanHub,
  type EndurancePlanHub,
  type EndurancePlanHubCollection,
} from "@/lib/endurance-plan-hubs";
import {
  breadcrumbSchema,
  itemListSchema,
  schemaGraph,
  schemaId,
  schemaLanguage,
} from "@/lib/seo-schema";
import { getRpeScaleContent } from "@/lib/rpe-scale-content";
import {
  RUN_PLAN_TEMPLATES,
  getPlanTemplateVariant,
  normalizePlanTemplateLocale,
  type PlanTemplateDefinition,
} from "@shared/plan-templates";

const PUBLIC_PLAN_ROUTES: Record<PlanTemplateDefinition["key"], string> = {
  RUN_5K_FIRST: "/couch-to-5k-training-plan",
  RUN_5K_FINISH: "/5k-training-plan",
  RUN_5K_IMPROVE: "/5k-training-plan/intermediate",
  RUN_10K_FINISH: "/10k-training-plan",
  RUN_10K_IMPROVE: "/10k-training-plan/improve",
  RUN_10K_TARGET: "/10k-training-plan/target",
  RUN_HALF_FINISH: "/half-marathon-training-plan",
  RUN_HALF_IMPROVE: "/half-marathon-training-plan/improve",
  RUN_HALF_TARGET: "/half-marathon-training-plan/target",
  RUN_MARATHON_FINISH: "/marathon-training-plan",
  RUN_MARATHON_IMPROVE: "/marathon-training-plan/improve",
  RUN_MARATHON_TARGET: "/marathon-training-plan/target",
};

function catalogLabels(lang: string) {
  const normalized = lang.toLowerCase();
  if (normalized.startsWith("zh-hant")) {
    return {
      distances: {
        "5K": "5 公里",
        "10K": "10 公里",
        HALF_MARATHON: "半程馬拉松",
        MARATHON: "馬拉松",
      },
      outcomes: { FINISH: "完賽", IMPROVE: "進階", TARGET: "挑戰" },
      foundation: "零基礎入門",
      weeks: "週",
      runs: "每週 {count} 次跑步",
    } as const;
  }
  if (normalized.startsWith("zh")) {
    return {
      distances: {
        "5K": "5 公里",
        "10K": "10 公里",
        HALF_MARATHON: "半程马拉松",
        MARATHON: "马拉松",
      },
      outcomes: { FINISH: "完赛", IMPROVE: "进阶", TARGET: "挑战" },
      foundation: "零基础入门",
      weeks: "周",
      runs: "每周 {count} 次跑步",
    } as const;
  }
  if (normalized.startsWith("ja")) {
    return {
      distances: {
        "5K": "5K",
        "10K": "10K",
        HALF_MARATHON: "ハーフマラソン",
        MARATHON: "マラソン",
      },
      outcomes: { FINISH: "完走", IMPROVE: "向上", TARGET: "目標" },
      foundation: "初心者向け",
      weeks: "週間",
      runs: "週{count}回",
    } as const;
  }
  return {
    distances: {
      "5K": "5K",
      "10K": "10K",
      HALF_MARATHON: "Half marathon",
      MARATHON: "Marathon",
    },
    outcomes: { FINISH: "Finish", IMPROVE: "Improve", TARGET: "Target" },
    foundation: "Beginner foundation",
    weeks: "weeks",
    runs: "{count} runs/week",
  } as const;
}

function templateOutcome(template: PlanTemplateDefinition) {
  if (template.outcome) return template.outcome;
  if (template.key === "RUN_5K_FIRST") return "FIRST" as const;
  if (template.key.includes("_FINISH")) return "FINISH" as const;
  if (template.key.includes("_IMPROVE")) return "IMPROVE" as const;
  return "TARGET" as const;
}

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
    namespace: "runningPlanPages",
  });
  const copy = t.raw("collection") as PlanCollectionCopy;
  const seo = optimizeSeoText({
    locale: lang,
    context: "plan",
    title: copy.metaTitle,
    description: copy.metaDescription,
  });

  return {
    title: seo.title,
    description: seo.description,
    keywords: copy.keywords,
    alternates: {
      canonical: `${siteUrl}${prefix}/plan`,
      languages: absoluteAlternatesForPath(siteUrl, "/plan"),
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "website",
      url: `${siteUrl}${prefix}/plan`,
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
    },
  };
}

export default async function PlanCollectionPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const prefix = localePrefix(lang);
  const siteUrl = getSiteUrl();
  const appUrl = `https://app.trainingload.ai/${lang}`;
  const pageUrl = `${siteUrl}${prefix}/plan`;
  const t = await getTranslations({
    locale: lang,
    namespace: "runningPlanPages",
  });
  const tHubs = await getTranslations({
    locale: lang,
    namespace: "endurancePlanHubs",
  });
  const copy = t.raw("collection") as PlanCollectionCopy;
  const pageCopy = t.raw("labels") as RunningPlanPageLabels;
  const hubCollection = tHubs.raw("collection") as EndurancePlanHubCollection;
  const hubs = endurancePlanHubSlugs.map((slug) =>
    normalizeEndurancePlanHub(
      tHubs.raw(`pages.${slug}`) as EndurancePlanHub,
      slug,
    ),
  );
  const rpeCopy = getRpeScaleContent(lang);
  const labels = catalogLabels(lang);
  const templateLocale = normalizePlanTemplateLocale(lang);
  const plans = RUN_PLAN_TEMPLATES.map((template) => {
    const variant = getPlanTemplateVariant(template);
    if (!variant) throw new Error(`Missing public variant: ${template.key}`);
    const resolvedOutcome = templateOutcome(template);
    const isFoundation = resolvedOutcome === "FIRST";
    const outcome = isFoundation
      ? labels.foundation
      : labels.outcomes[resolvedOutcome as keyof typeof labels.outcomes];
    return {
      key: template.key,
      slug: template.slug,
      templateSlug: template.slug,
      goal: template.goal,
      distance: isFoundation ? "Couch to 5K" : labels.distances[template.goal],
      outcome,
      weeks: `${variant.periodWeeks} ${labels.weeks}`,
      weeklyVolume: labels.runs.replace(
        "{count}",
        String(variant.trainingDaysPerWeek),
      ),
      title: template.copy[templateLocale].title,
      description: template.copy[templateLocale].description,
      routePath: PUBLIC_PLAN_ROUTES[template.key],
    };
  });
  const foundationPlan = plans.find((plan) => plan.key === "RUN_5K_FIRST")!;
  const planGroups = (["5K", "10K", "HALF_MARATHON", "MARATHON"] as const).map(
    (goal) => ({
      goal,
      title: labels.distances[goal],
      plans: plans.filter(
        (plan) => plan.goal === goal && plan.key !== "RUN_5K_FIRST",
      ),
    }),
  );
  const displayGroups = [
    { goal: "FOUNDATION", title: "Couch to 5K", plans: [foundationPlan] },
    ...planGroups,
  ];

  const jsonLd = schemaGraph([
    {
      "@type": "CollectionPage",
      "@id": schemaId(pageUrl, "webpage"),
      name: copy.metaTitle.replace(" | Trainingload.ai", ""),
      description: copy.metaDescription,
      url: pageUrl,
      inLanguage: schemaLanguage(lang),
    },
    itemListSchema({
      id: schemaId(pageUrl, "plans"),
      items: [
        ...plans.map((plan) => ({
          name: plan.title,
          description: plan.description,
          url: `${siteUrl}${prefix}${plan.routePath}`,
        })),
        ...hubs.map((hub) => ({
          name: hub.cardTitle,
          description: hub.cardDescription,
          url: `${siteUrl}${prefix}${hub.routePath}`,
        })),
      ],
    }),
    breadcrumbSchema({
      id: schemaId(pageUrl, "breadcrumb"),
      items: [
        { name: pageCopy.home, item: `${siteUrl}${prefix}/` },
        { name: pageCopy.plans, item: pageUrl },
      ],
    }),
    ...(copy.faq?.length
      ? [
          {
            "@type": "FAQPage",
            "@id": schemaId(pageUrl, "faq"),
            url: `${pageUrl}#faq`,
            inLanguage: schemaLanguage(lang),
            mainEntity: copy.faq.map(([question, answer]) => ({
              "@type": "Question",
              name: question,
              acceptedAnswer: {
                "@type": "Answer",
                text: answer,
              },
            })),
          },
        ]
      : []),
  ]);

  return (
    <main className="overflow-x-hidden bg-background text-neutral-950 dark:bg-background dark:text-white">
      <JsonLd id="plan-collection-structured-data" data={jsonLd} />

      <section className="relative overflow-hidden bg-secondary/60 px-4 py-14 md:px-6 md:py-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--brand) 42%, transparent) 1px, transparent 1.35px)",
            backgroundSize: "26px 26px",
            maskImage:
              "radial-gradient(ellipse 72% 105% at 100% 100%, #000 0%, rgba(0,0,0,.75) 38%, rgba(0,0,0,.24) 68%, transparent 90%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 72% 105% at 100% 100%, #000 0%, rgba(0,0,0,.75) 38%, rgba(0,0,0,.24) 68%, transparent 90%)",
          }}
        />
        <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.65fr)] lg:items-center lg:gap-16">
          <div>
            <div className="marketing-eyebrow inline-flex items-center gap-2 text-brand-strong">
              <Footprints aria-hidden="true" className="size-4" />
              {copy.eyebrow}
            </div>
            <h1 className="font-display mt-5 max-w-4xl text-balance text-4xl font-bold leading-[1.04] tracking-[-0.035em] md:text-6xl">
              {copy.title}
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-7 text-muted-foreground md:text-lg md:leading-8">
              {copy.subtitle}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <TrackedLink
                href="#running-plans"
                eventName="plan_catalog_jump"
                eventProperties={{ slug: "plan-hub", cta_location: "hero" }}
                className="inline-flex h-11 items-center justify-center rounded-control bg-brand px-5 text-sm font-bold text-brand-foreground transition-colors hover:bg-brand/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {copy.primary}
                <ArrowRight className="ml-2 size-4" />
              </TrackedLink>
              <TrackedLink
                href="#ai-adjustment"
                eventName="plan_ai_explainer_jump"
                eventProperties={{
                  slug: "plan-hub",
                  target: "#ai-adjustment",
                  cta_location: "hero",
                }}
                className="inline-flex h-11 items-center justify-center rounded-control bg-card px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {copy.secondary}
              </TrackedLink>
            </div>

            {copy.trustItems?.length ? (
              <ul className="mt-9 grid max-w-3xl gap-2 sm:grid-cols-2">
                {copy.trustItems.map((item) => (
                  <li
                    key={item}
                    className="flex min-h-10 items-center gap-2.5 rounded-control bg-background/70 px-3 text-sm font-medium text-foreground/80"
                  >
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full bg-brand"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <aside className="rounded-feature bg-card p-5 shadow-xs sm:p-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {copy.groupTitle}
                </div>
                <div className="mt-2 font-display text-4xl font-bold tracking-[-0.04em] tabular-nums">
                  {plans.length}
                </div>
              </div>
              <div className="grid size-11 place-items-center rounded-surface bg-brand-soft text-brand-strong">
                <Route aria-hidden="true" className="size-5" />
              </div>
            </div>
            <ol className="mt-6 grid gap-2">
              {displayGroups.map((group, index) => (
                <li
                  key={group.goal}
                  className="group flex min-h-12 items-center gap-3 rounded-control bg-secondary/70 px-3 transition-colors hover:bg-muted"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-control bg-card text-[11px] font-bold tabular-nums text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-semibold">
                    {group.title}
                  </span>
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">
                    {group.plans.length}
                  </span>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </section>

      <section
        id="running-plans"
        className="scroll-mt-24 mx-auto max-w-7xl px-4 py-14 md:px-6 md:py-20"
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(20rem,0.5fr)] lg:items-end lg:gap-16">
          <div className="max-w-3xl">
            <div className="inline-flex size-11 items-center justify-center rounded-surface bg-brand-soft text-brand-strong">
              <Footprints aria-hidden="true" className="size-5" />
            </div>
            <h2 className="font-display mt-5 text-3xl font-bold tracking-[-0.025em] md:text-4xl">
              {copy.groupTitle}
            </h2>
          </div>
          <p className="text-sm leading-7 text-muted-foreground md:text-base">
            {copy.groupSubtitle}
          </p>
        </div>

        <div className="mt-9 hidden max-w-full overflow-x-auto rounded-overlay bg-secondary/65 p-2 lg:block">
          <table className="min-w-[760px] w-full border-separate border-spacing-y-1 text-left text-sm">
            <caption className="sr-only">{copy.groupSubtitle}</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
                >
                  {pageCopy.level}
                </th>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
                >
                  {pageCopy.timeline}
                </th>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
                >
                  {pageCopy.runningPlan}
                </th>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
                >
                  {pageCopy.volume}
                </th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">{copy.cardPrimary}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th
                  colSpan={5}
                  scope="rowgroup"
                  className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-strong"
                >
                  Couch to 5K
                </th>
              </tr>
              <tr className="bg-card">
                <th
                  scope="row"
                  className="rounded-l-control px-4 py-4 font-bold"
                >
                  {foundationPlan.outcome}
                </th>
                <td className="px-4 py-4 text-muted-foreground">
                  {foundationPlan.weeks}
                </td>
                <td className="px-4 py-4 font-medium text-foreground/80">
                  {foundationPlan.title}
                </td>
                <td className="px-4 py-4 text-muted-foreground">
                  {foundationPlan.weeklyVolume}
                </td>
                <td className="rounded-r-control px-4 py-4 text-right">
                  <TrackedLink
                    href={`${prefix}${foundationPlan.routePath}`}
                    eventName="plan_card_click"
                    eventProperties={{
                      distance: foundationPlan.distance,
                      level: foundationPlan.outcome,
                      slug: foundationPlan.slug,
                      layout: "comparison",
                    }}
                    className="font-bold text-brand-strong underline-offset-4 hover:underline"
                  >
                    {copy.cardPrimary}
                  </TrackedLink>
                </td>
              </tr>
              {planGroups.flatMap((group) => [
                <tr key={`${group.goal}-heading`} className="bg-transparent">
                  <th
                    colSpan={5}
                    scope="rowgroup"
                    className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-strong"
                  >
                    {group.title}
                  </th>
                </tr>,
                ...group.plans.map((plan) => (
                  <tr key={plan.slug} className="bg-card">
                    <th
                      scope="row"
                      className="rounded-l-control px-4 py-4 font-bold"
                    >
                      {plan.outcome}
                    </th>
                    <td className="px-4 py-4 text-muted-foreground">
                      {plan.weeks}
                    </td>
                    <td className="px-4 py-4 font-medium text-foreground/80">
                      {plan.title}
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {plan.weeklyVolume}
                    </td>
                    <td className="rounded-r-control px-4 py-4 text-right">
                      <TrackedLink
                        href={`${prefix}${plan.routePath}`}
                        eventName="plan_card_click"
                        eventProperties={{
                          distance: plan.distance,
                          level: plan.outcome,
                          slug: plan.slug,
                          layout: "comparison",
                        }}
                        className="font-bold text-brand-strong underline-offset-4 hover:underline"
                      >
                        {copy.cardPrimary}
                      </TrackedLink>
                    </td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>

        <div className="mt-14 space-y-14">
          {displayGroups.map((group, groupIndex) => (
            <section
              key={group.goal}
              aria-labelledby={`plan-group-${group.goal}`}
              className="grid gap-5 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10"
            >
              <header className="lg:sticky lg:top-24 lg:self-start">
                <div className="text-xs font-bold tabular-nums text-brand-strong">
                  {String(groupIndex + 1).padStart(2, "0")}
                </div>
                <h3
                  id={`plan-group-${group.goal}`}
                  className="font-display mt-2 text-2xl font-bold tracking-[-0.02em]"
                >
                  {group.title}
                </h3>
                <div className="mt-2 text-sm text-muted-foreground">
                  {group.plans.length} · {pageCopy.runningPlan}
                </div>
              </header>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.plans.map((plan) => (
                  <article
                    key={plan.slug}
                    className={[
                      "group relative flex flex-col overflow-hidden rounded-overlay p-4 transition-transform duration-200 hover:-translate-y-0.5 sm:p-5 md:min-h-[21rem]",
                      group.goal === "FOUNDATION"
                        ? "bg-brand-soft"
                        : "bg-secondary/70 hover:bg-secondary",
                    ].join(" ")}
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -right-2 -top-5 select-none font-display text-[5.75rem] font-bold leading-none tracking-[-0.08em] text-foreground/[0.035]"
                    >
                      {group.title}
                    </span>
                    <div className="relative flex flex-wrap items-center gap-2">
                      <span className="rounded-control bg-card px-2.5 py-1 text-xs font-bold text-brand-strong">
                        {plan.outcome}
                      </span>
                      <span className="rounded-control bg-card/70 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                        {plan.weeks}
                      </span>
                    </div>
                    <h4 className="relative mt-5 text-lg font-bold leading-6 tracking-[-0.015em] sm:mt-6 sm:text-xl sm:leading-7">
                      {plan.title}
                    </h4>
                    <p className="relative mt-2 line-clamp-3 text-[13px] leading-5 text-muted-foreground sm:mt-3 sm:line-clamp-4 sm:text-sm sm:leading-6">
                      {plan.description}
                    </p>
                    <dl className="relative mt-auto grid grid-cols-2 gap-2 pt-4 text-xs sm:pt-6">
                      <div className="rounded-control bg-card/75 p-2.5 sm:p-3">
                        <dt className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock3 aria-hidden="true" className="size-3.5" />
                          {pageCopy.timeline}
                        </dt>
                        <dd className="mt-1.5 font-semibold">{plan.weeks}</dd>
                      </div>
                      <div className="rounded-control bg-card/75 p-2.5 sm:p-3">
                        <dt className="flex items-center gap-1.5 text-muted-foreground">
                          <CalendarDays
                            aria-hidden="true"
                            className="size-3.5"
                          />
                          {pageCopy.volume}
                        </dt>
                        <dd className="mt-1.5 font-semibold">
                          {plan.weeklyVolume}
                        </dd>
                      </div>
                    </dl>
                    <div className="relative mt-3 grid grid-cols-2 gap-2">
                      <TrackedLink
                        href={`${prefix}${plan.routePath}`}
                        eventName="plan_card_click"
                        eventProperties={{
                          distance: plan.distance,
                          level: plan.outcome,
                          slug: plan.slug,
                        }}
                        className="inline-flex h-10 items-center justify-center rounded-control bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {copy.cardPrimary}
                        <ArrowRight
                          aria-hidden="true"
                          className="ml-2 size-3.5"
                        />
                      </TrackedLink>
                      <TrackedLink
                        href={`${appUrl}/plans/templates/${plan.templateSlug}`}
                        eventName="plan_personalize_click"
                        eventProperties={{
                          slug: plan.slug,
                          cta_location: "hub_card",
                        }}
                        className="inline-flex h-10 items-center justify-center rounded-control bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {copy.cardSecondary}
                      </TrackedLink>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="mt-12 grid gap-5 rounded-overlay bg-brand-soft p-6 md:grid-cols-[auto_1fr_auto] md:items-center">
          <div className="flex size-12 items-center justify-center rounded-surface bg-brand text-brand-foreground">
            <BookOpenCheck aria-hidden="true" className="size-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold">{rpeCopy.shortTitle}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {rpeCopy.directAnswer}
            </p>
          </div>
          <TrackedLink
            href={`${prefix}/rpe-scale`}
            eventName="rpe_guide_click"
            eventProperties={{ source: "plan_hub" }}
            className="inline-flex h-10 items-center justify-center rounded-control bg-primary px-4 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {rpeCopy.primaryCta}
            <ArrowRight aria-hidden="true" className="ml-2 size-4" />
          </TrackedLink>
        </aside>
      </section>

      <section
        id="cycling-triathlon-hubs"
        className="scroll-mt-24 bg-secondary/55 px-4 py-14 md:px-6 md:py-20"
      >
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(20rem,0.5fr)] lg:items-end lg:gap-16">
            <div className="max-w-3xl">
              <div className="inline-flex size-11 items-center justify-center rounded-surface bg-card text-foreground">
                <Bike aria-hidden="true" className="size-5" />
              </div>
              <h2 className="font-display mt-5 text-3xl font-bold tracking-[-0.025em] md:text-4xl">
                {hubCollection.title}
              </h2>
            </div>
            <p className="text-sm leading-7 text-muted-foreground md:text-base">
              {hubCollection.subtitle}
            </p>
          </div>
          <div className="mt-9 grid gap-3 md:grid-cols-2">
            {hubs.map((hub) => {
              const HubIcon =
                hub.appIntent === "cycling"
                  ? Bike
                  : hub.appIntent === "swimming"
                    ? Waves
                    : Workflow;
              return (
                <TrackedLink
                  key={hub.slug}
                  href={`${prefix}${hub.routePath}`}
                  eventName="plan_card_click"
                  eventProperties={{
                    distance: hub.sport,
                    level: "hub",
                    slug: hub.slug,
                    layout: "hub",
                  }}
                  className="group flex flex-col rounded-overlay bg-card p-5 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6 md:min-h-[15rem]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="grid size-11 place-items-center rounded-surface bg-secondary text-foreground">
                      <HubIcon aria-hidden="true" className="size-5" />
                    </div>
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground"
                    />
                  </div>
                  <div className="mt-6 flex flex-wrap items-center gap-2 text-xs font-semibold">
                    <span className="rounded-control bg-brand-soft px-2.5 py-1 text-brand-strong">
                      {hubCollection.cardBadge}
                    </span>
                    <span className="text-muted-foreground">
                      {hub.cardMeta}
                    </span>
                  </div>
                  <h3 className="mt-4 text-xl font-bold tracking-[-0.015em]">
                    {hub.cardTitle}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {hub.cardDescription}
                  </p>
                  <span className="mt-auto pt-5 text-xs font-bold uppercase tracking-[0.12em] text-foreground/75">
                    {hubCollection.cardCta}
                  </span>
                </TrackedLink>
              );
            })}
          </div>
        </div>
      </section>

      <section
        id="ai-adjustment"
        className="scroll-mt-24 px-4 py-14 md:px-6 md:py-20"
      >
        <div className="mx-auto grid max-w-7xl gap-8 rounded-feature bg-secondary/70 p-6 md:p-10 lg:grid-cols-[0.7fr_1fr] lg:p-12">
          <div>
            <div className="grid size-11 place-items-center rounded-surface bg-brand text-brand-foreground">
              <Sparkles aria-hidden="true" className="size-5" />
            </div>
            <h2 className="font-display mt-5 text-3xl font-bold tracking-[-0.025em] md:text-4xl">
              {copy.differenceTitle}
            </h2>
          </div>
          <div className="grid gap-3">
            {copy.differences.map(([title, text]) => (
              <article key={title} className="rounded-surface bg-card p-5">
                <h3 className="text-base font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {copy.faq?.length ? (
        <section
          id="faq"
          className="scroll-mt-24 bg-secondary/55 px-4 py-14 md:px-6 md:py-20"
        >
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-brand-strong">
                FAQ
              </div>
              <h2 className="font-display mt-3 text-3xl font-bold tracking-[-0.025em] md:text-4xl">
                {copy.faqTitle}
              </h2>
              {copy.faqSubtitle ? (
                <p className="mt-4 text-base leading-7 text-muted-foreground">
                  {copy.faqSubtitle}
                </p>
              ) : null}
            </div>
            <div className="mt-8 grid gap-2">
              {copy.faq.map(([question, answer], index) => (
                <details
                  key={question}
                  className="group rounded-surface bg-card px-5 py-5 md:px-6"
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
          </div>
        </section>
      ) : null}
    </main>
  );
}
