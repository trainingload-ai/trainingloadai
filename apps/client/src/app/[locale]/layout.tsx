import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { ReactScan } from "../ReactScan";
import "@/app/globals.css";
import "@fontsource-variable/space-grotesk";
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import QueryProvider from "@/providers/QueryProvider";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import { getMessages } from "next-intl/server";
import { LocalePreferenceSync } from "@/components/locale-preference-sync";
import { DEFAULT_RENDER_TIME_ZONE } from "@/i18n/config";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// The app subdomain contains account, authentication, and user-specific data.
// Keep it accessible to users while preventing search engines from indexing
// duplicate locale shells or private application routes.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  // Ensure that the incoming `locale` is valid
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Providing all messages to the client
  // side is the easiest way to get started
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="">
        {process.env.NODE_ENV !== "production" &&
        process.env.NEXT_PUBLIC_REACT_SCAN === "true" ? (
          <ReactScan />
        ) : null}
        <QueryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            enableColorScheme
            disableTransitionOnChange
          >
            <NextIntlClientProvider
              messages={messages}
              timeZone={DEFAULT_RENDER_TIME_ZONE}
            >
              <LocalePreferenceSync />
              <Suspense fallback={null}>
                <AnalyticsProvider />
              </Suspense>
              {children}
            </NextIntlClientProvider>
            <Toaster position="top-center" />
            <GoogleAnalytics />
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
