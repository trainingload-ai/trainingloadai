import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FiveKPlanExperience } from "../5k-training-plan/_components/FiveKPlanExperience";
import { isSeoIndexedLanguage } from "@/lib/i18n";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import { optimizeSeoText } from "@/lib/seo-metadata";
import {
  createCouchTo5kPlan,
  type RunningPlan,
  type RunningPlanPageLabels,
} from "@/lib/running-plan-pages";

function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  return raw.replace(/\/+$/, "");
}

async function getPlan(lang: string) {
  const t = await getTranslations({
    locale: lang,
    namespace: "runningPlanPages.plans",
  });
  return createCouchTo5kPlan(
    t.raw("couch-to-5k-training-plan") as RunningPlan,
    lang,
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const prefix = localePrefix(lang);
  const siteUrl = getSiteUrl();
  const plan = await getPlan(lang);
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
  const [plan, t] = await Promise.all([
    getPlan(lang),
    getTranslations({ locale: lang, namespace: "runningPlanPages" }),
  ]);
  const labels = t.raw("labels") as RunningPlanPageLabels;
  return <FiveKPlanExperience lang={lang} plan={plan} labels={labels} />;
}
