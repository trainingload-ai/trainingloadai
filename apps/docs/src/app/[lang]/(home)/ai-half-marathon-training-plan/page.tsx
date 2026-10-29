import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { optimizeSeoText } from "@/lib/seo-metadata";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { ContentFreshness } from "@/components/ContentFreshness";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  Target,
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
    namespace: "aiHalfMarathonPlanPage.metadata",
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
      canonical: `${siteUrl}${prefix}/ai-half-marathon-training-plan`,
      languages: absoluteAlternatesForPath(
        siteUrl,
        "/ai-half-marathon-training-plan",
      ),
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "website",
      url: `${siteUrl}${prefix}/ai-half-marathon-training-plan`,
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
    },
  };
}

export default async function AiHalfMarathonPlanPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const prefix = localePrefix(lang);
  const siteUrl = getSiteUrl();
  const t = await getTranslations({
    locale: lang,
    namespace: "aiHalfMarathonPlanPage",
  });
  const tCommon = await getTranslations({
    locale: lang,
    namespace: "commonLinks",
  });
  const appUrl = `https://app.trainingload.ai/${lang}`;
  const pageUrl = `${siteUrl}${prefix}/ai-half-marathon-training-plan`;
  const ui = t.raw("ui") as Record<string, string>;
  const steps = t.raw("steps") as string[][];
  const checks = t.raw("checks") as string[][];
  const faq = t.raw("faq") as string[][];
  const howToId = schemaId(pageUrl, "howto");
  const checksId = schemaId(pageUrl, "checklist");

  const jsonLd = schemaGraph([
    {
      "@type": "WebPage",
      "@id": schemaId(pageUrl, "webpage"),
      name: ui.title,
      description: ui.subtitle,
      url: pageUrl,
      inLanguage: schemaLanguage(lang),
    },
    {
      "@type": "HowTo",
      "@id": howToId,
      name: ui.stepsTitle,
      description: ui.stepsSubtitle,
      inLanguage: schemaLanguage(lang),
      step: steps.map(([name, text], index) => ({
        "@type": "HowToStep",
        position: index + 1,
        name,
        text,
      })),
    },
    {
      "@type": "ItemList",
      "@id": checksId,
      name: ui.checksTitle,
      itemListElement: checks.map(([name, text], index) => ({
        "@type": "ListItem",
        position: index + 1,
        name,
        description: text,
      })),
    },
    {
      "@type": "FAQPage",
      "@id": schemaId(pageUrl, "faq"),
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

  return (
    <main className="overflow-x-hidden bg-background text-neutral-950 dark:bg-background dark:text-white">
      <JsonLd
        id="ai-half-marathon-training-plan-structured-data"
        data={jsonLd}
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
        <div className="relative mx-auto max-w-7xl">
          <div className="inline-flex items-center gap-2 rounded-compact border border-emerald-500/20 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 backdrop-blur dark:border-emerald-500/30 dark:bg-emerald-400/10 dark:text-emerald-200">
            <Bot className="size-3.5" />
            {ui.eyebrow}
          </div>
          <h1 className="mt-6 max-w-4xl text-4xl font-black tracking-tight md:text-6xl">
            {ui.title}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-neutral-700 dark:text-neutral-300 md:text-lg">
            {ui.subtitle}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={appUrl}>
              <Button className="h-11 rounded-compact bg-emerald-500 px-5 text-sm font-bold text-white hover:bg-emerald-600 dark:text-neutral-950 dark:hover:bg-emerald-400">
                {ui.primary}
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </Link>
            <Link href={`${prefix}/ai-training-plan`}>
              <Button
                variant="outline"
                className="h-11 rounded-compact border-neutral-300 bg-white/80 px-5 text-sm font-semibold backdrop-blur hover:bg-white dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10"
              >
                {ui.secondary}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-16">
        <div className="max-w-3xl">
          <h2 className="text-3xl font-black tracking-tight md:text-4xl">
            {ui.stepsTitle}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
            {ui.stepsSubtitle}
          </p>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-4">
          {steps.map(([title, text]) => (
            <article
              key={title}
              className="rounded-compact border border-neutral-200 bg-card p-5 dark:border-white/10 dark:bg-white/[0.04]"
            >
              <h3 className="text-lg font-black">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                {text}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-neutral-200/70 bg-white/70 px-4 py-12 md:px-6 md:py-16 dark:border-white/10 dark:bg-card/50">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-black tracking-tight md:text-4xl">
              {ui.checksTitle}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
              {ui.checksSubtitle}
            </p>
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {checks.map(([title, text]) => (
              <article
                key={title}
                className="flex gap-3 rounded-compact border border-neutral-200 bg-card p-5 dark:border-white/10 dark:bg-white/[0.04]"
              >
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
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
        className="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-16"
      >
        <div className="max-w-3xl">
          <h2 className="text-3xl font-black tracking-tight md:text-4xl">
            {ui.faqTitle}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
            {ui.faqSubtitle}
          </p>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {faq.map(([question, answer]) => (
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
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={`${prefix}/half-marathon-training-plan`}>
            <Button
              variant="outline"
              className="h-10 rounded-compact border-neutral-300 bg-white px-4 text-xs font-semibold text-neutral-800 hover:bg-neutral-100 dark:border-white/20 dark:bg-transparent dark:text-neutral-200 dark:hover:bg-white/10"
            >
              {ui.docsAction}
            </Button>
          </Link>
          <Link href={`${prefix}/ai-marathon-training-plan`}>
            <Button
              variant="outline"
              className="h-10 rounded-compact border-neutral-300 bg-white px-4 text-xs font-semibold text-neutral-800 hover:bg-neutral-100 dark:border-white/20 dark:bg-transparent dark:text-neutral-200 dark:hover:bg-white/10"
            >
              {ui.siblingAction}
            </Button>
          </Link>
          <Link href={`${prefix}/vdot-calculator`}>
            <Button
              variant="outline"
              className="h-10 rounded-compact border-neutral-300 bg-white px-4 text-xs font-semibold text-neutral-800 hover:bg-neutral-100 dark:border-white/20 dark:bg-transparent dark:text-neutral-200 dark:hover:bg-white/10"
            >
              {tCommon("vdotCalculatorAction")}
            </Button>
          </Link>
          <Link href={`${prefix}/training-load`}>
            <Button
              variant="outline"
              className="h-10 rounded-compact border-neutral-300 bg-white px-4 text-xs font-semibold text-neutral-800 hover:bg-neutral-100 dark:border-white/20 dark:bg-transparent dark:text-neutral-200 dark:hover:bg-white/10"
            >
              {tCommon("trainingLoadAction")}
            </Button>
          </Link>
          <Link href={appUrl}>
            <Button className="h-10 rounded-compact bg-neutral-950 px-4 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200">
              {ui.productAction}
            </Button>
          </Link>
        </div>
      </section>

      <section className="px-4 py-12 md:px-6 md:py-16">
        <div className="mx-auto grid max-w-7xl gap-6 rounded-compact bg-emerald-500 p-8 text-white shadow-2xl shadow-emerald-500/20 md:p-12 lg:grid-cols-[1fr_auto] lg:items-center dark:text-neutral-950">
          <div>
            <Target className="size-6" />
            <h2 className="mt-4 text-3xl font-black tracking-tight md:text-5xl">
              {ui.ctaTitle}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/85 dark:text-neutral-950/75">
              {ui.ctaText}
            </p>
          </div>
          <Link href={appUrl}>
            <Button className="h-12 rounded-compact bg-white px-6 text-sm font-bold text-emerald-700 hover:bg-emerald-50 dark:bg-card dark:text-white dark:hover:bg-accent">
              {ui.primary}
              <CalendarDays className="ml-2 size-4" />
            </Button>
          </Link>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pb-8">
        <ContentFreshness lastUpdated="2026-09-06" />
      </div>
    </main>
  );
}
