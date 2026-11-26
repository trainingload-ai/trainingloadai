import type { Metadata } from "next";
import { DistancePlanExperience } from "@/components/DistancePlanExperience";
import { isSeoIndexedLanguage } from "@/lib/i18n";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import { optimizeSeoText } from "@/lib/seo-metadata";
import { getRunningPlan } from "@/lib/running-plan-pages";

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
  const plan = await getRunningPlan("couch-to-5k-training-plan", lang);
  const path = `/${plan.slug}`;
  const seo = optimizeSeoText({
    locale: lang,
    context: "plan",
    title: plan.metaTitle,
    description: plan.metaDescription,
  });

  return {
    title: seo.title,
    description: seo.description,
    keywords: plan.keywords,
    alternates: {
      canonical: `${siteUrl}${prefix}${path}`,
      languages: absoluteAlternatesForPath(siteUrl, path),
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "website",
      url: `${siteUrl}${prefix}${path}`,
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
    },
    robots: isSeoIndexedLanguage(lang)
      ? undefined
      : { index: false, follow: true },
  };
}

export default async function CouchTo5KTrainingPlanPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const plan = await getRunningPlan("couch-to-5k-training-plan", lang);
  return <DistancePlanExperience lang={lang} plan={plan} />;
}
