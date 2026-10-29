import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { ArrowRight, Check } from "lucide-react";
import { FiveKProductPreview } from "@/app/[lang]/(home)/5k-training-plan/_components/FiveKProductPreview";
import styles from "@/app/[lang]/(home)/5k-training-plan/five-k-training-plan.module.css";
import { RunningPlanSchedule } from "@/components/RunningPlanSchedule";
import { TrackedLink } from "@/components/TrackedLink";
import { getRunningPlanSchedule } from "@/lib/running-plan-schedules";
import {
  runningPlanIntentContent,
  type BridgePlanSlug,
} from "@/lib/running-plan-intents";
import { absoluteAlternatesForPath, withLocalePath } from "@/lib/locale-url";
import {
  breadcrumbSchema,
  schemaGraph,
  schemaId,
  schemaLanguage,
} from "@/lib/seo-schema";

const getSiteUrl = () =>
  (process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai").replace(
    /\/+$/,
    "",
  );

export function tenKBridgeMetadata(
  lang: string,
  slug: BridgePlanSlug,
): Metadata {
  const copy = runningPlanIntentContent(lang).bridges[slug];
  const url = `${getSiteUrl()}${withLocalePath(lang, `/${slug}`)}`;
  return {
    title: copy.metaTitle,
    description: copy.metaDescription,
    alternates: {
      canonical: url,
      languages: absoluteAlternatesForPath(getSiteUrl(), `/${slug}`),
    },
    openGraph: {
      title: copy.metaTitle,
      description: copy.metaDescription,
      url,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: copy.metaTitle,
      description: copy.metaDescription,
    },
    robots: ["en", "zh", "zh-hant", "ja"].includes(lang)
      ? undefined
      : { index: false, follow: true },
  };
}

