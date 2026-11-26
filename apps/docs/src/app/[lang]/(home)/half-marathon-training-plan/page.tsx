import type { Metadata } from "next";
import { DistancePlanExperience } from "@/components/DistancePlanExperience";
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
  const plan = await getRunningPlan("half-marathon-training-plan", lang);
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

export default async function HalfMarathonTrainingPlanPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const plan = await getRunningPlan("half-marathon-training-plan", lang);
  return <DistancePlanExperience lang={lang} plan={plan} />;
}
