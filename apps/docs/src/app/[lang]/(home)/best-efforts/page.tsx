import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Flame } from "lucide-react";
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
    namespace: "bestEffortsPage.metadata",
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
      canonical: `${siteUrl}${prefix}/features/best-efforts`,
      languages: absoluteAlternatesForPath(siteUrl, "/features/best-efforts"),
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${siteUrl}${prefix}/features/best-efforts`,
    },
  };
}

export default async function BestEffortsPage({
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
  const t = await getTranslations({ locale: lang, namespace: "bestEffortsPage" });
  const copy = t.raw("ui") as FeatureIntentPageCopy;
  const blocks = t.raw("blocks") as Array<[string, string]>;
  const faq = t.raw("faq") as Array<[string, string]>;

  return (
    <FeatureIntentPage
      lang={lang}
      prefix={prefix}
      siteUrl={siteUrl}
      pagePath="/features/best-efforts"
      copy={copy}
      blocks={blocks}
      faq={faq}
      homeLabel={tCommon("home")}
      docsHref={`${prefix}/docs/metrics/power/power-duration-curve`}
      toolsHref={`${prefix}/tools`}
      primaryHref={`${prefix}/power-curve`}
      secondaryHref={`${prefix}/training-analysis`}
      pageKey="best-efforts"
      icon={<Flame className="size-3.5" />}
    />
  );
}
