import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { optimizeSeoText } from "@/lib/seo-metadata";
import { JsonLd } from "@/components/JsonLd";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Database,
  LineChart,
  MessagesSquare,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import { i18n } from "@/lib/i18n";
import {
  aiCoachSlugs,
  isAiCoachSlug,
  type AiCoachPage,
  type AiCoachPageLabels,
} from "@/lib/ai-coach-pages";
import {
  breadcrumbSchema,
  faqPageSchema,
  schemaGraph,
  schemaId,
  webApplicationSchema,
  webPageSchema,
} from "@/lib/seo-schema";

function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  return raw.replace(/\/+$/, "");
}

export function generateStaticParams() {
  return i18n.languages.flatMap((lang) =>
    aiCoachSlugs.map((coach) => ({ lang, coach })),
  );
}

async function getCoachPage(lang: string, coach: string) {
  if (!isAiCoachSlug(coach)) notFound();
  const t = await getTranslations({ locale: lang, namespace: "aiCoachPages" });
  return {
    labels: t.raw("labels") as AiCoachPageLabels,
    page: t.raw(`pages.${coach}`) as AiCoachPage,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; coach: string }>;
}): Promise<Metadata> {
  const { lang, coach } = await params;
  const prefix = localePrefix(lang);
  const siteUrl = getSiteUrl();
  const { page } = await getCoachPage(lang, coach);
  const seo = optimizeSeoText({
    locale: lang,
    context: "product",
    title: page.metaTitle,
    description: page.metaDescription,
  });

  return {
    title: seo.title,
    description: seo.description,
    keywords: page.keywords,
    alternates: {
      canonical: `${siteUrl}${prefix}/ai-coach/${page.slug}`,
      languages: absoluteAlternatesForPath(siteUrl, `/ai-coach/${page.slug}`),
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "website",
      url: `${siteUrl}${prefix}/ai-coach/${page.slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
    },
  };
}

export default async function AiCoachSportPage({
  params,
}: {
  params: Promise<{ lang: string; coach: string }>;
}) {
  const { lang, coach } = await params;
  const prefix = localePrefix(lang);
  const siteUrl = getSiteUrl();
  const { labels, page } = await getCoachPage(lang, coach);
  const appUrl = `https://app.trainingload.ai/${lang}/ai-coach?from=docs-${page.slug}&intent=${page.slug}`;
  const pageUrl = `${siteUrl}${prefix}/ai-coach/${page.slug}`;
  const appId = schemaId(siteUrl, "app");
  const webpageId = schemaId(pageUrl, "webpage");

  const jsonLd = schemaGraph([
    webApplicationSchema({
      id: appId,
      url: appUrl,
      name: "Trainingload.ai",
      description: page.metaDescription,
      applicationCategory: "HealthApplication",
      featureList: page.signals.map(([title]) => title),
    }),
    {
      ...webPageSchema({
        id: webpageId,
        url: pageUrl,
        name: page.metaTitle.replace(" | Trainingload.ai", ""),
        description: page.metaDescription,
        lang,
        mainEntityId: appId,
      }),
      about: { "@id": appId },
    },
    faqPageSchema({
      id: schemaId(pageUrl, "faq"),
      mainEntity: page.faq.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: {
          "@type": "Answer",
          text: answer,
        },
      })),
    }),
    breadcrumbSchema({
      id: schemaId(pageUrl, "breadcrumb"),
      items: [
        { name: labels.home, item: `${siteUrl}${prefix}/` },
        { name: labels.aiCoach, item: `${siteUrl}${prefix}/ai-coach` },
        { name: page.sport, item: pageUrl },
      ],
    }),
  ]);

  return (
    <main className="overflow-x-hidden bg-background text-neutral-950 dark:bg-background dark:text-white">
      <JsonLd id={`${page.slug}-structured-data`} data={jsonLd} />

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
        <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.62fr)] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-compact border border-emerald-500/20 bg-white/75 px-3 py-1 text-xs font-semibold uppercase text-emerald-700 backdrop-blur dark:border-emerald-500/30 dark:bg-emerald-400/10 dark:text-emerald-200">
              <Bot className="size-3.5" />
              {page.eyebrow}
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl font-black tracking-tight md:text-6xl">
              {page.title}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-neutral-700 dark:text-neutral-300 md:text-lg">
              {page.subtitle}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={appUrl}>
                <Button className="h-11 rounded-compact bg-emerald-500 px-5 text-sm font-bold text-white hover:bg-emerald-600 dark:text-neutral-950 dark:hover:bg-emerald-400">
                  {page.primary}
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </Link>
              <Link href={`${prefix}/ai-training-plan`}>
                <Button
                  variant="outline"
                  className="h-11 rounded-compact border-neutral-300 bg-white/80 px-5 text-sm font-semibold backdrop-blur hover:bg-white dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10"
                >
                  {page.secondary}
                </Button>
              </Link>
            </div>
          </div>

          <aside className="rounded-compact border border-neutral-200 bg-white p-5 shadow-xl shadow-neutral-900/10 dark:border-white/10 dark:bg-white/[0.04]">
            <ShieldCheck className="size-6 text-emerald-600 dark:text-emerald-300" />
            <p className="mt-4 text-lg font-black leading-snug">
              {page.promise}
            </p>
            <div className="mt-5 grid gap-3">
              {page.workflow.slice(0, 3).map(([title, text]) => (
                <div key={title} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                  <div>
                    <div className="text-sm font-black">{title}</div>
                    <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                      {text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-16">
        <div className="rounded-compact border border-neutral-200 bg-white p-6 dark:border-white/10 dark:bg-white/[0.04] md:p-8">
          <div className="text-sm font-bold uppercase text-emerald-700 dark:text-emerald-300">
            {page.sport} {labels.definition}
          </div>
          <h2 className="mt-3 text-2xl font-black tracking-tight md:text-3xl">
            {page.definitionTitle}
          </h2>
          <p className="mt-4 max-w-4xl text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
            {page.definitionText}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-16">
        <div className="max-w-3xl">
          <LineChart className="size-6 text-emerald-600 dark:text-emerald-300" />
          <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
            {page.signalsTitle}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
            {page.signalsSubtitle}
          </p>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {page.signals.map(([title, text]) => (
            <article
              key={title}
              className="rounded-compact border border-neutral-200 bg-card p-5 dark:border-white/10 dark:bg-white/[0.04]"
            >
              <div className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                {labels.signal}
              </div>
              <h3 className="mt-3 text-lg font-black">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                {text}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-neutral-200/70 bg-white/70 px-4 py-12 md:px-6 md:py-16 dark:border-white/10 dark:bg-card/50">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.7fr_1fr]">
          <div>
            <ClipboardCheck className="size-6 text-emerald-600 dark:text-emerald-300" />
            <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
              {page.exampleTitle}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
              {page.exampleSubtitle}
            </p>
          </div>
          <div className="grid gap-3">
            {page.exampleSteps.map(([title, text], index) => (
              <article
                key={title}
                className="grid gap-4 rounded-compact border border-neutral-200 bg-card p-5 dark:border-white/10 dark:bg-white/[0.04] sm:grid-cols-[auto_1fr]"
              >
                <div className="flex size-9 items-center justify-center rounded-compact bg-emerald-100 text-sm font-black text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200">
                  {index + 1}
                </div>
                <div>
                  <div className="text-xs font-bold uppercase text-neutral-500 dark:text-neutral-400">
                    {labels.example}
                  </div>
                  <h3 className="mt-2 text-lg font-black">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {text}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-16">
        <div className="max-w-3xl">
          <Database className="size-6 text-emerald-600 dark:text-emerald-300" />
          <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
            {page.dataTitle}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
            {page.dataSubtitle}
          </p>
        </div>
        <div className="mt-8 overflow-hidden rounded-compact border border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.04]">
          <div className="grid bg-neutral-100 text-xs font-black uppercase text-neutral-600 dark:bg-white/10 dark:text-neutral-300 md:grid-cols-[0.55fr_0.7fr_1fr]">
            <div className="px-4 py-3">{labels.dataPoint}</div>
            <div className="hidden px-4 py-3 md:block">{labels.dataReason}</div>
            <div className="hidden px-4 py-3 md:block">{labels.dataAction}</div>
          </div>
          <div className="divide-y divide-neutral-200 dark:divide-white/10">
            {page.dataPoints.map(([name, reason, action]) => (
              <article
                key={name}
                className="grid gap-2 px-4 py-4 md:grid-cols-[0.55fr_0.7fr_1fr] md:gap-4"
              >
                <h3 className="text-sm font-black">{name}</h3>
                <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {reason}
                </p>
                <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                  {action}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-neutral-200/70 bg-white/70 px-4 py-12 md:px-6 md:py-16 dark:border-white/10 dark:bg-card/50">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.7fr_1fr]">
          <div>
            <MessagesSquare className="size-6 text-emerald-600 dark:text-emerald-300" />
            <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
              {page.useCasesTitle}
            </h2>
          </div>
          <div className="grid gap-3">
            {page.useCases.map(([title, text]) => (
              <article
                key={title}
                className="rounded-compact border border-neutral-200 bg-card p-5 dark:border-white/10 dark:bg-white/[0.04]"
              >
                <div className="text-xs font-bold uppercase text-neutral-500 dark:text-neutral-400">
                  {labels.useCase}
                </div>
                <h3 className="mt-3 text-lg font-black">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-16">
        <div className="grid gap-8 lg:grid-cols-[0.7fr_1fr]">
          <div>
            <Scale className="size-6 text-emerald-600 dark:text-emerald-300" />
            <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
              {page.comparisonTitle}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
              {page.comparisonSubtitle}
            </p>
          </div>
          <div className="grid gap-3">
            {page.comparisons.map(([title, generic, trainingload]) => (
              <article
                key={title}
                className="rounded-compact border border-neutral-200 bg-card p-5 dark:border-white/10 dark:bg-white/[0.04]"
              >
                <div className="text-xs font-bold uppercase text-neutral-500 dark:text-neutral-400">
                  {labels.comparison}
                </div>
                <h3 className="mt-3 text-lg font-black">{title}</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <p className="rounded-compact bg-neutral-100 p-3 text-sm leading-relaxed text-neutral-700 dark:bg-white/10 dark:text-neutral-300">
                    {generic}
                  </p>
                  <p className="rounded-compact bg-emerald-100 p-3 text-sm leading-relaxed text-emerald-950 dark:bg-emerald-400/15 dark:text-emerald-100">
                    {trainingload}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-neutral-200/70 bg-white/70 px-4 py-12 md:px-6 md:py-16 dark:border-white/10 dark:bg-card/50">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.7fr_1fr]">
          <div>
            <ShieldCheck className="size-6 text-emerald-600 dark:text-emerald-300" />
            <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
              {page.safetyTitle}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
              {page.safetyText}
            </p>
          </div>
          <div className="grid gap-3">
            {page.safetyItems.map(([title, text]) => (
              <article
                key={title}
                className="flex gap-3 rounded-compact border border-neutral-200 bg-card p-5 dark:border-white/10 dark:bg-white/[0.04]"
              >
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                <div>
                  <h3 className="font-black">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {text}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-16">
        <div className="grid gap-8 lg:grid-cols-[0.65fr_1fr]">
          <div>
            <ClipboardCheck className="size-6 text-emerald-600 dark:text-emerald-300" />
            <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
              {page.workflowTitle}
            </h2>
          </div>
          <div className="grid gap-3">
            {page.workflow.map(([title, text], index) => (
              <article
                key={title}
                className="grid gap-4 rounded-compact border border-neutral-200 bg-card p-5 dark:border-white/10 dark:bg-white/[0.04] sm:grid-cols-[auto_1fr]"
              >
                <div className="flex size-9 items-center justify-center rounded-compact bg-neutral-950 text-sm font-black text-white dark:bg-white dark:text-neutral-950">
                  {index + 1}
                </div>
                <div>
                  <h3 className="text-lg font-black">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {text}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="faq"
        className="border-y border-neutral-200/70 bg-white/70 px-4 py-12 md:px-6 md:py-16 dark:border-white/10 dark:bg-card/50"
      >
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-black tracking-tight md:text-4xl">
              {page.faqTitle}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
              {page.faqSubtitle}
            </p>
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {page.faq.map(([question, answer]) => (
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
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-16">
        <h2 className="text-3xl font-black tracking-tight md:text-4xl">
          {page.relatedTitle}
        </h2>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {page.relatedLinks.map(([title, href, text]) => (
            <article
              key={href}
              className="rounded-compact border border-neutral-200 bg-card p-5 dark:border-white/10 dark:bg-white/[0.04]"
            >
              <h3 className="text-lg font-black">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                {text}
              </p>
              <Link
                href={`${prefix}${href}`}
                className="mt-4 inline-flex items-center text-sm font-bold text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
              >
                {title}
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="px-4 py-12 md:px-6 md:py-16">
        <div className="mx-auto grid max-w-7xl gap-6 rounded-compact bg-emerald-500 p-8 text-white shadow-2xl shadow-emerald-500/20 md:p-12 lg:grid-cols-[1fr_auto] lg:items-center dark:text-neutral-950">
          <div>
            <Bot className="size-6" />
            <h2 className="mt-4 text-3xl font-black tracking-tight md:text-5xl">
              {page.ctaTitle}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/85 dark:text-neutral-950/75">
              {page.ctaText}
            </p>
          </div>
          <Link href={appUrl}>
            <Button className="h-12 rounded-compact bg-white px-6 text-sm font-bold text-emerald-700 hover:bg-emerald-50 dark:bg-card dark:text-white dark:hover:bg-accent">
              {page.primary}
              <ArrowRight className="ml-2 size-4" />
            </Button>
          </Link>
        </div>
      </section>
    </main>
  );
}
