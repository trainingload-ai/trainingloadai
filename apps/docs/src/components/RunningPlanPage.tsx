import Script from "next/script";
import {
  ArrowRight,
  BookOpenCheck,
  Bot,
  CalendarDays,
  CheckCircle2,
  Gauge,
  ListChecks,
  Route,
  Sparkles,
  Target,
} from "lucide-react";
import { RunningPlanSchedule } from "@/components/RunningPlanSchedule";
import { TrackedLink } from "@/components/TrackedLink";
import { localePrefix } from "@/lib/locale-url";
import {
  breadcrumbSchema,
  howToSchema,
  schemaGraph,
  schemaId,
  schemaLanguage,
} from "@/lib/seo-schema";
import type {
  RunningPlan,
  RunningPlanPageLabels,
} from "@/lib/running-plan-pages";
import { getRunningPlanSchedule } from "@/lib/running-plan-schedules";

function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  return raw.replace(/\/+$/, "");
}

function withLocalePath(prefix: string, href: string) {
  if (href.startsWith("http")) return href;
  if (href === "/") return `${prefix}/`;
  return `${prefix}${href.startsWith("/") ? href : `/${href}`}`;
}

export function RunningPlanPage({
  lang,
  plan,
  labels,
}: {
  lang: string;
  plan: RunningPlan;
  labels: RunningPlanPageLabels;
}) {
  const prefix = localePrefix(lang);
  const siteUrl = getSiteUrl();
  const appUrl = `https://app.trainingload.ai/${lang}`;
  const routePath = plan.routePath ?? `/${plan.slug}`;
  const preserveCouchLayout = plan.slug === "couch-to-5k-training-plan";
  const appPlanUrl = (placement: string) =>
    plan.templateSlug
      ? `${appUrl}/plans/templates/${plan.templateSlug}?source=${encodeURIComponent(plan.slug)}&placement=${encodeURIComponent(placement)}`
      : `${appUrl}/plans/create?source=${encodeURIComponent(plan.slug)}&distance=${encodeURIComponent(plan.distance)}&placement=${encodeURIComponent(placement)}`;
  const primaryCtaTarget = preserveCouchLayout
    ? (plan.primaryCtaTarget ?? "app")
    : "schedule";
  const secondaryCtaTarget = preserveCouchLayout
    ? (plan.secondaryCtaTarget ?? "plan-hub")
    : "app";
  const heroPrimaryHref =
    primaryCtaTarget === "schedule" ? "#week-1" : appPlanUrl("hero_primary");
  const heroSecondaryHref =
    secondaryCtaTarget === "app"
      ? appPlanUrl("hero_secondary")
      : `${prefix}/plan`;
  const pageUrl = `${siteUrl}${prefix}${routePath}`;
  const schedule = getRunningPlanSchedule(plan.slug, lang);

  const jsonLd = schemaGraph([
    {
      "@type": "WebPage",
      "@id": schemaId(pageUrl, "webpage"),
      name: plan.title,
      description: plan.subtitle,
      url: pageUrl,
      inLanguage: schemaLanguage(lang),
      dateModified: schedule.updatedAt,
      author: {
        "@type": "Organization",
        name: schedule.author,
        url: siteUrl,
      },
      isBasedOn: schedule.sources.map((source) => source.url),
      mainEntity: { "@id": schemaId(pageUrl, "schedule") },
      about: plan.keywords.slice(0, 3).map((name) => ({
        "@type": "Thing",
        name,
      })),
    },
    {
      "@type": "ItemList",
      "@id": schemaId(pageUrl, "schedule"),
      name: schedule.title,
      description: schedule.description,
      inLanguage: schemaLanguage(lang),
      numberOfItems: schedule.weeks.length,
      itemListElement: schedule.weeks.map((week, index) => ({
        "@type": "ListItem",
        "@id": `${pageUrl}#week-${week.week}`,
        position: index + 1,
        name: `${schedule.weekLabel} ${week.week}: ${week.phase}`,
        description: week.days.join("; "),
      })),
    },
    plan.howToSteps?.length
      ? howToSchema({
          id: schemaId(pageUrl, "howto"),
          name: plan.howToTitle ?? schedule.title,
          description: plan.howToDescription ?? plan.subtitle,
          steps: plan.howToSteps.map(([name, text]) => ({ name, text })),
          totalTime: plan.howToTotalTime,
        })
      : null,
    {
      "@type": "FAQPage",
      "@id": schemaId(pageUrl, "faq"),
      url: `${pageUrl}#faq`,
      inLanguage: schemaLanguage(lang),
      mainEntity: plan.faq.map(([question, answer]) => ({
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
        { name: labels.home, item: `${siteUrl}${prefix}/` },
        { name: labels.plans, item: `${siteUrl}${prefix}/plan` },
        { name: plan.distance, item: pageUrl },
      ],
    }),
  ]);

  return (
    <main className="overflow-x-hidden bg-background text-neutral-950 dark:bg-background dark:text-white">
      <Script
        id={`${plan.slug}-structured-data`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="relative overflow-hidden border-b border-neutral-200/70 px-4 py-12 md:px-6 md:py-16 dark:border-white/10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.16] dark:opacity-[0.2]"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(15,23,42,0.22) 0 1px, transparent 1px), linear-gradient(0deg, rgba(15,23,42,0.14) 0 1px, transparent 1px)",
            backgroundSize: "76px 76px",
          }}
        />
        <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.55fr)] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-compact border border-emerald-500/20 bg-white/75 px-3 py-1 text-xs font-semibold uppercase text-emerald-700 backdrop-blur dark:border-emerald-500/30 dark:bg-emerald-400/10 dark:text-emerald-200">
              <Bot className="size-3.5" />
              {plan.eyebrow}
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl font-black tracking-tight md:text-6xl">
              {plan.title}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-neutral-700 dark:text-neutral-300 md:text-lg">
              {plan.subtitle}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <TrackedLink
                href={heroPrimaryHref}
                eventName={
                  primaryCtaTarget === "schedule"
                    ? "plan_schedule_start_click"
                    : plan.templateSlug
                      ? "plan_template_open"
                      : "plan_personalize_click"
                }
                eventProperties={{
                  slug: plan.slug,
                  template_slug: plan.templateSlug,
                  source_page: plan.slug,
                  placement: "hero_primary",
                  locale: lang,
                }}
                className="inline-flex h-11 items-center justify-center rounded-compact bg-emerald-500 px-5 text-sm font-bold text-white transition hover:bg-emerald-600 dark:text-neutral-950 dark:hover:bg-emerald-400"
              >
                {preserveCouchLayout
                  ? plan.primaryCta
                  : labels.viewFullSchedule}
                <ArrowRight className="ml-2 size-4" />
              </TrackedLink>
              <TrackedLink
                href={heroSecondaryHref}
                eventName={
                  secondaryCtaTarget === "app"
                    ? "plan_template_open"
                    : "plan_related_click"
                }
                eventProperties={{
                  slug: plan.slug,
                  template_slug: plan.templateSlug,
                  source_page: plan.slug,
                  target:
                    secondaryCtaTarget === "app" ? "template" : "plan_hub",
                  placement: "hero_secondary",
                  locale: lang,
                }}
                className="inline-flex h-11 items-center justify-center rounded-compact border border-neutral-300 bg-white/80 px-5 text-sm font-semibold backdrop-blur transition hover:bg-white dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10"
              >
                {preserveCouchLayout ? plan.secondaryCta : labels.addToCalendar}
              </TrackedLink>
            </div>
          </div>

          <aside className="rounded-compact border border-neutral-200 bg-white/85 p-6 shadow-2xl shadow-neutral-950/5 backdrop-blur dark:border-white/10 dark:bg-white/[0.05]">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-compact bg-emerald-500 text-white dark:text-neutral-950">
                <Route className="size-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
                  {labels.runningPlan}
                </p>
                <h2 className="text-xl font-black">{plan.distance}</h2>
              </div>
            </div>
            <dl className="mt-6 grid gap-3">
              {[
                [labels.timeline, plan.weeks],
                [labels.level, plan.level],
                [labels.volume, plan.weeklyVolume],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-compact border border-neutral-200 bg-card px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <dt className="text-sm text-neutral-600 dark:text-neutral-300">
                    {label}
                  </dt>
                  <dd className="text-sm font-bold">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
              {plan.promise}
            </p>
          </aside>
        </div>
        {plan.trustItems?.length ? (
          <ul className="relative mx-auto mt-10 grid max-w-7xl gap-2 border-t border-neutral-200/70 pt-6 sm:grid-cols-2 lg:grid-cols-4 dark:border-white/10">
            {plan.trustItems.map((item) => (
              <li
                key={item}
                className="flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-neutral-200"
              >
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {!preserveCouchLayout ? (
        <nav
          aria-label={plan.title}
          className="sticky top-16 z-20 border-b border-neutral-200/80 bg-background/95 px-4 backdrop-blur dark:border-white/10 dark:bg-background/90"
        >
          <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[
              ["#plan-fit", plan.forTitle],
              ["#plan-method", plan.contentTitle ?? plan.previewTitle],
              ...(plan.howToSteps?.length
                ? ([["#how-to", plan.howToTitle ?? schedule.title]] as Array<
                    [string, string]
                  >)
                : []),
              ["#schedule", schedule.title],
              ["#ai-adjustments", plan.aiTitle],
              ["#faq", `${plan.distance} ${labels.faqTitleSuffix}`],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="shrink-0 rounded-full px-3 py-2 text-xs font-bold text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white"
              >
                {label}
              </a>
            ))}
          </div>
        </nav>
      ) : null}

      <section
        id="plan-fit"
        className="scroll-mt-24 mx-auto grid max-w-7xl gap-8 px-4 py-12 md:px-6 md:py-16 lg:grid-cols-[0.72fr_1fr]"
      >
        <div>
          <div className="inline-flex size-11 items-center justify-center rounded-compact bg-neutral-950 text-white dark:bg-white dark:text-neutral-950">
            <Target className="size-5" />
          </div>
          <h2 className="mt-5 text-3xl font-black tracking-tight md:text-4xl">
            {plan.forTitle}
          </h2>
        </div>
        <div className="grid gap-3">
          {plan.forItems.map((item) => (
            <div
              key={item}
              className="flex gap-3 rounded-compact border border-neutral-200 bg-card p-5 dark:border-white/10 dark:bg-white/[0.04]"
            >
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
              <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                {item}
              </p>
            </div>
          ))}
        </div>
      </section>

      {plan.contentSections?.length ? (
        <section
          id="plan-method"
          className="scroll-mt-24 border-y border-neutral-200/70 bg-white/70 px-4 py-12 md:px-6 md:py-16 dark:border-white/10 dark:bg-card/70"
        >
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <BookOpenCheck className="size-6 text-emerald-600 dark:text-emerald-300" />
              <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
                {plan.contentTitle}
              </h2>
              {plan.contentSubtitle ? (
                <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {plan.contentSubtitle}
                </p>
              ) : null}
            </div>
            <div className="mt-8 grid gap-3 lg:grid-cols-3">
              {plan.contentSections.map(([title, text, items]) => (
                <article
                  key={title}
                  className="rounded-compact border border-neutral-200 bg-card p-5 dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <h3 className="text-lg font-black">{title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {text}
                  </p>
                  <ul className="mt-4 space-y-2">
                    {items.map((item) => (
                      <li
                        key={item}
                        className="flex gap-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300"
                      >
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="border-y border-neutral-200/70 bg-white/70 px-4 py-12 md:px-6 md:py-16 dark:border-white/10 dark:bg-card/70">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <CalendarDays className="size-6 text-emerald-600 dark:text-emerald-300" />
            <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
              {plan.previewTitle}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
              {plan.previewSubtitle}
            </p>
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {plan.previewRows.map(([phase, title, text]) => (
              <article
                key={phase}
                className="rounded-compact border border-neutral-200 bg-card p-5 dark:border-white/10 dark:bg-white/[0.04]"
              >
                <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-200">
                  {phase}
                </p>
                <h3 className="mt-3 text-lg font-black">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {plan.howToSteps?.length ? (
        <section
          id="how-to"
          className="scroll-mt-24 mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-16"
        >
          <div className="max-w-3xl">
            <ListChecks className="size-6 text-emerald-600 dark:text-emerald-300" />
            <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
              {plan.howToTitle}
            </h2>
            {plan.howToDescription ? (
              <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
                {plan.howToDescription}
              </p>
            ) : null}
          </div>
          <ol className="mt-8 grid gap-3 md:grid-cols-2">
            {plan.howToSteps.map(([name, text], index) => (
              <li
                key={name}
                className="rounded-compact border border-neutral-200 bg-card p-5 dark:border-white/10 dark:bg-white/[0.04]"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-200">
                  {index + 1}
                </p>
                <h3 className="mt-3 text-lg font-black">{name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {text}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <RunningPlanSchedule
        schedule={schedule}
        slug={plan.slug}
        templateSlug={plan.templateSlug}
        lang={lang}
        collapsible={!preserveCouchLayout}
      />

      {plan.conversionTitle && plan.conversionText ? (
        <section className="px-4 py-12">
          <div className="mx-auto grid max-w-7xl gap-6 rounded-compact border border-neutral-200 bg-neutral-950 p-6 text-white md:p-8 lg:grid-cols-[1fr_auto] lg:items-center dark:border-white/10 dark:bg-white dark:text-neutral-950">
            <div>
              <ListChecks className="size-5 text-emerald-300 dark:text-emerald-700" />
              <h2 className="mt-3 text-2xl font-black tracking-tight md:text-3xl">
                {plan.conversionTitle}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/75 dark:text-neutral-700">
                {plan.conversionText}
              </p>
            </div>
            <TrackedLink
              href={appPlanUrl("after_schedule")}
              eventName={
                plan.templateSlug
                  ? "plan_template_open"
                  : "plan_personalize_click"
              }
              eventProperties={{
                slug: plan.slug,
                template_slug: plan.templateSlug,
                source_page: plan.slug,
                placement: "after_schedule",
                locale: lang,
              }}
              className="inline-flex h-11 items-center justify-center rounded-compact bg-emerald-500 px-5 text-sm font-bold text-white transition hover:bg-emerald-600 dark:text-neutral-950 dark:hover:bg-emerald-400"
            >
              {plan.conversionCta ?? plan.primaryCta}
              <ArrowRight className="ml-2 size-4" />
            </TrackedLink>
          </div>
        </section>
      ) : null}

      <section
        id="ai-adjustments"
        className="scroll-mt-24 mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-16"
      >
        <div className="max-w-3xl">
          <Sparkles className="size-6 text-emerald-600 dark:text-emerald-300" />
          <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
            {plan.aiTitle}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
            {plan.aiSubtitle}
          </p>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {plan.aiSignals.map(([title, text]) => (
            <article
              key={title}
              className="rounded-compact border border-neutral-200 bg-card p-5 dark:border-white/10 dark:bg-white/[0.04]"
            >
              <Gauge className="size-5 text-emerald-600 dark:text-emerald-300" />
              <h3 className="mt-4 text-lg font-black">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                {text}
              </p>
            </article>
          ))}
        </div>
      </section>

      {plan.relatedLinks?.length ? (
        <section className="mx-auto grid max-w-7xl gap-8 px-4 pb-12 md:pb-16 lg:grid-cols-[0.7fr_1fr]">
          <div>
            <Gauge className="size-6 text-emerald-600 dark:text-emerald-300" />
            <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
              {plan.relatedTitle}
            </h2>
          </div>
          <div className="grid gap-3">
            {plan.relatedLinks.map(([title, href, text]) => (
              <TrackedLink
                key={href}
                href={withLocalePath(prefix, href)}
                eventName="plan_related_click"
                eventProperties={{
                  slug: plan.slug,
                  target: href,
                  cta_location: "related",
                }}
                className="group rounded-compact border border-neutral-200 bg-card p-5 transition hover:border-emerald-500/40 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
              >
                <h3 className="flex items-center justify-between gap-4 text-lg font-black">
                  <span>{title}</span>
                  <ArrowRight className="size-4 shrink-0 text-emerald-600 transition group-hover:translate-x-0.5 dark:text-emerald-300" />
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {text}
                </p>
              </TrackedLink>
            ))}
          </div>
        </section>
      ) : null}

      <section
        id="faq"
        className="scroll-mt-24 border-y border-neutral-200/70 bg-white/70 px-4 py-12 md:px-6 md:py-16 dark:border-white/10 dark:bg-card/70"
      >
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-black tracking-tight md:text-4xl">
              {plan.distance} {labels.faqTitleSuffix}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
              {labels.faqSubtitle}
            </p>
          </div>
          {preserveCouchLayout ? (
            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {plan.faq.map(([question, answer]) => (
                <article
                  key={question}
                  className="rounded-compact border border-neutral-200 bg-card p-5 dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <h3 className="text-lg font-black">{question}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {answer}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-8 divide-y divide-neutral-200 rounded-overlay border border-neutral-200 bg-card px-5 dark:divide-white/10 dark:border-white/10 dark:bg-white/[0.04] md:px-7">
              {plan.faq.map(([question, answer], index) => (
                <details
                  key={question}
                  className="group py-5"
                  open={index === 0}
                >
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-5 text-lg font-black marker:content-none">
                    <span>{question}</span>
                    <span
                      aria-hidden="true"
                      className="mt-0.5 text-2xl font-light leading-none text-emerald-600 transition group-open:rotate-45 dark:text-emerald-300"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-4xl pr-10 text-sm leading-7 text-neutral-700 dark:text-neutral-300">
                    {answer}
                  </p>
                </details>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="px-4 py-12 md:px-6 md:py-16">
        <div className="mx-auto grid max-w-7xl gap-6 rounded-compact bg-emerald-500 p-8 text-white shadow-2xl shadow-emerald-500/20 md:p-12 lg:grid-cols-[1fr_auto] lg:items-center dark:text-neutral-950">
          <div>
            <Bot className="size-6" />
            <h2 className="mt-4 text-3xl font-black tracking-tight md:text-5xl">
              {plan.finalTitle ?? labels.finalTitle}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/85 dark:text-neutral-950/75">
              {plan.finalText ?? labels.finalText}
            </p>
          </div>
          <TrackedLink
            href={appPlanUrl("final")}
            eventName={
              plan.templateSlug
                ? "plan_template_open"
                : "plan_personalize_click"
            }
            eventProperties={{
              slug: plan.slug,
              template_slug: plan.templateSlug,
              source_page: plan.slug,
              placement: "final",
              locale: lang,
            }}
            className="inline-flex h-12 items-center justify-center rounded-compact bg-white px-6 text-sm font-bold text-emerald-700 transition hover:bg-emerald-50 dark:bg-card dark:text-white dark:hover:bg-accent"
          >
            {plan.finalCta ?? plan.primaryCta}
            <ArrowRight className="ml-2 size-4" />
          </TrackedLink>
        </div>
      </section>
    </main>
  );
}
