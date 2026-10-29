import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { JsonLd } from "@/components/JsonLd";
import {
  ArrowRight,
  Bike,
  BrainCircuit,
  CheckCircle2,
  Footprints,
  Route,
  Sparkles,
} from "lucide-react";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import {
  aiCoachSlugs,
  type AiCoachCollectionCopy,
  type AiCoachPage,
  type AiCoachPageLabels,
} from "@/lib/ai-coach-pages";
import {
  breadcrumbSchema,
  faqPageSchema,
  itemListSchema,
  schemaGraph,
  schemaId,
  webPageSchema,
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
  const t = await getTranslations({ locale: lang, namespace: "aiCoachPages" });
  const copy = t.raw("collection") as AiCoachCollectionCopy;

  return {
    title: copy.metaTitle,
    description: copy.metaDescription,
    keywords: copy.keywords,
    alternates: {
      canonical: `${siteUrl}${prefix}/ai-coach`,
      languages: absoluteAlternatesForPath(siteUrl, "/ai-coach"),
    },
    openGraph: {
      title: copy.metaTitle,
      description: copy.metaDescription,
      type: "website",
      url: `${siteUrl}${prefix}/ai-coach`,
    },
    twitter: {
      card: "summary_large_image",
      title: copy.metaTitle,
      description: copy.metaDescription,
    },
  };
}

