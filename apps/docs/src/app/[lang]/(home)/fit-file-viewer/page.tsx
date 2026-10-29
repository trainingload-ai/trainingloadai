import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FitFileViewerClient } from "./client";
import type messages from "../../../../../../../packages/messages/docs/en.json";
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
import { isSeoIndexedLanguage } from "@/lib/i18n";
import { optimizeSeoText } from "@/lib/seo-metadata";

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
  const t = await getTranslations({
    locale: lang,
    namespace: "fitFileViewer",
  });
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}${localePrefix(lang)}/fit-file-viewer`;
  const ogImageName =
    lang === "zh"
      ? "fit-file-viewer-zh.png"
      : lang === "zh-hant"
        ? "fit-file-viewer-zh-hant.png"
        : lang === "ja"
          ? "fit-file-viewer-ja.png"
          : "fit-file-viewer.png";
  const ogImageUrl = `${siteUrl}/og/${ogImageName}`;
  const isIndexedLocale = isSeoIndexedLanguage(lang);
  const seo = optimizeSeoText({
    locale: lang,
    context: "converter",
    title: t("metadata.title"),
    description: t("metadata.description"),
  });

  return {
    title: seo.title,
    description: seo.description,
    keywords: t.raw("metadata.keywords") as string[],
    category: "technology",
    alternates: {
      canonical: pageUrl,
      languages: absoluteAlternatesForPath(siteUrl, "/fit-file-viewer"),
    },
    openGraph: {
      type: "website",
      locale: openGraphLocale(lang),
      url: pageUrl,
      siteName: "Trainingload.ai",
      title: seo.title,
      description: seo.description,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: t("metadata.ogImageAlt"),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: [ogImageUrl],
    },
    robots: {
      index: isIndexedLocale,
      follow: true,
      googleBot: {
        index: isIndexedLocale,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

export default async function FitFileViewerPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const [t, tCommon] = await Promise.all([
    getTranslations({ locale: lang, namespace: "fitFileViewer" }),
    getTranslations({ locale: lang, namespace: "commonLinks" }),
  ]);
  const faq = t.raw("page.faq") as typeof messages.fitFileViewer.page.faq;
  const steps = t.raw(
    "page.howTo.steps",
  ) as typeof messages.fitFileViewer.page.howTo.steps;
  const siteUrl = getSiteUrl();
  const prefix = localePrefix(lang);
  const pageUrl = `${siteUrl}${prefix}/fit-file-viewer`;
  const appId = schemaId(pageUrl, "application");
  const faqEntities = faq.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  }));

  const structuredData = schemaGraph([
    webPageSchema({
      id: schemaId(pageUrl, "webpage"),
      url: pageUrl,
      name: t("jsonLd.name"),
      description: t("jsonLd.description"),
      lang,
      mainEntityId: appId,
    }),
    {
      ...webApplicationSchema({
        id: appId,
        url: pageUrl,
        name: t("jsonLd.name"),
        description: t("jsonLd.description"),
        applicationCategory: t("jsonLd.category"),
        featureList: t.raw("jsonLd.features") as string[],
      }),
      browserRequirements: "A current web browser with JavaScript enabled",
      softwareVersion: "1.0",
      inLanguage: schemaLanguage(lang),
      isBasedOn: [
        "https://github.com/garmin/fit-javascript-sdk",
        "https://developer.garmin.com/fit/",
      ],
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    faqPageSchema({
      id: schemaId(pageUrl, "faq"),
      mainEntity: faqEntities,
    }),
    {
      "@type": "HowTo",
      "@id": schemaId(pageUrl, "howto"),
      name: t("page.howTo.title"),
      description: t("metadata.description"),
      inLanguage: schemaLanguage(lang),
      totalTime: "PT2M",
      step: steps.map((step, index) => ({
        "@type": "HowToStep",
        position: index + 1,
        name: step.title,
        text: step.body,
        url: `${pageUrl}#how-to`,
      })),
    },
    breadcrumbSchema({
      id: schemaId(pageUrl, "breadcrumb"),
      items: [
        { name: tCommon("home"), item: `${siteUrl}${prefix}/` },
        { name: tCommon("tools"), item: `${siteUrl}${prefix}/tools` },
        { name: t("page.title"), item: pageUrl },
      ],
    }),
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <FitFileViewerClient lang={lang} />
    </>
  );
}
