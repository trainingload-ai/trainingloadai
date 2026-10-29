import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EndurancePlanHubPage } from "@/components/EndurancePlanHubPage";
import { isSeoIndexedLanguage } from "@/lib/i18n";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import { optimizeSeoText } from "@/lib/seo-metadata";
import {
  normalizeEndurancePlanHub,
  type EndurancePlanHub,
  type EndurancePlanHubLabels,
} from "@/lib/endurance-plan-hubs";

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
    namespace: "endurancePlanHubs.pages",
  });
  const page = normalizeEndurancePlanHub(
    t.raw("swim-training-plan") as EndurancePlanHub,
    "swim-training-plan",
  );
  const seo = optimizeSeoText({
    locale: lang,
    context: "product",
    title: page.metaTitle,
    description: page.metaDescription,
  });
  const indexed = isSeoIndexedLanguage(lang);

  return {
    title: seo.title,
    description: seo.description,
    keywords: page.keywords,
    alternates: {
      canonical: `${siteUrl}${prefix}${page.routePath}`,
      languages: absoluteAlternatesForPath(siteUrl, page.routePath),
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "website",
      url: `${siteUrl}${prefix}${page.routePath}`,
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
    },
    robots: indexed ? undefined : { index: false, follow: true },
  };
}

export default async function SwimTrainingPlanPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations({
    locale: lang,
    namespace: "endurancePlanHubs",
  });
  const page = normalizeEndurancePlanHub(
    t.raw("pages.swim-training-plan") as EndurancePlanHub,
    "swim-training-plan",
  );
  const labels = t.raw("labels") as EndurancePlanHubLabels;
  return <EndurancePlanHubPage lang={lang} page={page} labels={labels} />;
}