export default async function AiCoachCollectionPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const prefix = localePrefix(lang);
  const siteUrl = getSiteUrl();
  const appUrl = `https://app.trainingload.ai/${lang}/ai-coach?from=docs-ai-coach`;
  const pageUrl = `${siteUrl}${prefix}/ai-coach`;
  const screenshotLocale = ["zh", "zh-hant", "ja"].includes(lang) ? lang : "en";
  const productScreenshot = `/5k-training-plan/web-coach-dark-v2-${screenshotLocale}.png`;
  const t = await getTranslations({ locale: lang, namespace: "aiCoachPages" });
  const copy = t.raw("collection") as AiCoachCollectionCopy;
  const labels = t.raw("labels") as AiCoachPageLabels;
  const rawPages = t.raw("pages") as Record<string, AiCoachPage>;
  const pages = aiCoachSlugs.map((slug) => rawPages[slug]);

  const jsonLd = schemaGraph([
    webPageSchema({
      id: schemaId(pageUrl, "webpage"),
      url: pageUrl,
      name: copy.metaTitle.replace(" | Trainingload.ai", ""),
      description: copy.metaDescription,
      lang,
      type: "CollectionPage",
    }),
    itemListSchema({
      id: schemaId(pageUrl, "coach-types"),
      items: pages.map((page) => ({
        name: page.metaTitle.replace(" | Trainingload.ai", ""),
        description: page.metaDescription,
        url: `${siteUrl}${prefix}/ai-coach/${page.slug}`,
      })),
    }),
    faqPageSchema({
      id: schemaId(pageUrl, "faq"),
      mainEntity: copy.faq.map(([question, answer]) => ({
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
        { name: labels.aiCoach, item: pageUrl },
      ],
    }),
  ]);

  return (
    <main className="overflow-x-hidden bg-background text-foreground">
      <JsonLd id="ai-coach-collection-structured-data" data={jsonLd} />

      <section className="relative overflow-hidden bg-secondary/60 px-4 py-14 md:px-6 md:py-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--brand) 42%, transparent) 1px, transparent 1.35px)",
            backgroundSize: "26px 26px",
            maskImage:
              "radial-gradient(ellipse 70% 105% at 100% 100%, #000 0%, rgba(0,0,0,.72) 38%, rgba(0,0,0,.2) 70%, transparent 92%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 70% 105% at 100% 100%, #000 0%, rgba(0,0,0,.72) 38%, rgba(0,0,0,.2) 70%, transparent 92%)",
          }}
        />
        <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.72fr)] lg:items-center lg:gap-16">
          <div>
            <h1 className="font-display max-w-4xl text-balance text-4xl font-bold leading-[1.04] tracking-[-0.035em] md:text-6xl">
              {copy.title}
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-7 text-muted-foreground md:text-lg md:leading-8">
              {copy.subtitle}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={appUrl}
                className="inline-flex h-11 items-center justify-center rounded-control bg-brand px-5 text-sm font-bold text-brand-foreground transition-colors hover:bg-brand/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {copy.primary}
                <ArrowRight aria-hidden="true" className="ml-2 size-4" />
              </Link>
              <Link
                href={`${prefix}/ai-training-plan`}
                className="inline-flex h-11 items-center justify-center rounded-control bg-card px-5 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {copy.secondary}
              </Link>
            </div>
          </div>

          <figure className="relative overflow-hidden rounded-feature bg-neutral-950 shadow-[0_28px_80px_-44px_rgba(0,0,0,0.72)]">
            <div className="aspect-[3/2] overflow-hidden">
              <Image
                src={productScreenshot}
                alt={`${copy.title} — Trainingload.ai`}
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
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(20rem,0.5fr)] lg:items-end lg:gap-16">
          <div className="max-w-3xl">
            <div className="inline-flex size-11 items-center justify-center rounded-surface bg-brand-soft text-brand-strong">
              <Route aria-hidden="true" className="size-5" />
            </div>
            <h2 className="font-display mt-5 text-3xl font-bold tracking-[-0.025em] md:text-4xl">
              {copy.groupTitle}
            </h2>
          </div>
          <p className="text-sm leading-7 text-muted-foreground md:text-base">
            {copy.groupSubtitle}
          </p>
        </div>

        <div className="mt-9 grid gap-3 md:grid-cols-2">
          {pages.map((page, index) => {
            const SportIcon = page.slug === "running-coach" ? Footprints : Bike;
            return (
              <article
                key={page.slug}
                className="group relative flex min-h-[25rem] flex-col overflow-hidden rounded-overlay bg-secondary/70 p-5 transition-transform duration-200 hover:-translate-y-0.5 sm:p-6"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-3 -top-7 font-display text-[8rem] font-bold leading-none text-foreground/[0.035]"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="relative flex items-start justify-between gap-4">
                  <span className="grid size-11 place-items-center rounded-surface bg-card text-brand-strong">
                    <SportIcon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="rounded-control bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand-strong">
                    {page.sport}
                  </span>
                </div>
                <h3 className="relative mt-6 max-w-xl text-2xl font-bold leading-8 tracking-[-0.02em]">
                  {page.title}
                </h3>
                <p className="relative mt-3 text-sm leading-6 text-muted-foreground">
                  {page.subtitle}
                </p>
                <ul className="relative mt-5 grid gap-2 sm:grid-cols-2">
                  {page.signals.slice(0, 4).map(([title]) => (
                    <li
                      key={title}
                      className="flex items-center gap-2 rounded-control bg-card/75 px-3 py-2 text-xs font-semibold"
                    >
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full bg-brand"
                      />
                      <span>{title}</span>
                    </li>
                  ))}
                </ul>
                <div className="relative mt-auto grid grid-cols-2 gap-2 pt-6">
                  <Link
                    href={`${prefix}/ai-coach/${page.slug}`}
                    className="inline-flex h-10 items-center justify-center rounded-control bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {copy.cardPrimary}
                    <ArrowRight aria-hidden="true" className="ml-2 size-3.5" />
                  </Link>
                  <Link
                    href={`${appUrl}&intent=${page.slug}`}
                    className="inline-flex h-10 items-center justify-center rounded-control bg-card px-3 text-xs font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {copy.cardSecondary}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="bg-secondary/55 px-4 py-14 md:px-6 md:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.72fr_1fr] lg:gap-14">
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
                <div className="flex items-start gap-3">
                  <CheckCircle2
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0 text-brand-strong"
                  />
                  <div>
                    <h3 className="text-base font-bold">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {text}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 md:px-6 md:py-20">
        <div className="grid gap-3 lg:grid-cols-2">
          {pages.map((page) => (
            <article
              key={page.slug}
              className="rounded-overlay bg-secondary/65 p-5 sm:p-6"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-brand-strong">
                    {page.sport} · {labels.example}
                  </div>
                  <h2 className="mt-2 text-xl font-bold tracking-[-0.015em]">
                    {page.exampleTitle}
                  </h2>
                </div>
                <BrainCircuit
                  aria-hidden="true"
                  className="size-5 text-muted-foreground"
                />
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {page.exampleSubtitle}
              </p>
              <ol className="mt-6 grid gap-2">
                {page.exampleSteps.map(([title, text], index) => (
                  <li
                    key={title}
                    className="flex gap-3 rounded-control bg-card p-3.5"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-control bg-brand-soft text-[11px] font-bold tabular-nums text-brand-strong">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold">{title}</h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {text}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>

      <section id="faq" className="bg-secondary/55 px-4 py-14 md:px-6 md:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-brand-strong">
              FAQ
            </div>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-[-0.025em] md:text-4xl">
              {copy.faqTitle}
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              {copy.faqSubtitle}
            </p>
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
    </main>
  );
}
