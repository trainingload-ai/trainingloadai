import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ContentFreshness } from "@/components/ContentFreshness";
import { ArrowRight, Target } from "lucide-react";
import {
  breadcrumbSchema,
  schemaGraph,
  schemaId,
  schemaLanguage,
} from "@/lib/seo-schema";
import { cn } from "@/lib/utils";

export type FeatureIntentPageCopy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  answerEyebrow?: string;
  answerTitle?: string;
  answerSubtitle?: string;
  updatedLabel?: string;
  lastUpdated?: string;
  lastUpdatedDate?: string;
  methodologyEyebrow?: string;
  methodologyTitle?: string;
  methodologyText?: string;
  sourcesTitle?: string;
  faqTitle?: string;
  faqSubtitle?: string;
  primary: string;
  secondary: string;
  blocksTitle: string;
  blocksSubtitle: string;
  docsAction: string;
  toolsAction: string;
  productAction: string;
  ctaTitle: string;
  ctaText: string;
};

export type FeatureIntentData = {
  copy: FeatureIntentPageCopy;
  keywords: string[];
  description: string;
  blocks: Array<[string, string]>;
  answerBlocks?: Array<[string, string]>;
  sources?: string[];
  faq: Array<[string, string]>;
};

export function FeatureIntentPage({
  lang,
  prefix,
  siteUrl,
  pagePath,
  copy,
  blocks,
  answerBlocks,
  sources,
  faq,
  homeLabel,
  docsHref,
  toolsHref,
  primaryHref,
  secondaryHref,
  pageKey,
  icon,
  guideContent,
  heroAside,
  variant = "default",
}: {
  lang: string;
  prefix: string;
  siteUrl: string;
  pagePath: string;
  copy: FeatureIntentPageCopy;
  blocks: Array<[string, string]>;
  answerBlocks?: Array<[string, string]>;
  sources?: string[];
  faq: Array<[string, string]>;
  homeLabel: string;
  docsHref: string;
  toolsHref: string;
  primaryHref: string;
  secondaryHref: string;
  pageKey: string;
  icon: ReactNode;
  guideContent?: ReactNode;
  heroAside?: ReactNode;
  variant?: "default" | "editorial";
}) {
  const pageUrl = `${siteUrl}${prefix}${pagePath}`;
  const hasAnswerBlocks =
    Array.isArray(answerBlocks) && answerBlocks.length > 0;
  const jsonLd = schemaGraph([
    {
      "@type": "WebPage",
      "@id": schemaId(pageUrl, "webpage"),
      name: copy.title,
      description: copy.subtitle,
      url: pageUrl,
      inLanguage: schemaLanguage(lang),
      ...(copy.lastUpdatedDate ? { dateModified: copy.lastUpdatedDate } : {}),
    },
    {
      "@type": "HowTo",
      "@id": schemaId(pageUrl, "howto"),
      name: copy.blocksTitle,
      description: copy.blocksSubtitle,
      inLanguage: schemaLanguage(lang),
      step: blocks.map(([name, text], index) => ({
        "@type": "HowToStep",
        position: index + 1,
        name,
        text,
      })),
    },
    hasAnswerBlocks
      ? {
          "@type": "ItemList",
          "@id": schemaId(pageUrl, "answer-blocks"),
          name: copy.answerTitle ?? copy.title,
          inLanguage: schemaLanguage(lang),
          itemListElement: answerBlocks.map(([name, description], index) => ({
            "@type": "ListItem",
            position: index + 1,
            name,
            description,
          })),
        }
      : null,
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
        { name: homeLabel, item: `${siteUrl}${prefix}/` },
        { name: copy.title, item: pageUrl },
      ],
    }),
  ]);
  const isEditorial = variant === "editorial";

  return (
    <main
      className={cn(
        "overflow-x-hidden bg-background text-foreground",
        isEditorial && "selection:bg-brand selection:text-brand-foreground",
      )}
    >
      <JsonLd id={`${pageKey}-structured-data`} data={jsonLd} />

      <section
        className={cn(
          "relative overflow-hidden border-b border-border px-4 py-12 md:px-6 md:py-16",
          isEditorial && "px-5 py-12 md:py-16 xl:min-h-[650px]",
        )}
      >
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 opacity-[0.16] dark:opacity-[0.2]",
            isEditorial &&
              "opacity-[0.1] [mask-image:linear-gradient(to_bottom,black,transparent_85%)] dark:opacity-[0.16]",
          )}
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(15,23,42,0.22) 0 1px, transparent 1px), linear-gradient(0deg, rgba(15,23,42,0.14) 0 1px, transparent 1px)",
            backgroundSize: "76px 76px",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 -top-48 size-[560px] rounded-full bg-brand/10 blur-3xl"
        />
        <div
          className={cn(
            "relative mx-auto max-w-7xl",
            isEditorial && heroAside && "max-w-6xl xl:min-h-[460px]",
          )}
        >
          <div
            className={cn(
              isEditorial &&
                heroAside &&
                "relative z-10 max-w-[660px] xl:flex xl:min-h-[460px] xl:flex-col xl:items-start xl:justify-center",
            )}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-soft px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
              {icon}
              {copy.eyebrow}
            </div>
            <h1
              className={cn(
                "mt-6 max-w-4xl text-4xl font-black tracking-tight md:text-6xl",
                isEditorial && "text-balance leading-[1.02] md:text-[3.6rem]",
              )}
            >
              {copy.title}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
              {copy.subtitle}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={primaryHref}>
                <Button
                  variant="brand"
                  className="h-11 rounded-control-lg px-5 text-sm font-bold"
                >
                  {copy.primary}
                  <ArrowRight aria-hidden="true" className="ml-2 size-4" />
                </Button>
              </Link>
              <Link href={secondaryHref}>
                <Button
                  variant="outline"
                  className="h-11 rounded-control-lg border-border bg-card px-5 text-sm font-semibold hover:bg-muted"
                >
                  {copy.secondary}
                </Button>
              </Link>
            </div>
          </div>
          {heroAside ? (
            <div className="absolute left-[calc(50%+260px)] top-1/2 z-0 hidden w-[min(980px,75vw)] -translate-y-1/2 xl:block">
              {heroAside}
            </div>
          ) : null}
        </div>
      </section>

      {copy.methodologyTitle || sources?.length ? (
        <section
          className={cn(
            "border-y border-border bg-card/70 px-4 py-12 md:px-6 md:py-16",
            isEditorial && "border-t-0 px-5 py-10",
          )}
        >
          <div
            className={cn(
              "mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,0.72fr)_minmax(320px,0.4fr)]",
              isEditorial &&
                "max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_340px]",
            )}
          >
            {copy.methodologyTitle ? (
              <article
                className={cn(
                  "rounded-surface border border-border bg-card p-5",
                  isEditorial && "rounded-overlay p-6 md:p-7",
                )}
              >
                {copy.methodologyEyebrow ? (
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-success">
                    {copy.methodologyEyebrow}
                  </div>
                ) : null}
                <h2 className="mt-3 text-2xl font-black tracking-tight">
                  {copy.methodologyTitle}
                </h2>
                {copy.methodologyText ? (
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {copy.methodologyText}
                  </p>
                ) : null}
              </article>
            ) : null}
            {sources?.length ? (
              <aside
                className={cn(
                  "rounded-surface border border-border bg-card p-5",
                  isEditorial && "rounded-overlay border-dashed p-6",
                )}
              >
                {copy.updatedLabel ? (
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {copy.updatedLabel}
                  </div>
                ) : null}
                {copy.lastUpdated ? (
                  <div className="mt-2 text-lg font-black">
                    {copy.lastUpdated}
                  </div>
                ) : null}
                {copy.sourcesTitle ? (
                  <h3 className="mt-5 text-sm font-black">
                    {copy.sourcesTitle}
                  </h3>
                ) : null}
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
                  {sources.map((source) => (
                    <li key={source}>{source}</li>
                  ))}
                </ul>
              </aside>
            ) : null}
          </div>
        </section>
      ) : null}

      {hasAnswerBlocks ? (
        <section
          className={cn(
            "mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-16",
            isEditorial && "max-w-6xl px-5 py-12 md:py-16",
          )}
        >
          <div className="max-w-3xl">
            {copy.answerEyebrow ? (
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-success">
                {copy.answerEyebrow}
              </div>
            ) : null}
            <h2 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
              {copy.answerTitle ?? copy.blocksTitle}
            </h2>
            {copy.answerSubtitle ? (
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                {copy.answerSubtitle}
              </p>
            ) : null}
          </div>
          <div
            className={cn(
              "mt-8 grid gap-3 md:grid-cols-2",
              isEditorial && "lg:grid-cols-5",
            )}
          >
            {answerBlocks.map(([title, text], index) => (
              <article
                key={title}
                className={cn(
                  "rounded-surface border border-brand/30 bg-brand-soft p-5",
                  isEditorial &&
                    "group rounded-overlay border-border bg-card p-5 transition-colors hover:border-brand",
                )}
              >
                {isEditorial ? (
                  <div className="mb-5 font-mono text-xs font-semibold text-success">
                    0{index + 1}
                  </div>
                ) : null}
                <h3 className="text-lg font-black">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {text}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {guideContent}

      <section
        className={cn(
          "mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-16",
          isEditorial && "max-w-6xl px-5 py-12 md:py-16",
        )}
      >
        <div className="max-w-3xl">
          <h2 className="text-3xl font-black tracking-tight md:text-4xl">
            {copy.blocksTitle}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            {copy.blocksSubtitle}
          </p>
        </div>
        <div
          className={cn(
            "mt-8 grid gap-3 md:grid-cols-2",
            isEditorial &&
              "gap-px overflow-hidden rounded-overlay border border-border bg-border",
          )}
        >
          {blocks.map(([title, text], index) => (
            <article
              key={title}
              className={cn(
                "rounded-surface border border-border bg-card p-5",
                isEditorial && "rounded-none border-0 p-6 md:p-7",
              )}
            >
              <div className="flex items-center gap-3">
                {isEditorial ? (
                  <span className="flex size-7 items-center justify-center rounded-full bg-brand-soft font-mono text-xs font-bold text-foreground">
                    {index + 1}
                  </span>
                ) : null}
                <h3 className="text-lg font-black">{title}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {text}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="faq"
        className={cn(
          "border-y border-border bg-card/70 px-4 py-12 md:px-6 md:py-16",
          isEditorial && "scroll-mt-32 px-5 py-12 md:py-16",
        )}
      >
        <div className={cn("mx-auto max-w-7xl", isEditorial && "max-w-6xl")}>
          {copy.faqTitle ? (
            <div className="max-w-3xl">
              <h2 className="text-3xl font-black tracking-tight md:text-4xl">
                {copy.faqTitle}
              </h2>
              {copy.faqSubtitle ? (
                <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                  {copy.faqSubtitle}
                </p>
              ) : null}
            </div>
          ) : null}
          <div
            className={cn(
              "mt-8 grid gap-3 md:grid-cols-2",
              isEditorial &&
                "gap-0 divide-y divide-border rounded-overlay border border-border bg-card px-6",
            )}
          >
            {faq.map(([question, answer]) => (
              <article
                key={question}
                className={cn(
                  "rounded-surface border border-border bg-card p-5",
                  isEditorial &&
                    "rounded-none border-0 bg-transparent px-0 py-6 md:col-span-2",
                )}
              >
                <h3 className="text-lg font-black">{question}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {answer}
                </p>
              </article>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={docsHref}>
              <Button
                variant="outline"
                className="h-10 rounded-control border-border bg-card px-4 text-xs font-semibold text-foreground hover:bg-muted"
              >
                {copy.docsAction}
              </Button>
            </Link>
            <Link href={toolsHref}>
              <Button
                variant="outline"
                className="h-10 rounded-control border-border bg-card px-4 text-xs font-semibold text-foreground hover:bg-muted"
              >
                {copy.toolsAction}
              </Button>
            </Link>
            <Link href={primaryHref}>
              <Button className="h-10 rounded-control px-4 text-xs font-semibold">
                {copy.productAction}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="px-5 py-12 md:py-16">
        <div
          className={cn(
            "mx-auto grid max-w-7xl gap-6 rounded-feature bg-brand p-8 text-brand-foreground md:p-12 lg:grid-cols-[1fr_auto] lg:items-center",
            isEditorial && "max-w-6xl overflow-hidden rounded-feature bg-brand",
          )}
        >
          <div>
            <Target aria-hidden="true" className="size-6" />
            <h2 className="mt-4 text-3xl font-black tracking-tight md:text-5xl">
              {copy.ctaTitle}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-brand-foreground/75">
              {copy.ctaText}
            </p>
          </div>
          <Link href={primaryHref}>
            <Button className="h-12 rounded-control-lg bg-primary px-6 text-sm font-bold text-primary-foreground hover:opacity-90">
              {copy.primary}
              <ArrowRight aria-hidden="true" className="ml-2 size-4" />
            </Button>
          </Link>
        </div>
      </section>

      {copy.lastUpdatedDate ? (
        <div className="mx-auto max-w-7xl px-4 pb-8">
          <ContentFreshness lastUpdated={copy.lastUpdatedDate} />
        </div>
      ) : null}
    </main>
  );
}
