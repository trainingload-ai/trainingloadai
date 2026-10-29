import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { optimizeSeoText } from "@/lib/seo-metadata";
import { JsonLd } from "@/components/JsonLd";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import { PricingPlansSection } from "@/components/PricingPlansSection";
import { PricingFeatureCompare } from "./pricing-feature-compare";
import { getPricingCreditLabels } from "@/lib/ai-plan-pricing";
import {
  formatNewUserGiftCredits,
  newUserGiftValues,
} from "@/lib/offer-content";
import {
  breadcrumbSchema,
  schemaGraph,
  schemaId,
  schemaLanguage,
} from "@/lib/seo-schema";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const t = await getTranslations({
    locale: lang,
    namespace: "pricingPage.metadata",
  });
  const gift = newUserGiftValues(process.env);
  const giftValues = {
    days: gift.accessDays,
    credits: formatNewUserGiftCredits(gift.bonusCredits, lang),
  };
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const prefix = localePrefix(lang);
  const seo = optimizeSeoText({
    locale: lang,
    context: "product",
    title: t("title"),
    description: t("description", giftValues),
  });

  return {
    title: seo.title,
    description: seo.description,
    alternates: {
      canonical: `${siteUrl}${prefix}/pricing`,
      languages: absoluteAlternatesForPath(siteUrl, "/pricing"),
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "website",
      url: `${siteUrl}${prefix}/pricing`,
      images: [{ url: `${siteUrl}/og/home.jpg?v=20260912` }],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: [`${siteUrl}/og/home.jpg?v=20260912`],
    },
  };
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: "pricingPage" });
  const tCommon = await getTranslations({
    locale: lang,
    namespace: "commonLinks",
  });
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const prefix = localePrefix(lang);
  const pageUrl = `${siteUrl}${prefix}/pricing`;
  const appUrl = `https://app.trainingload.ai/${lang}`;
  const creditLabels = getPricingCreditLabels(lang);
  const gift = newUserGiftValues(process.env);
  const newUserGift = {
    days: gift.accessDays,
    credits: formatNewUserGiftCredits(gift.bonusCredits, lang),
  };
  const planNames = {
    free: t("plans.free.name"),
    plus: t("plans.plus.name"),
    pro: t("plans.pro.name"),
  };
  const planDescriptions = {
    free: t("plans.free.desc", newUserGift),
    plus: t("plans.plus.desc", { credits: creditLabels.plus }),
    pro: t("plans.pro.desc", { credits: creditLabels.pro }),
  };
  const appId = schemaId(siteUrl, "app");
  const pricingPageId = schemaId(pageUrl, "webpage");
  const structuredData = schemaGraph([
    {
      "@type": "WebPage",
      "@id": pricingPageId,
      url: pageUrl,
      name: t("title"),
      description: t("subtitle", newUserGift),
      inLanguage: schemaLanguage(lang),
      mainEntity: { "@id": appId },
    },
    {
      "@type": "SoftwareApplication",
      "@id": appId,
      name: "Trainingload.ai",
      url: "https://app.trainingload.ai/en",
      applicationCategory: "HealthApplication",
      operatingSystem: "Web",
      description:
        "Training load management and endurance training analysis for runners, cyclists, triathletes, self-coached athletes, and coaches.",
      isAccessibleForFree: true,
      offers: [
        {
          "@type": "Offer",
          name: planNames.free,
          description: planDescriptions.free,
          price: "0",
          priceCurrency: "USD",
          url: pageUrl,
          availability: "https://schema.org/InStock",
        },
        {
          "@type": "Offer",
          name: "Trainingload.ai 5,000 AI Credits",
          description:
            "AI credits for active Trainingload.ai PLUS or PRO members. Valid for 12 months. Does not extend membership.",
          price: "6.99",
          priceCurrency: "USD",
          url: pageUrl,
          availability: "https://schema.org/InStock",
        },
        {
          "@type": "Offer",
          name: "Trainingload.ai 15,000 AI Credits",
          description:
            "AI credits for active Trainingload.ai PLUS or PRO members. Valid for 12 months. Does not extend membership.",
          price: "17.99",
          priceCurrency: "USD",
          url: pageUrl,
          availability: "https://schema.org/InStock",
        },
        {
          "@type": "Offer",
          name: "Trainingload.ai 40,000 AI Credits",
          description:
            "AI credits for active Trainingload.ai PLUS or PRO members. Valid for 12 months. Does not extend membership.",
          price: "39.99",
          priceCurrency: "USD",
          url: pageUrl,
          availability: "https://schema.org/InStock",
        },
        {
          "@type": "Offer",
          name: `${planNames.plus} monthly`,
          description: planDescriptions.plus,
          price: "4.90",
          priceCurrency: "USD",
          url: pageUrl,
          availability: "https://schema.org/InStock",
        },
        {
          "@type": "Offer",
          name: `${planNames.plus} yearly`,
          description: planDescriptions.plus,
          price: "41",
          priceCurrency: "USD",
          url: pageUrl,
          availability: "https://schema.org/InStock",
        },
        {
          "@type": "Offer",
          name: `${planNames.pro} monthly`,
          description: planDescriptions.pro,
          price: "9.90",
          priceCurrency: "USD",
          url: pageUrl,
          availability: "https://schema.org/InStock",
        },
        {
          "@type": "Offer",
          name: `${planNames.pro} yearly`,
          description: planDescriptions.pro,
          price: "83",
          priceCurrency: "USD",
          url: pageUrl,
          availability: "https://schema.org/InStock",
        },
      ],
      featureList: [
        "Training calendar",
        "Training plans",
        "Training load charts",
        "PMC / CTL-ATL-TSB",
        "Activity analysis",
        "Thresholds and zones",
        "AI coach review",
        "AI dynamic plan adjustments",
      ],
    },
    breadcrumbSchema({
      id: schemaId(pageUrl, "breadcrumb"),
      items: [
        { name: tCommon("home"), item: `${siteUrl}${prefix}/` },
        { name: tCommon("pricing"), item: pageUrl },
      ],
    }),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <JsonLd id="pricing-structured-data" data={structuredData} />

      <section className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">
          {t("eyebrow")}
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">
          {t("title")}
        </h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground md:text-base">
          {t("subtitle", newUserGift)}
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
          {t("trialNote")}
        </p>
      </section>

      <PricingPlansSection
        appUrl={appUrl}
        creditLabels={creditLabels}
        newUserGift={newUserGift}
      />

      <PricingFeatureCompare
        creditLabels={creditLabels}
        newUserGift={newUserGift}
      />
    </main>
  );
}