export function TenKBridgePage({
  lang,
  slug,
}: {
  lang: string;
  slug: BridgePlanSlug;
}) {
  const { labels, bridges } = runningPlanIntentContent(lang);
  const copy = bridges[slug];
  const isCouch = slug === "couch-to-10k-training-plan";
  const schedule = getRunningPlanSchedule("10k-training-plan", lang);
  const foundation = isCouch
    ? getRunningPlanSchedule("couch-to-5k-training-plan", lang)
    : null;
  const url = `${getSiteUrl()}${withLocalePath(lang, `/${slug}`)}`;
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.trainingload.ai"
  ).replace(/\/+$/, "");
  const templateUrl = (template: "first-5k" | "finish-10k") =>
    `${appUrl}/${lang}/plans/templates/${template}?source=${slug}&placement=bridge`;
  const initialTemplate = isCouch ? "first-5k" : "finish-10k";
  const jsonLd = schemaGraph([
    {
      "@type": "WebPage",
      "@id": schemaId(url, "webpage"),
      name: copy.metaTitle,
      description: copy.intro,
      url,
      inLanguage: schemaLanguage(lang),
      dateModified: "2026-10-15",
      mainEntity: { "@id": schemaId(url, "schedule") },
    },
    {
      "@type": "ItemList",
      "@id": schemaId(url, "schedule"),
      name: isCouch ? labels.tenKSchedule : schedule.title,
      numberOfItems: schedule.weeks.length,
      itemListElement: schedule.weeks.map((week, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: `${schedule.weekLabel} ${week.week}: ${week.phase}`,
        description: week.days.join("; "),
        url: `${url}#week-${week.week}`,
      })),
    },
    foundation
      ? {
          "@type": "ItemList",
          "@id": schemaId(url, "foundation"),
          name: labels.foundationSchedule,
          numberOfItems: foundation.weeks.length,
          itemListElement: foundation.weeks.map((week, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: `${foundation.weekLabel} ${week.week}: ${week.phase}`,
            description: week.days.join("; "),
            url: `${url}#foundation-week-${week.week}`,
          })),
        }
      : null,
    {
      "@type": "FAQPage",
      "@id": schemaId(url, "faq"),
      mainEntity: copy.faq.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
    breadcrumbSchema({
      id: schemaId(url, "breadcrumb"),
      items: [
        {
          name: "Trainingload.ai",
          item: `${getSiteUrl()}${withLocalePath(lang, "/")}`,
        },
        {
          name: labels.hub10K,
          item: `${getSiteUrl()}${withLocalePath(lang, "/10k-training-plan")}`,
        },
        { name: copy.metaTitle, item: url },
      ],
    }),
  ]);

  return (
    <main className={styles.page}>
      <Script
        id={`${slug}-structured-data`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <section className={styles.hero}>
        <div className={styles.shell}>
          <nav
            aria-label={labels.relatedTitle}
            className="mb-8 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400"
          >
            <Link
              href={withLocalePath(lang, "/5k-training-plan")}
              className="hover:underline"
            >
              {labels.hub5K}
            </Link>
            <Link
              href={withLocalePath(lang, "/10k-training-plan")}
              className="hover:underline"
            >
              {labels.hub10K}
            </Link>
          </nav>
          <div className={styles.heroGrid}>
            <div
              className={`${styles.heroCopy} ${["zh", "zh-hant", "ja"].includes(lang) ? styles.heroCopyCjk : ""}`}
            >
              <p className={styles.kicker}>{copy.eyebrow}</p>
              <h1>
                {copy.heading.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </h1>
              <p className={styles.heroSubtitle}>{copy.intro}</p>
              <div className={styles.heroActions}>
                <Link
                  href={isCouch ? "#progression" : "#schedule"}
                  className={styles.primaryButton}
                >
                  {labels.viewSchedule}
                  <ArrowRight aria-hidden="true" />
                </Link>
                <TrackedLink
                  href={templateUrl(initialTemplate)}
                  eventName="plan_template_open"
                  eventProperties={{
                    slug,
                    template_slug: initialTemplate,
                    placement: "hero",
                    locale: lang,
                  }}
                  className={styles.secondaryButton}
                >
                  {isCouch ? labels.startFoundation : labels.addPlan}
                </TrackedLink>
              </div>
              <p className={styles.promise}>{labels.freeNote}</p>
            </div>
            <div>
              <FiveKProductPreview
                lang={lang}
                planSlug="10k-training-plan"
                distance="10K"
              />
              <p className="mt-3 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                {labels.screenshotNote}
              </p>
            </div>
          </div>
          <dl className="mt-10 grid grid-cols-2 divide-x divide-neutral-200 border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-950 sm:grid-cols-4">
            {copy.facts.map(([label, value]) => (
              <div key={label} className="p-4">
                <dt className="text-xs text-neutral-500 dark:text-neutral-400">
                  {label}
                </dt>
                <dd className="mt-2 text-sm font-bold">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section
        id="progression"
        className="scroll-mt-32 border-y border-neutral-200 px-5 py-12 dark:border-neutral-800 md:py-16"
      >
        <div className="mx-auto max-w-[1180px]">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.5fr] lg:gap-16">
            <h2 className="max-w-lg text-balance text-3xl font-black tracking-tight sm:text-4xl">
              {copy.readinessTitle}
            </h2>
            <ul className="divide-y divide-neutral-200 border-y border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {copy.readiness.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 py-4 text-sm leading-7 text-neutral-600 dark:text-neutral-300"
                >
                  <Check
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0 text-emerald-600 dark:text-emerald-300"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <ol className="mt-10 grid gap-x-8 sm:grid-cols-3">
            {copy.stages.map((stage) => (
              <li
                key={stage.title}
                className="border-t-2 border-emerald-600 py-5 dark:border-emerald-400"
              >
                <h3 className="text-lg font-bold">{stage.title}</h3>
                <p className="mt-3 text-sm leading-7 text-neutral-600 dark:text-neutral-400">
                  {stage.text}
                </p>
              </li>
            ))}
          </ol>
          {isCouch && (
            <p className="mt-4 border-l-2 border-emerald-600 pl-4 text-sm leading-7 text-neutral-600 dark:text-neutral-400">
              {labels.stageNote}
            </p>
          )}
        </div>
      </section>

      {foundation && (
        <details className="group/foundation border-b border-neutral-200 dark:border-neutral-800">
          <summary className="mx-auto max-w-[1180px] cursor-pointer px-5 py-7 text-lg font-bold focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-emerald-500">
            {labels.showFoundation}
          </summary>
          <RunningPlanSchedule
            schedule={{ ...foundation, title: labels.foundationSchedule }}
            slug={slug}
            templateSlug="first-5k"
            lang={lang}
            collapsible
            showOverview
            anchorPrefix="foundation-"
            showGuidance={false}
          />
        </details>
      )}

      <RunningPlanSchedule
        schedule={
          isCouch ? { ...schedule, title: labels.tenKSchedule } : schedule
        }
        slug={slug}
        templateSlug="finish-10k"
        lang={lang}
        collapsible
        showOverview
        overviewAfter={
          <div className="my-8 flex flex-col gap-5 bg-neutral-950 p-6 text-white sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl text-sm leading-6 text-neutral-300">
              {isCouch ? labels.stageNote : labels.freeNote}
            </p>
            <TrackedLink
              href={templateUrl("finish-10k")}
              eventName="plan_template_open"
              eventProperties={{
                slug,
                template_slug: "finish-10k",
                placement: "schedule",
                locale: lang,
              }}
              className="group inline-flex min-h-11 shrink-0 items-center justify-center gap-2 bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400"
            >
              {labels.addPlan}
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
              />
            </TrackedLink>
          </div>
        }
      />

      <section id="faq" className="px-5 py-12 md:py-16">
        <div className="mx-auto max-w-[1180px]">
          <h2 className="text-3xl font-black tracking-tight">{labels.faq}</h2>
          <div className="mt-7 divide-y divide-neutral-200 border-y border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {copy.faq.map(([question, answer]) => (
              <details key={question} className="py-5">
                <summary className="cursor-pointer font-bold focus-visible:outline-2 focus-visible:outline-offset-4">
                  {question}
                </summary>
                <p className="mt-3 max-w-4xl text-sm leading-7 text-neutral-600 dark:text-neutral-400">
                  {answer}
                </p>
              </details>
            ))}
          </div>
          <aside className="mt-8 max-w-4xl text-xs leading-6 text-neutral-500 dark:text-neutral-400">
            <h3 className="font-bold">{labels.sources}</h3>
            <p>{labels.sourceNote}</p>
            <p className="mt-2 flex flex-wrap gap-x-5">
              <a
                href="https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/"
                className="underline underline-offset-4"
              >
                NHS · Couch to 5K
              </a>
              <a
                href="https://www.polar.com/en/guide/running/10k-training-plan/beginners"
                className="underline underline-offset-4"
              >
                Polar · 10K
              </a>
            </p>
          </aside>
          <nav
            aria-label={labels.relatedTitle}
            className="mt-10 border-t border-neutral-200 pt-6 dark:border-neutral-800"
          >
            <h2 className="text-xl font-bold">{labels.relatedTitle}</h2>
            <div className="mt-4 flex flex-wrap gap-x-8 gap-y-4 text-sm font-bold text-emerald-700 dark:text-emerald-300">
              {[
                ["/5k-training-plan", labels.hub5K],
                ["/10k-training-plan", labels.hub10K],
                [
                  isCouch
                    ? "/5k-to-10k-training-plan"
                    : "/couch-to-10k-training-plan",
                  isCouch ? labels.bridge5K : labels.couch10K,
                ],
              ].map(([href, label]) => (
                <Link
                  key={href}
                  href={withLocalePath(lang, href)}
                  className="group inline-flex items-center gap-2 hover:underline"
                >
                  {label}
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                  />
                </Link>
              ))}
            </div>
          </nav>
        </div>
      </section>
    </main>
  );
}
