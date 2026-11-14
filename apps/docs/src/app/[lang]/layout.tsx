import "@/app/global.css";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jost";
import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import type { Translations } from "fumadocs-ui/i18n";
import { isSeoIndexedLanguage } from "@/lib/i18n";
import { LOCALE_OPTIONS } from "@/lib/locale-options";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { GoogleAnalytics } from "@next/third-parties/google";
import { resolveGa4MeasurementId } from "@shared/product-analytics";
import { openGraphLocale } from "@/lib/seo-schema";
import {
  absoluteAlternatesForPath,
  absoluteLocalizedUrl,
} from "@/lib/locale-url";
import { LocalePreferenceSync } from "@/components/LocalePreferenceSync";
import { LocaleSuggestion } from "@/components/LocaleSuggestion";
import { DocsRootProvider } from "@/components/DocsRootProvider";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
import { homeOpenGraphImage, homeTwitterImage } from "@/lib/social-metadata";
import { isDocsTelemetryEnabled } from "@/lib/telemetry-config.mjs";
import { selectClientMessages } from "@/lib/client-messages";
import { docsFontVariables } from "@/lib/docs-fonts";

/**
 * SEO 核心策略：
 * - Title：给「人」看的（不吓人）
 * - Description：给「搜索引擎」看的（保留 endurance 语义）
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const lang = (await params).lang;
  const t = await getTranslations({ locale: lang, namespace: "metadata" });
  const title = t("title");
  const description = t("description");
  const keywords = (t.raw("keywords") as string[] | undefined) ?? [];
  const rawSiteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const siteUrl = rawSiteUrl.replace(/\/+$/, "");
  const isIndexedLocale = isSeoIndexedLanguage(lang);

  return {
    title: {
      default: title,
      template: "%s",
    },
    description,
    keywords,
    authors: [{ name: "Trainingload.ai Team" }],
    creator: "Trainingload.ai",
    publisher: "Trainingload.ai",
    metadataBase: new URL(siteUrl),
    alternates: {
      languages: absoluteAlternatesForPath(siteUrl, "/"),
    },
    openGraph: {
      type: "website",
      locale: openGraphLocale(lang),
      siteName: "Trainingload.ai",
      title,
      description,
      url: absoluteLocalizedUrl(siteUrl, lang, "/"),
      images: [homeOpenGraphImage()],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [homeTwitterImage()],
    },
    robots: {
      index: isIndexedLocale,
      follow: true,
      googleBot: {
        index: isIndexedLocale,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    verification: {
      google: "",
      yandex: "",
      yahoo: "",
    },
  };
}

// import { BetaBanner } from "@/components/BetaBanner";

export default async function Layout({
  params,
  children,
}: {
  params: Promise<{ lang?: string }>;
  children: ReactNode;
}) {
  const lang = (await params).lang || "en";
  const messages = await getMessages({ locale: lang });
  const isProd = process.env.NODE_ENV === "production";
  const telemetryEnabled = isDocsTelemetryEnabled();
  const gaId = resolveGa4MeasurementId(
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
  );

  return (
    <html lang={lang} className={docsFontVariables} suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="flex min-h-screen flex-col font-sans"
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-[100] focus:rounded-control focus:bg-background focus:px-4 focus:py-2 focus:font-medium focus:text-foreground focus:outline-2 focus:outline-ring"
        >
          {(messages.accessibility as { skipToContent: string }).skipToContent}
        </a>
        <NextIntlClientProvider
          locale={lang}
          messages={selectClientMessages(messages)}
        >
          <Suspense fallback={null}>
            <AnalyticsProvider locale={lang} />
          </Suspense>
          <LocalePreferenceSync />
          <DocsRootProvider
            i18n={{
              locale: lang,
              translations: messages.docsUi as unknown as Translations,
              locales: LOCALE_OPTIONS.map((option) => ({
                locale: option.key,
                name: option.label,
              })),
            }}
          >
            {/* <BetaBanner /> */}
            {children}
            <LocaleSuggestion />
          </DocsRootProvider>
        </NextIntlClientProvider>
        {isProd && telemetryEnabled && gaId ? (
          <GoogleAnalytics gaId={gaId} />
        ) : null}
      </body>
    </html>
  );
}
