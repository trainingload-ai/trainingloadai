import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import {
  createDistanceTrainingPlan,
  type RunningPlan,
  type RunningPlanPageLabels,
} from "@/lib/running-plan-pages";
import { FiveKPlanExperience } from "./_components/FiveKPlanExperience";

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
    t.raw("5k-training-plan") as RunningPlan,
    lang,
  );
  const path = plan.routePath ?? `/${plan.slug}`;
  const indexed = ["en", "zh", "zh-hant", "ja"].includes(lang);

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

export default async function FiveKTrainingPlanPage({
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
    t.raw("plans.5k-training-plan") as RunningPlan,
    lang,
  );
  const labels = t.raw("labels") as RunningPlanPageLabels;

  return <FiveKPlanExperience lang={lang} plan={plan} labels={labels} />;
}
