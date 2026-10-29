import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { isSeoIndexedLanguage } from "@/lib/i18n";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import {
  breadcrumbSchema,
  faqPageSchema,
  openGraphLocale,
  schemaGraph,
  schemaId,
  schemaLanguage,
  webApplicationSchema,
  webPageSchema,
} from "@/lib/seo-schema";
import { PublicReviewClient } from "./client";
import {
  formatNewUserGiftCredits,
  newUserGiftValues,
} from "@/lib/offer-content";

function siteUrl() {
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
  const t = await getTranslations({
    locale: lang,
    namespace: "freeAiWorkoutReview",
  });
  const url = `${siteUrl()}${localePrefix(lang)}/free-ai-workout-review`;
  const index = isSeoIndexedLanguage(lang);
  const keywords = t.raw("metadata.keywords");
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    keywords: Array.isArray(keywords) ? keywords : undefined,
    alternates: {
      canonical: url,
      languages: absoluteAlternatesForPath(
        siteUrl(),
        "/free-ai-workout-review",
      ),
    },
    openGraph: {
      type: "website",
      locale: openGraphLocale(lang),
      url,
      siteName: "Trainingload.ai",
      title: t("metadata.title"),
      description: t("metadata.description"),
    },
    twitter: {
      card: "summary_large_image",
      title: t("metadata.title"),
      description: t("metadata.description"),
    },
    robots: { index, follow: true },
  };
}

export default async function FreeAiWorkoutReviewPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const [t, tCommon] = await Promise.all([
    getTranslations({ locale: lang, namespace: "freeAiWorkoutReview" }),
    getTranslations({ locale: lang, namespace: "commonLinks" }),
  ]);
  const base = siteUrl();
  const prefix = localePrefix(lang);
  const pageUrl = `${base}${prefix}/free-ai-workout-review`;
  const applicationId = schemaId(pageUrl, "application");
  const faq = t.raw("faq") as Array<{ question: string; answer: string }>;
  const howTo = t.raw("howTo") as {
    title: string;
    steps: Array<{ title: string; body: string }>;
  };
  const gift = newUserGiftValues(process.env);
  const structuredData = schemaGraph([
    webPageSchema({
      id: schemaId(pageUrl, "webpage"),
      url: pageUrl,
      name: t("metadata.title"),
      description: t("metadata.description"),
      lang,
      mainEntityId: applicationId,
    }),
    {
      ...webApplicationSchema({
        id: applicationId,
        url: pageUrl,
        name: t("metadata.title"),
        description: t("metadata.description"),
        applicationCategory: "HealthApplication",
        featureList: [
          "FIT, GPX and TCX workout analysis",
          "Structured AI workout review",
          "Origin-free 3D route visualization",
        ],
      }),
      inLanguage: schemaLanguage(lang),
      browserRequirements:
        "A current web browser with JavaScript and WebGL enabled; the review works without WebGL.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    faqPageSchema({
      id: schemaId(pageUrl, "faq"),
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    }),
    {
      "@type": "HowTo",
      "@id": schemaId(pageUrl, "howto"),
      name: howTo.title,
      inLanguage: schemaLanguage(lang),
      totalTime: "PT3M",
      step: howTo.steps.map((item, index) => ({
        "@type": "HowToStep",
        position: index + 1,
        name: item.title,
        text: item.body,
        url: `${pageUrl}#review`,
      })),
    },
    breadcrumbSchema({
      id: schemaId(pageUrl, "breadcrumb"),
      items: [
        { name: tCommon("home"), item: `${base}${prefix}/` },
        { name: tCommon("tools"), item: `${base}${prefix}/tools` },
        { name: t("title"), item: pageUrl },
      ],
    }),
  ]);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <PublicReviewClient
        lang={lang}
        newUserGift={{
          days: gift.accessDays,
          credits: formatNewUserGiftCredits(gift.bonusCredits, lang),
        }}
      />
    </>
  );
}
