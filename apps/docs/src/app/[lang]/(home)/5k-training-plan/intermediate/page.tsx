import type { Metadata } from "next";
import { isSeoIndexedLanguage } from "@/lib/i18n";

import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import { getRunningPlan } from "@/lib/running-plan-pages";
import { DistancePlanExperience } from "@/components/DistancePlanExperience";

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
  const plan = await getRunningPlan("5k-training-plan-intermediate", lang);
  const path = plan.routePath ?? "/5k-training-plan/intermediate";
  const prefix = localePrefix(lang);
  const siteUrl = getSiteUrl();
  const indexed = isSeoIndexedLanguage(lang);
  return {
    title: plan.metaTitle,
    description: plan.metaDescription,
    keywords: plan.keywords,
    alternates: {
      canonical: `${siteUrl}${prefix}${path}`,
      languages: absoluteAlternatesForPath(siteUrl, path),
    },
    openGraph: {
      title: plan.metaTitle,
      description: plan.metaDescription,
      type: "website",
      url: `${siteUrl}${prefix}${path}`,
    },
    twitter: {
      card: "summary_large_image",
      title: plan.metaTitle,
      description: plan.metaDescription,
    },
    robots: indexed ? undefined : { index: false, follow: true },
  };
}

export default async function IntermediateFiveKTrainingPlanPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const plan = await getRunningPlan("5k-training-plan-intermediate", lang);
  return <DistancePlanExperience lang={lang} plan={plan} />;
}
