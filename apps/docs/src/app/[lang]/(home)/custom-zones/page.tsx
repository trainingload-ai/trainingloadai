import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SlidersHorizontal } from "lucide-react";
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
    namespace: "customZonesPage.metadata",
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
      canonical: `${siteUrl}${prefix}/features/custom-zones`,
      languages: absoluteAlternatesForPath(siteUrl, "/features/custom-zones"),
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${siteUrl}${prefix}/features/custom-zones`,
    },
  };
}

export default async function CustomZonesPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const prefix = localePrefix(lang);
  const siteUrl = getSiteUrl();
  const tCommon = await getTranslations({ locale: lang, namespace: "commonLinks" });
  const t = await getTranslations({ locale: lang, namespace: "customZonesPage" });
  const copy = t.raw("ui") as FeatureIntentPageCopy;
  const blocks = t.raw("blocks") as Array<[string, string]>;
  const faq = t.raw("faq") as Array<[string, string]>;

  return (
    <FeatureIntentPage
      lang={lang}
      prefix={prefix}
      siteUrl={siteUrl}
      pagePath="/features/custom-zones"
      copy={copy}
      blocks={blocks}
      faq={faq}
      homeLabel={tCommon("home")}
      docsHref={`${prefix}/docs/guide/profile-thresholds-zones`}
      toolsHref={`${prefix}/tools`}
      primaryHref={`${prefix}/power-zones-calculator`}
      secondaryHref={`${prefix}/heart-rate-zones-calculator`}
      pageKey="custom-zones"
      icon={<SlidersHorizontal className="size-3.5" />}
    />
  );
}
