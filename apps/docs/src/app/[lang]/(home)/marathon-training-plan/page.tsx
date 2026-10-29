import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DistancePlanExperience } from "@/components/DistancePlanExperience";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import { optimizeSeoText } from "@/lib/seo-metadata";
import {
  createDistanceTrainingPlan,
  type RunningPlan,
  type RunningPlanPageLabels,
} from "@/lib/running-plan-pages";

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
    namespace: "runningPlanPages.plans",
  });
  const plan = createDistanceTrainingPlan(
    t.raw("marathon-training-plan") as RunningPlan,
    lang,
  );
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
      canonical: `${siteUrl}${prefix}/${plan.slug}`,
      languages: absoluteAlternatesForPath(siteUrl, `/${plan.slug}`),
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "website",
      url: `${siteUrl}${prefix}/${plan.slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
    },
  };
}

export default async function MarathonTrainingPlanPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations({
    locale: lang,
    namespace: "runningPlanPages",
  });
  const plan = createDistanceTrainingPlan(
    t.raw("plans.marathon-training-plan") as RunningPlan,
    lang,
  );
  const labels = t.raw("labels") as RunningPlanPageLabels;
  return <DistancePlanExperience lang={lang} plan={plan} labels={labels} />;
}
