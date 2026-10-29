import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { optimizeSeoText } from "@/lib/seo-metadata";
import { BarChart3 } from "lucide-react";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import {
  FeatureIntentPage,
  type FeatureIntentPageCopy,
} from "../_components/feature-intent-page";
import {
  PmcFitnessChartGuide,
  type PmcFitnessChartGuideData,
} from "../_components/pmc-fitness-chart-guide";
import { PmcProductPreview } from "../_components/PmcProductPreview";

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
    namespace: "pmcFitnessChartPage.metadata",
  });
  const keywordsRaw = t.raw("keywords");
  const keywords = Array.isArray(keywordsRaw) ? keywordsRaw : undefined;
  const title = t("title");
  const description = t("description");
  const seo = optimizeSeoText({
    locale: lang,
    context: "docs",
    title,
    description,
  });

  return {
    title: seo.title,
    description: seo.description,
    keywords,
    alternates: {
      canonical: `${siteUrl}${prefix}/features/pmc-fitness-chart`,
      languages: absoluteAlternatesForPath(
        siteUrl,
        "/features/pmc-fitness-chart",
      ),
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "website",
      url: `${siteUrl}${prefix}/features/pmc-fitness-chart`,
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
    },
  };
}

export default async function PmcFitnessChartPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const prefix = localePrefix(lang);
  const siteUrl = getSiteUrl();
  const tCommon = await getTranslations({
    locale: lang,
    namespace: "commonLinks",
  });
  const t = await getTranslations({
    locale: lang,
    namespace: "pmcFitnessChartPage",
  });
  const copy = t.raw("ui") as FeatureIntentPageCopy;
  const answerBlocks = t.raw("answerBlocks") as Array<[string, string]>;
  const sources = t.raw("sources") as string[];
  const blocks = t.raw("blocks") as Array<[string, string]>;
  const faq = t.raw("faq") as Array<[string, string]>;
  const hasDeepGuide = ["en", "zh"].includes(lang);
  const guide = hasDeepGuide
    ? (t.raw("guide") as PmcFitnessChartGuideData)
    : null;
  const appPmcHref = `https://app.trainingload.ai/${lang}/pmc`;

  return (
    <FeatureIntentPage
      lang={lang}
      prefix={prefix}
      siteUrl={siteUrl}
      pagePath="/features/pmc-fitness-chart"
      copy={copy}
      blocks={blocks}
      answerBlocks={answerBlocks}
      sources={sources}
      faq={faq}
      homeLabel={tCommon("home")}
      docsHref={`${prefix}/docs/metrics/pmc/chronic-training-load`}
      toolsHref={`${prefix}/tools`}
      primaryHref={appPmcHref}
      secondaryHref={`${prefix}/ai-training-plan`}
      pageKey="pmc-fitness-chart"
      icon={<BarChart3 aria-hidden="true" className="size-3.5" />}
      variant={guide ? "editorial" : "default"}
      heroAside={
        guide ? (
          <PmcProductPreview
            lang={lang}
            label={guide.ui.previewLabel}
            hint={guide.ui.previewHint}
          />
        ) : undefined
      }
      guideContent={
        guide ? (
          <PmcFitnessChartGuide prefix={prefix} data={guide} />
        ) : undefined
      }
    />
  );
}
