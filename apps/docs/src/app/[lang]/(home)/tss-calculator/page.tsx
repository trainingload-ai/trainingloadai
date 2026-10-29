import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { optimizeSeoText } from "@/lib/seo-metadata";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import { CalculatorPromo } from "@/components/calculators/app-promo";
import { ToolProductPreview } from "@/components/calculators/tool-product-preview";
import layout from "@/components/calculators/tool-page.module.css";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { readTssInputs } from "./share-inputs";
import {
  ToolCard,
  ToolFaqSection,
  ToolHero,
  ToolHowToSection,
  ToolPageMain,
  ToolRelatedLinks,
  ToolSection,
} from "@/components/ToolPageLayout";
import {
  breadcrumbSchema,
  faqPageSchema,
  howToSchema,
  normalizeFaqItems,
  normalizeFeatureList,
  normalizeSchemaFaqItems,
  schemaGraph,
  schemaId,
  webApplicationSchema,
  webPageSchema,
} from "@/lib/seo-schema";
import { TssCalculatorClient } from "./client";

type TssExampleRow = {
  workout: string;
  duration: string;
  intensity: string;
  score: string;
};

type TssMethodRow = {
  method: string;
  inputs: string;
  use: string;
  limit: string;
};

type TssUseCard = {
  title: string;
  body: string;
};

type SourceLink = {
  label: string;
  href: string;
};

function readRows<T extends object>(
  raw: unknown,
  keys: readonly (keyof T)[],
): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is T => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<PropertyKey, unknown>;
    return keys.every((key) => typeof record[key as PropertyKey] === "string");
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const prefix = localePrefix(lang);
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const pageUrl = `${siteUrl}${prefix}/tss-calculator`;
  const ogImageUrl = `${siteUrl}/og/tss-calculator.png`;
  const t = await getTranslations({
    locale: lang,
    namespace: "tssCalculator.metadata",
  });
  const keywordsRaw = t.raw("keywords");
  const keywords = Array.isArray(keywordsRaw) ? keywordsRaw : undefined;
  const seo = optimizeSeoText({
    locale: lang,
    context: "calculator",
    title: t("title"),
    description: t("description"),
  });

  return {
    title: seo.title,
    description: seo.description,
    keywords,
    alternates: {
      canonical: pageUrl,
      languages: absoluteAlternatesForPath(siteUrl, "/tss-calculator"),
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: [ogImageUrl],
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "website",
      url: pageUrl,
      images: [{ url: ogImageUrl }],
    },
  };
}

