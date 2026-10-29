import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ConverterDirectionClient } from "@/components/ConverterDirectionClient";
import {
  buildConverterDirection,
  type ConverterDirection,
  type ConverterDirectionCopy,
} from "@/lib/converter-directions";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import {
  breadcrumbSchema,
  faqPageSchema,
  howToSchema,
  normalizeSchemaFaqItems,
  schemaGraph,
  schemaId,
  webApplicationSchema,
  webPageSchema,
} from "@/lib/seo-schema";
import { optimizeSeoText } from "@/lib/seo-metadata";

function getSiteUrl() {
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  return rawSiteUrl.replace(/\/+$/, "");
}

export async function generateConverterDirectionMetadata(
  {
    params,
  }: {
    params: Promise<{ lang: string }>;
  },
  slug: string,
): Promise<Metadata> {
  const { lang } = await params;
  const t = await getTranslations({
    locale: lang,
    namespace: "converterDirections",
  });
  const direction = buildConverterDirection(
    slug,
    t.raw("copy") as ConverterDirectionCopy,
  );
  if (!direction) return {};

  const prefix = localePrefix(lang);
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}${prefix}/${direction.slug}`;
  const ogImageUrl = `${siteUrl}/og/converter.png`;
  const seo = optimizeSeoText({
    locale: lang,
    context: "converter",
    title: direction.metadataTitle,
    description: direction.metadataDescription,
  });

  return {
    title: seo.title,
    description: seo.description,
    keywords: direction.keywords,
    alternates: {
      canonical: pageUrl,
      languages: absoluteAlternatesForPath(siteUrl, `/${direction.slug}`),
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "website",
      url: pageUrl,
      images: [{ url: ogImageUrl }],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: [ogImageUrl],
    },
  };
}

export async function ConverterDirectionPage({
  params,
  slug,
}: {
  params: Promise<{ lang: string }>;
  slug: string;
}) {
  const { lang } = await params;
  const t = await getTranslations({
    locale: lang,
    namespace: "converterDirections",
  });
  const directionCopy = t.raw("copy") as ConverterDirectionCopy;
  const direction = buildConverterDirection(slug, directionCopy);
  if (!direction) notFound();

  const prefix = localePrefix(lang);
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}${prefix}/${direction.slug}`;
  const appId = schemaId(pageUrl, "app");
  const relatedDirections = direction.related
    .map((relatedSlug) => buildConverterDirection(relatedSlug, directionCopy))
    .filter((item): item is ConverterDirection => Boolean(item));

  const jsonLd = schemaGraph([
    webPageSchema({
      id: schemaId(pageUrl, "webpage"),
      url: pageUrl,
      name: direction.title,
      description: direction.metadataDescription,
      lang,
      mainEntityId: appId,
    }),
    webApplicationSchema({
      id: appId,
      url: pageUrl,
      name: direction.title,
      description: direction.metadataDescription,
      applicationCategory: "UtilitiesApplication",
      featureList: [
        direction.ui.uploadAria,
        direction.title,
        direction.ui.convertTo,
      ],
    }),
    howToSchema({
      id: schemaId(pageUrl, "howto"),
      name: direction.ui.howToTitle,
      description: direction.subtitle,
      steps: direction.howTo.map((text) => ({ name: text, text })),
    }),
    faqPageSchema({
      id: schemaId(pageUrl, "faq"),
      mainEntity: normalizeSchemaFaqItems(direction.faq),
    }),
    breadcrumbSchema({
      id: schemaId(pageUrl, "breadcrumb"),
      items: [
        {
          name: direction.ui.tools,
          item: `${siteUrl}${prefix}/tools`,
        },
        {
          name: direction.ui.gpxConverter,
          item: `${siteUrl}${prefix}/converter`,
        },
        {
          name: direction.label,
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
      <ConverterDirectionClient
        direction={direction}
        relatedDirections={relatedDirections}
        lang={lang}
      />
    </>
  );
}
