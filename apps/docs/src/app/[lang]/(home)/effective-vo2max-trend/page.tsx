import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Activity } from "lucide-react";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import {
  FeatureIntentPage,
  type FeatureIntentPageCopy,
} from "../_components/feature-intent-page";

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
    namespace: "effectiveVo2maxTrendPage.metadata",
  });
  const keywordsRaw = t.raw("keywords");
  const keywords = Array.isArray(keywordsRaw) ? keywordsRaw : undefined;
  const title = t("title");
  const description = t("description");

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: `${siteUrl}${prefix}/features/effective-vo2max-trend`,
      languages: absoluteAlternatesForPath(siteUrl, "/features/effective-vo2max-trend"),
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${siteUrl}${prefix}/features/effective-vo2max-trend`,
    },
  };
}

export default async function EffectiveVo2maxTrendPage({
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
    namespace: "effectiveVo2maxTrendPage",
  });
  const copy = t.raw("ui") as FeatureIntentPageCopy;
  const blocks = t.raw("blocks") as Array<[string, string]>;
  const faq = t.raw("faq") as Array<[string, string]>;

  return (
    <FeatureIntentPage
      lang={lang}
      prefix={prefix}
      siteUrl={siteUrl}
      pagePath="/features/effective-vo2max-trend"
      copy={copy}
      blocks={blocks}
      faq={faq}
      homeLabel={tCommon("home")}
      docsHref={`${prefix}/docs/guide/effective-vo2max-for-endurance`}
      toolsHref={`${prefix}/tools`}
      primaryHref={`${prefix}/training-analysis`}
      secondaryHref={`${prefix}/training-load`}
      pageKey="effective-vo2max-trend"
      icon={<Activity className="size-3.5" />}
    />
  );
}