export default async function TssCalculatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang } = await params;
  const initialInputs = readTssInputs(await searchParams);
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const prefix = localePrefix(lang);
  const tPage = await getTranslations({
    locale: lang,
    namespace: "tssCalculator.page",
  });
  const tCommon = await getTranslations({
    locale: lang,
    namespace: "commonLinks",
  });
  const t = await getTranslations({
    locale: lang,
    namespace: "tssCalculator.jsonLd",
  });

  const pageFaq = normalizeFaqItems(tPage.raw("faq"));
  const exampleRows = readRows<TssExampleRow>(
    tPage.raw("sections.examples.rows"),
    ["workout", "duration", "intensity", "score"],
  );
  const methodRows = readRows<TssMethodRow>(
    tPage.raw("sections.methods.rows"),
    ["method", "inputs", "use", "limit"],
  );
  const useCards = readRows<TssUseCard>(tPage.raw("sections.use.cards"), [
    "title",
    "body",
  ]);
  const sourceLinks = readRows<SourceLink>(tPage.raw("sections.use.sources"), [
    "label",
    "href",
  ]);
  const ui = tPage.raw("ui") as {
    badge: string;
    primary: string;
    docs: string;
    jump: Record<string, string>;
    related: string;
    visual: { signal: string; duration: string; if: string; tss: string };
  };

  const howToSteps = [
    {
      name: tPage("howTo.steps.inputs.title"),
      text: tPage("howTo.steps.inputs.body"),
    },
    {
      name: tPage("howTo.steps.formula.title"),
      text: tPage("howTo.steps.formula.body"),
    },
    {
      name: tPage("howTo.steps.next.title"),
      text: tPage("howTo.steps.next.body"),
    },
  ];

  const pageUrl = `${siteUrl}${prefix}/tss-calculator`;
  const appId = schemaId(pageUrl, "app");
  const jsonLd = schemaGraph([
    webPageSchema({
      id: schemaId(pageUrl, "webpage"),
      url: pageUrl,
      name: t("name"),
      description: t("description"),
      lang,
      mainEntityId: appId,
    }),
    webApplicationSchema({
      id: appId,
      url: pageUrl,
      name: t("name"),
      applicationCategory: t("applicationCategory"),
      description: t("description"),
      featureList: normalizeFeatureList(t.raw("featureList")),
    }),
    howToSchema({
      id: schemaId(pageUrl, "howto"),
      name: tPage("howTo.title"),
      description: tPage("subtitle"),
      steps: howToSteps,
    }),
    breadcrumbSchema({
      id: schemaId(pageUrl, "breadcrumb"),
      items: [
        { name: t("breadcrumb.home"), item: `${siteUrl}${prefix}/` },
        { name: t("breadcrumb.tools"), item: `${siteUrl}${prefix}/tools` },
        { name: t("name"), item: pageUrl },
      ],
    }),
    faqPageSchema({
      id: schemaId(pageUrl, "faq"),
      mainEntity: normalizeSchemaFaqItems(pageFaq),
    }),
  ]);

  return (
    <ToolPageMain maxWidth="max-w-7xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <TssCalculatorClient
        key={JSON.stringify(initialInputs)}
        initialInputs={initialInputs}
        hero={
          <ToolHero
            key="tss-hero"
            badge={ui.badge}
            title={tPage("title")}
            subtitle={tPage("subtitle")}
            secondary={{
              href: `${prefix}/docs/metrics/training-load/training-stress-score`,
              label: ui.docs,
            }}
          >
            <ToolProductPreview lang={lang} kind="load" />
          </ToolHero>
        }
      />

      <ToolSection
        id="what-is"
        title={tPage("sections.answer.title")}
        description={tPage("sections.answer.description")}
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
          <ToolCard className="flex flex-col gap-3">
            {tPage("sections.answer.body")
              .split(/\n\n+/)
              .map((paragraph) => (
                <p
                  key={paragraph}
                  className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300"
                >
                  {paragraph}
                </p>
              ))}
          </ToolCard>
          <ToolCard className="flex flex-col gap-3">
            <h3 className="text-sm font-bold text-neutral-950 dark:text-white">
              {tPage("sections.answer.formulaTitle")}
            </h3>
            <code className="overflow-x-auto rounded-compact border border-neutral-200 bg-neutral-100 p-3 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
              {tPage("sections.answer.formula")}
            </code>
            <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
              {tPage("sections.answer.example")}
            </p>
          </ToolCard>
        </div>
      </ToolSection>

      <ToolHowToSection
        title={tPage("howTo.title")}
        steps={[
          {
            title: tPage("howTo.steps.inputs.title"),
            body: tPage("howTo.steps.inputs.body"),
          },
          {
            title: tPage("howTo.steps.formula.title"),
            body: tPage("howTo.steps.formula.body"),
          },
          {
            title: tPage("howTo.steps.next.title"),
            body: tPage("howTo.steps.next.body"),
          },
        ]}
      />

      <ToolSection
        id="examples"
        title={tPage("sections.examples.title")}
        description={tPage("sections.examples.description")}
      >
        <ToolCard className="overflow-hidden p-0">
          <Table className="min-w-[560px]">
            <caption className="sr-only">
              {tPage("sections.examples.caption")}
            </caption>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {tPage("sections.examples.headers.workout")}
                </TableHead>
                <TableHead>
                  {tPage("sections.examples.headers.duration")}
                </TableHead>
                <TableHead>
                  {tPage("sections.examples.headers.intensity")}
                </TableHead>
                <TableHead>
                  {tPage("sections.examples.headers.score")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exampleRows.map((row) => (
                <TableRow key={`${row.workout}-${row.duration}`}>
                  <TableCell className="font-medium whitespace-normal">
                    {row.workout}
                  </TableCell>
                  <TableCell>{row.duration}</TableCell>
                  <TableCell>{row.intensity}</TableCell>
                  <TableCell className="font-mono font-semibold">
                    {row.score}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ToolCard>
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          {tPage("sections.examples.note")}
        </p>
      </ToolSection>

      <ToolSection
        id="methods"
        title={tPage("sections.methods.title")}
        description={tPage("sections.methods.description")}
      >
        <ToolCard className="overflow-hidden p-0">
          <Table className="min-w-[720px]">
            <caption className="sr-only">
              {tPage("sections.methods.caption")}
            </caption>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {tPage("sections.methods.headers.method")}
                </TableHead>
                <TableHead>
                  {tPage("sections.methods.headers.inputs")}
                </TableHead>
                <TableHead>{tPage("sections.methods.headers.use")}</TableHead>
                <TableHead>{tPage("sections.methods.headers.limit")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {methodRows.map((row) => (
                <TableRow key={row.method}>
                  <TableCell className="font-medium">{row.method}</TableCell>
                  <TableCell className="whitespace-normal">
                    {row.inputs}
                  </TableCell>
                  <TableCell className="whitespace-normal">{row.use}</TableCell>
                  <TableCell className="whitespace-normal text-neutral-600 dark:text-neutral-400">
                    {row.limit}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ToolCard>
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          {tPage("sections.methods.note")}
        </p>
      </ToolSection>

      <ToolSection
        id="use-tss"
        title={tPage("sections.use.title")}
        description={tPage("sections.use.description")}
      >
        <div className="grid gap-3 md:grid-cols-3">
          {useCards.map((card) => (
            <ToolCard key={card.title} className="flex flex-col gap-2">
              <h3 className="text-base font-bold text-neutral-950 dark:text-white">
                {card.title}
              </h3>
              <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                {card.body}
              </p>
            </ToolCard>
          ))}
        </div>
        <div className="flex flex-col gap-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          <p>{tPage("sections.answer.npNote")}</p>
          <p>{tPage("sections.answer.equivalents")}</p>
          <p>
            {tPage("sections.use.sourcesLabel")}{" "}
            {sourceLinks.map((source, index) => (
              <span key={source.href}>
                {index > 0 ? <span aria-hidden="true"> · </span> : null}
                <a
                  href={source.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 hover:text-neutral-950 dark:hover:text-white"
                >
                  {source.label}
                </a>
              </span>
            ))}
          </p>
          <p>{tPage("sections.use.trademark")}</p>
        </div>
      </ToolSection>

      <ToolFaqSection id="faq" title={tPage("faqTitle")} items={pageFaq} />

      <div id="related" className="scroll-mt-24">
        <ToolRelatedLinks
          title={ui.related}
          links={[
            {
              href: `${prefix}/cycling-training-plan`,
              label: tCommon("cyclingTrainingPlanAction"),
            },
            {
              href: `${prefix}/ironman-70-3-training-plan`,
              label: tCommon("ironman703TrainingPlanAction"),
            },
            {
              href: `${prefix}/swim-training-plan`,
              label: tCommon("swimTrainingPlanAction"),
            },
            {
              href: `${prefix}/css-calculator`,
              label: tCommon("cssCalculatorAction"),
            },
            {
              href: `${prefix}/training-load-calculator`,
              label: tCommon("trainingLoadCalculatorAction"),
            },
            {
              href: `${prefix}/ftp-calculator`,
              label: tCommon("ftpCalculatorAction"),
            },
            {
              href: `${prefix}/power-zones-calculator`,
              label: tCommon("powerZonesCalculatorAction"),
            },
            {
              href: `${prefix}/training-load`,
              label: tCommon("trainingLoadAction"),
            },
            {
              href: `${prefix}/tools`,
              label: tCommon("allToolsAction"),
            },
          ]}
        />
      </div>

      <div className={layout.bleed}>
        <CalculatorPromo
          lang={lang}
          toolId="tss_calculator"
          namespace="toolExperience.load.promo"
        />
      </div>
    </ToolPageMain>
  );
}
