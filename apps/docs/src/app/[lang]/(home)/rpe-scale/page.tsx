import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";
import {
  ToolFaqSection,
  ToolHero,
  ToolPageMain,
  ToolSection,
} from "@/components/ToolPageLayout";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import {
  getRpeScaleContent,
  isRpeScaleContentLocale,
  RPE_SCALE_PATH,
} from "@/lib/rpe-scale-content";
import {
  breadcrumbSchema,
  faqPageSchema,
  normalizeSchemaFaqItems,
  schemaGraph,
  schemaId,
  schemaLanguage,
} from "@/lib/seo-schema";

const PUBLISHED_AT = "2026-08-20";

const sources = [
  {
    name: "CDC — Measuring Physical Activity Intensity",
    url: "https://www.cdc.gov/physicalactivity/basics/measuring/index.html",
  },
  {
    name: "Chen, Fan & Moe — Criterion-related validity of the Borg RPE scale",
    url: "https://pubmed.ncbi.nlm.nih.gov/12430990/",
  },
  {
    name: "Borg RPE and CR10 history and practical applications",
    url: "https://pubmed.ncbi.nlm.nih.gov/36361320/",
  },
  {
    name: "25 Years of Session Rating of Perceived Exertion",
    url: "https://pubmed.ncbi.nlm.nih.gov/33508782/",
  },
] as const;

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai"
  ).replace(/\/+$/, "");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const copy = getRpeScaleContent(lang);
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}${localePrefix(lang)}${RPE_SCALE_PATH}`;

  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    keywords: copy.keywords,
    alternates: {
      canonical: pageUrl,
      languages: absoluteAlternatesForPath(siteUrl, RPE_SCALE_PATH),
    },
    robots: isRpeScaleContentLocale(lang)
      ? { index: true, follow: true }
      : { index: false, follow: true },
    openGraph: {
      type: "article",
      title: copy.metadataTitle,
      description: copy.metadataDescription,
      url: pageUrl,
      publishedTime: PUBLISHED_AT,
      modifiedTime: PUBLISHED_AT,
    },
    twitter: {
      card: "summary_large_image",
      title: copy.metadataTitle,
      description: copy.metadataDescription,
    },
  };
}

export default async function RpeScalePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const copy = getRpeScaleContent(lang);
  const prefix = localePrefix(lang);
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}${prefix}${RPE_SCALE_PATH}`;
  const faq = copy.faq.map(([question, answer]) => ({ question, answer }));
  const jsonLd = schemaGraph([
    {
      "@type": "WebPage",
      "@id": schemaId(pageUrl, "webpage"),
      name: copy.title,
      description: copy.metadataDescription,
      url: pageUrl,
      inLanguage: schemaLanguage(lang),
      datePublished: PUBLISHED_AT,
      dateModified: PUBLISHED_AT,
      mainEntity: { "@id": schemaId(pageUrl, "article") },
    },
    {
      "@type": "Article",
      "@id": schemaId(pageUrl, "article"),
      headline: copy.title,
      description: copy.metadataDescription,
      url: pageUrl,
      inLanguage: schemaLanguage(lang),
      datePublished: PUBLISHED_AT,
      dateModified: PUBLISHED_AT,
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": schemaId(pageUrl, "webpage"),
      },
      author: {
        "@type": "Organization",
        name: "Trainingload.ai",
        url: siteUrl,
      },
      publisher: {
        "@type": "Organization",
        name: "Trainingload.ai",
        url: siteUrl,
        logo: {
          "@type": "ImageObject",
          url: `${siteUrl}/LOGO.png`,
        },
      },
      about: [
        { "@type": "Thing", name: "Rating of Perceived Exertion" },
        { "@type": "Thing", name: "Running intensity" },
        { "@type": "Thing", name: "Talk test" },
      ],
      citation: sources.map((source) => source.url),
    },
    faqPageSchema({
      id: schemaId(pageUrl, "faq"),
      mainEntity: normalizeSchemaFaqItems(faq),
    }),
    breadcrumbSchema({
      id: schemaId(pageUrl, "breadcrumb"),
      items: [
        { name: copy.homeLabel, item: `${siteUrl}${prefix}/` },
        { name: copy.shortTitle, item: pageUrl },
      ],
    }),
  ]);

  return (
    <ToolPageMain>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <ToolHero
        badge={copy.eyebrow}
        title={copy.title}
        subtitle={copy.subtitle}
        primary={{ href: "#rpe-scale", label: copy.primaryCta }}
        secondary={{ href: `${prefix}/plan`, label: copy.secondaryCta }}
        visual={
          <aside
            aria-label={copy.scaleTitle}
            className="overflow-hidden rounded-surface border border-border bg-card"
          >
            <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
              <span className="text-sm font-semibold tabular-nums">
                RPE / 10
              </span>
              <span className="text-xs text-muted-foreground">
                {copy.scaleHeaders[3]}
              </span>
            </div>
            <ol className="divide-y divide-border">
              {copy.scaleRows.map((row) => (
                <li key={row.id}>
                  <a
                    href={`#${row.id}`}
                    className="grid grid-cols-[3rem_1fr] items-center gap-x-3 gap-y-1 px-5 py-3 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:grid-cols-[3rem_5rem_1fr]"
                  >
                    <span className="row-span-2 font-display text-xl font-semibold tabular-nums sm:row-span-1">
                      {row.range}
                    </span>
                    <span className="text-sm font-medium">{row.label}</span>
                    <span className="text-xs leading-5 text-muted-foreground sm:text-right">
                      {row.talkTest}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
            <p className="border-t border-border bg-muted/40 px-5 py-4 text-sm text-muted-foreground">
              {copy.effortFirstLabel}
            </p>
          </aside>
        }
      >
        <p className="mt-6 max-w-2xl border-l-2 border-brand pl-4 text-sm leading-7 text-muted-foreground">
          {copy.directAnswer}
        </p>
      </ToolHero>

      <div className="grid min-w-0 gap-10 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-12">
        <aside className="min-w-0 lg:sticky lg:top-40 lg:self-start">
          <nav
            aria-label={copy.toc}
            className="border-y border-border py-5 lg:border-y-0 lg:border-l lg:py-0 lg:pl-4"
          >
            <p className="text-xs font-semibold text-muted-foreground">
              {copy.toc}
            </p>
            <ol className="mt-3 flex flex-wrap gap-x-5 gap-y-3 lg:flex-col lg:gap-1">
              {copy.tocItems.map(([id, label]) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="block rounded-control text-sm leading-6 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring lg:py-1.5"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <article className="flex min-w-0 flex-col gap-12 md:gap-16">
          <ToolSection id="what-is-rpe" title={copy.definitionTitle}>
            <div className="flex max-w-3xl flex-col gap-4 text-[15px] leading-8 text-muted-foreground">
              {copy.definitionParagraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </ToolSection>

          <ToolSection
            id="rpe-scale"
            title={copy.scaleTitle}
            description={copy.scaleIntro}
          >
            <div
              role="region"
              aria-label={copy.scaleTitle}
              tabIndex={0}
              className="overflow-x-auto rounded-surface border border-border bg-card focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <table className="w-full min-w-[700px] border-collapse text-left text-sm leading-6">
                <caption className="sr-only">{copy.scaleTitle}</caption>
                <thead className="border-b border-border bg-muted/60 text-muted-foreground">
                  <tr>
                    {copy.scaleHeaders.map((header) => (
                      <th
                        key={header}
                        scope="col"
                        className="px-4 py-3 font-medium"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {copy.scaleRows.map((row) => (
                    <tr
                      key={row.id}
                      id={row.id}
                      className="scroll-mt-40 transition-colors hover:bg-muted/40"
                    >
                      <th
                        scope="row"
                        className="px-4 py-5 font-display text-xl font-semibold tabular-nums"
                      >
                        {row.range}
                      </th>
                      <td className="px-4 py-5 font-medium">{row.label}</td>
                      <td className="px-4 py-5 text-muted-foreground">
                        {row.feel}
                      </td>
                      <td className="px-4 py-5 text-muted-foreground">
                        {row.talkTest}
                      </td>
                      <td className="px-4 py-5 text-muted-foreground">
                        {row.training}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-start gap-3 rounded-control bg-muted px-4 py-4 text-sm leading-7 text-muted-foreground">
              <TriangleAlert
                aria-hidden="true"
                className="mt-1 size-4 shrink-0"
              />
              <p>{copy.scaleCaution}</p>
            </div>
          </ToolSection>

          <ToolSection
            id="5k-plans"
            title={copy.plansTitle}
            description={copy.plansIntro}
          >
            <div className="divide-y divide-border overflow-hidden rounded-surface border border-border bg-card">
              {copy.plans.map((plan) => (
                <Link
                  key={plan.href}
                  href={`${prefix}${plan.href}`}
                  className="group grid grid-cols-[1fr_auto] items-center gap-x-5 gap-y-3 p-5 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:grid-cols-[minmax(9rem,1fr)_2fr_auto]"
                >
                  <div>
                    <h3 className="font-semibold">{plan.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {plan.range}
                    </p>
                  </div>
                  <p className="col-start-1 row-start-2 text-sm leading-6 text-muted-foreground sm:col-start-2 sm:row-start-1">
                    {plan.description}
                  </p>
                  <ArrowRight
                    aria-hidden="true"
                    className="col-start-2 row-start-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:col-start-3"
                  />
                </Link>
              ))}
            </div>
          </ToolSection>

          <ToolSection
            id="rpe-vs-pace-heart-rate"
            title={copy.compareTitle}
            description={copy.compareIntro}
          >
            <div className="grid gap-6 md:grid-cols-3">
              {copy.comparisons.map((item) => (
                <article
                  key={item.title}
                  className="border-t border-border pt-4"
                >
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7">{item.strength}</p>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    {item.limitation}
                  </p>
                </article>
              ))}
            </div>
            <p className="border-l-2 border-brand pl-4 text-sm leading-7 text-muted-foreground">
              {copy.compareConclusion}
            </p>
          </ToolSection>

          <ToolSection id="ai-coach" title={copy.coachTitle}>
            <div className="flex max-w-3xl flex-col gap-4 text-[15px] leading-8 text-muted-foreground">
              {copy.coachParagraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <ol className="mt-2 grid gap-6 md:grid-cols-3">
              {copy.coachSteps.map((step, index) => (
                <li key={step.title} className="border-t border-border pt-4">
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-3 text-base font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    {step.description}
                  </p>
                </li>
              ))}
            </ol>
          </ToolSection>

          <ToolSection
            id="rpe-meanings"
            title={copy.meaningsTitle}
            description={copy.meaningsIntro}
          >
            <div className="divide-y divide-border border-y border-border">
              {copy.meanings.map((item) => {
                const content = (
                  <>
                    <div>
                      <h3 className="text-base font-semibold">{item.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                    {item.href ? (
                      <ArrowRight
                        aria-hidden="true"
                        className="mt-1 size-4 shrink-0 text-muted-foreground"
                      />
                    ) : null}
                  </>
                );
                const className = "flex items-start justify-between gap-5 py-5";
                return item.href ? (
                  <Link
                    key={item.title}
                    href={`${prefix}${item.href}`}
                    className={`${className} rounded-control transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring`}
                  >
                    {content}
                  </Link>
                ) : (
                  <article key={item.title} className={className}>
                    {content}
                  </article>
                );
              })}
            </div>
          </ToolSection>

          <div className="grid gap-10 xl:grid-cols-2">
            <ToolSection
              title={copy.calibrateTitle}
              description={copy.calibrateIntro}
            >
              <ol className="flex flex-col gap-4">
                {copy.calibrateSteps.map((step, index) => (
                  <li
                    key={step}
                    className="flex gap-3 text-sm leading-7 text-muted-foreground"
                  >
                    <span className="font-medium tabular-nums text-foreground">
                      {index + 1}.
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </ToolSection>
            <ToolSection title={copy.mistakesTitle}>
              <ul className="ml-4 flex list-disc flex-col gap-4 text-sm leading-7 text-muted-foreground marker:text-muted-foreground">
                {copy.mistakes.map((mistake) => (
                  <li key={mistake}>{mistake}</li>
                ))}
              </ul>
            </ToolSection>
          </div>

          <ToolFaqSection id="faq" title={copy.faqTitle} items={faq} />

          <ToolSection title={copy.sourcesTitle} description={copy.sourceNote}>
            <ul className="flex flex-col gap-3 text-sm leading-6">
              {sources.map((source) => (
                <li key={source.url}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-control text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                  >
                    {source.name}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-2 border-t border-border pt-5 text-sm leading-7 text-muted-foreground">
              {copy.safety}
            </p>
          </ToolSection>

          <ToolSection title={copy.relatedTitle}>
            <div className="grid gap-3 md:grid-cols-2">
              {copy.related.map(([title, href, description]) => (
                <Link
                  key={href}
                  href={`${prefix}${href}`}
                  className="group flex items-start justify-between gap-4 rounded-surface border border-border bg-card p-5 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                >
                  <div>
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {description}
                    </p>
                  </div>
                  <ArrowRight
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              ))}
            </div>
          </ToolSection>
        </article>
      </div>
    </ToolPageMain>
  );
}
