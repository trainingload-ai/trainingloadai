import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import {
  createIntermediateFiveKPlan,
  type RunningPlan,
  type RunningPlanPageLabels,
} from "@/lib/running-plan-pages";
import { FiveKPlanExperience } from "../_components/FiveKPlanExperience";

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai"
  ).replace(/\/+$/, "");
}

async function getPlan(lang: string) {
  const t = await getTranslations({
    locale: lang,
    namespace: "runningPlanPages.plans",
  });
  return createIntermediateFiveKPlan(
    t.raw("5k-training-plan") as RunningPlan,
    lang,
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const plan = await getPlan(lang);
  const path = plan.routePath ?? "/5k-training-plan/intermediate";
  const prefix = localePrefix(lang);
  const siteUrl = getSiteUrl();
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

export default async function IntermediateFiveKTrainingPlanPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const [plan, t] = await Promise.all([
    getPlan(lang),
    getTranslations({ locale: lang, namespace: "runningPlanPages" }),
  ]);
  return (
    <FiveKPlanExperience
      lang={lang}
      plan={plan}
      labels={t.raw("labels") as RunningPlanPageLabels}
    />
  );
}
