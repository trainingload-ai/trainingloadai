import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowRight, CheckCircle2, CircleDashed, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContentFreshness } from "@/components/ContentFreshness";
import { optimizeSeoText } from "@/lib/seo-metadata";
import {
  absoluteAlternatesForPath,
  localePrefix,
  withLocalePath,
} from "@/lib/locale-url";
import { i18n } from "@/lib/i18n";
import {
  breadcrumbSchema,
  faqPageSchema,
  itemListComparisonSchema,
  schemaGraph,
  schemaId,
  webPageSchema,
} from "@/lib/seo-schema";

function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  return raw.replace(/\/+$/, "");
}

export function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }));
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
    namespace: "alternatives",
  });
  const keywordsRaw = t.raw("keywords");
  const keywords = Array.isArray(keywordsRaw)
    ? keywordsRaw.filter((item): item is string => typeof item === "string")
    : undefined;
  const seo = optimizeSeoText({
    locale: lang,
    context: "product",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });

  return {
    title: seo.title,
    description: seo.description,
    keywords,
    alternates: {
      canonical: `${siteUrl}${prefix}/alternatives`,
      languages: absoluteAlternatesForPath(siteUrl, "/alternatives"),
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "website",
      url: `${siteUrl}${prefix}/alternatives`,
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
    },
  };
}

