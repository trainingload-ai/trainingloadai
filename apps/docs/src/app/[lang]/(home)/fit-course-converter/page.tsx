import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { optimizeSeoText } from "@/lib/seo-metadata";
import { FitCourseConverterClient } from "./client.tsx";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import {
  breadcrumbSchema,
  faqPageSchema,
  normalizeFeatureList,
  normalizeSchemaFaqItems,
  schemaGraph,
  schemaId,
  webApplicationSchema,
  webPageSchema,
} from "@/lib/seo-schema";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const prefix = localePrefix(lang);
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const pageUrl = `${siteUrl}${prefix}/fit-course-converter`;
  const ogImageUrl = `${siteUrl}/og/fit-course-converter.png`;
  const t = await getTranslations({
    locale: lang,
    namespace: "fitCourseConverter.metadata",
  });
  const keywordsRaw = t.raw("keywords");
  const keywords = Array.isArray(keywordsRaw) ? keywordsRaw : undefined;
  const seo = optimizeSeoText({
    locale: lang,
    context: "converter",
    title: t("title"),
    description: t("description"),
  });

  return {
    title: seo.title,
    description: seo.description,
    keywords,
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "website",
      url: pageUrl,
      images: [{ url: ogImageUrl }],
    },
    alternates: {
      canonical: pageUrl,
      languages: absoluteAlternatesForPath(siteUrl, "/fit-course-converter"),
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: [ogImageUrl],
    },
  };
}

export default async function FitCourseConverterPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const prefix = localePrefix(lang);
  const t = await getTranslations({
    locale: lang,
    namespace: "fitCourseConverter.jsonLd",
  });
  const tCommon = await getTranslations({
    locale: lang,
    namespace: "commonLinks",
  });
  const tPage = await getTranslations({
    locale: lang,
    namespace: "fitCourseConverter.page",
  });

  const pageUrl = `${siteUrl}${prefix}/fit-course-converter`;
  const appId = schemaId(pageUrl, "app");
  const jsonLd = schemaGraph([
    webPageSchema({
      id: schemaId(pageUrl, "webpage"),
      url: pageUrl,
      name: t("name"),
      description: t("description"),
      lang,
      mainEntityId: appId,
    }),
    webApplicationSchema({
      id: appId,
      url: pageUrl,
      name: t("name"),
      description: t("description"),
      applicationCategory: t("applicationCategory"),
      featureList: normalizeFeatureList(t.raw("featureList")),
    }),
    faqPageSchema({
      id: schemaId(pageUrl, "faq"),
      mainEntity: normalizeSchemaFaqItems(t.raw("faq")),
    }),
    breadcrumbSchema({
      id: schemaId(pageUrl, "breadcrumb"),
      items: [
        {
          name: tCommon("home"),
          item: `${siteUrl}${prefix}/`,
        },
        {
          name: tCommon("tools"),
          item: `${siteUrl}${prefix}/tools`,
        },
        {
          name: tPage("title"),
          item: pageUrl,
        },
      ],
    }),
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <FitCourseConverterClient lang={lang} />
    </>
  );
}