export default async function AlternativesPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const prefix = localePrefix(lang);
  const siteUrl = getSiteUrl();
  const t = await getTranslations({
    locale: lang,
    namespace: "alternatives",
  });

  const pageUrl = `${siteUrl}${prefix}/alternatives`;
  const appUrl = `https://app.trainingload.ai/${lang}/training-load?from=docs-alt`;
  const siteName = "Trainingload.ai";

  const dimensions = t.raw("dimensions") as Array<{
    label: string;
    tl: string;
    others: string;
  }>;
  const chooseRows = t.raw("chooseRows") as Array<{
    title: string;
    text: string;
  }>;
  const pageFaq = t.raw("faq") as Array<{ question: string; answer: string }>;
  const tlStrengths = t.raw("tlStrengths") as Array<{
    title: string;
    text: string;
  }>;
  const otherStrengths = t.raw("otherStrengths") as Array<{
    title: string;
    text: string;
  }>;
  const competitors = t.raw("competitors") as Array<{
    name: string;
    keyword: string;
    summary: string;
    href: string;
    cta: string;
    bestFor: string;
  }>;
  const productLinks = t.raw("productLinks") as Array<{
    href: string;
    label: string;
    text: string;
    cta: string;
  }>;

  const jsonLd = schemaGraph([
    webPageSchema({
      id: schemaId(pageUrl, "webpage"),
      url: pageUrl,
      name: t("h1"),
      description: t("metaDescription"),
      lang,
    }),
    itemListComparisonSchema({
      id: schemaId(pageUrl, "comparison"),
      name: t("schemaName"),
      description: t("schemaDescription"),
      items: [
        {
          name: siteName,
          description: t("tlDescription"),
          url: `${siteUrl}${prefix}/`,
          strengths: tlStrengths.map((s) => s.title),
          bestFor: t("tlBestFor"),
        },
        ...competitors.map((competitor) => ({
          name: competitor.name,
          description: competitor.summary,
          url: `${siteUrl}${withLocalePath(lang, competitor.href)}`,
          strengths: otherStrengths.map((s) => s.title),
          bestFor: competitor.bestFor,
        })),
      ],
    }),
    faqPageSchema({
      id: schemaId(pageUrl, "faq"),
      mainEntity: pageFaq.map((q) => ({
        "@type": "Question",
        name: q.question,
        acceptedAnswer: { "@type": "Answer", text: q.answer },
      })),
    }),
    breadcrumbSchema({
      id: schemaId(pageUrl, "breadcrumb"),
      items: [
        { name: siteName, item: `${siteUrl}${prefix}/` },
        { name: t("breadcrumb.alternatives"), item: pageUrl },
      ],
    }),
  ]);

  return (
    <main className="overflow-x-hidden bg-background text-neutral-950 dark:bg-background dark:text-white">
      <JsonLd id="alternatives-structured-data" data={jsonLd} />

      <section className="relative overflow-hidden border-b border-neutral-200/70 px-4 py-12 md:px-6 md:py-16 dark:border-white/10">
        <div className="mx-auto max-w-7xl">
          <div className="inline-flex items-center gap-2 rounded-compact border border-emerald-500/20 bg-white/75 px-3 py-1 text-xs font-semibold uppercase text-emerald-700 backdrop-blur dark:border-emerald-500/30 dark:bg-emerald-400/10 dark:text-emerald-200">
            <Scale className="size-3.5" />
            {t("eyebrow")}
          </div>
          <h1 className="mt-6 max-w-4xl text-4xl font-black tracking-tight md:text-6xl">
            {t("h1")}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-neutral-700 dark:text-neutral-300 md:text-lg">
            {t("definition")}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={appUrl}>
              <Button className="h-11 rounded-compact bg-emerald-500 px-5 text-sm font-bold text-white hover:bg-emerald-600 dark:text-neutral-950 dark:hover:bg-emerald-400">
                {t("primary")}
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </Link>
            <Link href={`${prefix}/training-load`}>
              <Button
                variant="outline"
                className="h-11 rounded-compact border-neutral-300 bg-white/80 px-5 text-sm font-semibold backdrop-blur hover:bg-white dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10"
              >
                {t("secondary")}
              </Button>
            </Link>
            <Link href={`${prefix}/ai-training-plan`}>
              <Button
                variant="outline"
                className="h-11 rounded-compact border-neutral-300 bg-white/80 px-5 text-sm font-semibold backdrop-blur hover:bg-white dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10"
              >
                {t("tertiary")}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="px-4 py-12 md:px-6 md:py-16">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-black tracking-tight md:text-4xl">
            {t("comparisonsTitle")}
          </h2>
          <p className="mt-3 max-w-3xl text-base text-neutral-700 dark:text-neutral-300">
            {t("comparisonsSubtitle")}
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {competitors.map((competitor) => (
              <article
                key={competitor.href}
                className="rounded-compact border border-neutral-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
              >
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                  {competitor.keyword}
                </div>
                <h3 className="mt-3 text-xl font-black tracking-tight">
                  {competitor.name}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {competitor.summary}
                </p>
                <Link
                  href={withLocalePath(lang, competitor.href)}
                  className="mt-5 inline-flex items-center text-sm font-bold text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
                >
                  {competitor.cta}
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-12 md:px-6 md:py-16">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-black tracking-tight md:text-4xl">
            {t("comparisonTitle")}
          </h2>
          <p className="mt-3 max-w-3xl text-base text-neutral-700 dark:text-neutral-300">
            {t("comparisonSubtitle")}
          </p>
          <div className="mt-8 overflow-x-auto rounded-compact border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase text-neutral-600 dark:bg-white/[0.03] dark:text-neutral-300">
                <tr>
                  <th className="px-4 py-3 font-semibold">
                    {t("tableHeader.dimension")}
                  </th>
                  <th className="px-4 py-3 font-semibold">{siteName}</th>
                  <th className="px-4 py-3 font-semibold">
                    {t("otherPlatformName")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-white/10">
                {dimensions.map((row) => (
                  <tr key={row.label}>
                    <th className="px-4 py-4 align-top text-sm font-semibold">
                      {row.label}
                    </th>
                    <td className="px-4 py-4 align-top text-sm text-neutral-700 dark:text-neutral-300">
                      {row.tl}
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-neutral-700 dark:text-neutral-300">
                      {row.others}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="bg-neutral-50/50 px-4 py-12 md:px-6 md:py-16 dark:bg-white/[0.02]">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-2">
          <div className="rounded-compact border border-neutral-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            <h3 className="text-xl font-black tracking-tight">
              {t("chooseTitle.tl")}
            </h3>
            <ul className="mt-4 space-y-3">
              {chooseRows
                .slice(0, Math.ceil(chooseRows.length / 2))
                .map((row) => (
                  <li key={row.title} className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                    <div>
                      <div className="text-sm font-black">{row.title}</div>
                      <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
                        {row.text}
                      </p>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
          <div className="rounded-compact border border-neutral-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            <h3 className="text-xl font-black tracking-tight">
              {t("chooseTitle.other")}
            </h3>
            <ul className="mt-4 space-y-3">
              {chooseRows.slice(Math.ceil(chooseRows.length / 2)).map((row) => (
                <li key={row.title} className="flex gap-3">
                  <CircleDashed className="mt-0.5 size-4 shrink-0 text-neutral-500" />
                  <div>
                    <div className="text-sm font-black">{row.title}</div>
                    <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
                      {row.text}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="px-4 py-12 md:px-6 md:py-16">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-black tracking-tight md:text-4xl">
            {t("productLinksTitle")}
          </h2>
          <p className="mt-3 max-w-3xl text-base text-neutral-700 dark:text-neutral-300">
            {t("productLinksSubtitle")}
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {productLinks.map((link) => {
              const href = link.href.startsWith("http")
                ? link.href.replace("{lang}", lang)
                : withLocalePath(lang, link.href);
              return (
                <Link
                  key={link.href}
                  href={href}
                  className="rounded-compact border border-neutral-200 bg-white p-6 shadow-sm transition-colors hover:border-emerald-400 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-emerald-400/50"
                >
                  <div className="text-sm font-black">{link.label}</div>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {link.text}
                  </p>
                  <div className="mt-4 inline-flex items-center text-sm font-bold text-emerald-700 dark:text-emerald-300">
                    {link.cta}
                    <ArrowRight className="ml-2 size-4" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 py-12 md:px-6 md:py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-black tracking-tight md:text-4xl">
            {t("faqTitle")}
          </h2>
          <div className="mt-8 space-y-4">
            {pageFaq.map((q) => (
              <details
                key={q.question}
                className="rounded-compact border border-neutral-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
              >
                <summary className="cursor-pointer text-base font-black">
                  {q.question}
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                  {q.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-12 md:px-6 md:py-16">
        <div className="mx-auto grid max-w-7xl gap-6 rounded-compact bg-emerald-500 p-8 text-white shadow-2xl shadow-emerald-500/20 md:p-12 lg:grid-cols-[1fr_auto] lg:items-center dark:text-neutral-950">
          <div>
            <h2 className="text-3xl font-black tracking-tight md:text-5xl">
              {t("ctaTitle")}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/85 dark:text-neutral-950/75">
              {t("ctaText")}
            </p>
          </div>
          <Link href={appUrl}>
            <Button className="h-12 rounded-compact bg-white px-6 text-sm font-bold text-emerald-700 hover:bg-emerald-50 dark:bg-card dark:text-white dark:hover:bg-accent">
              {t("primary")}
              <ArrowRight className="ml-2 size-4" />
            </Button>
          </Link>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pb-8">
        <ContentFreshness lastUpdated={t("lastUpdatedDate")} />
      </div>
    </main>
  );
}
