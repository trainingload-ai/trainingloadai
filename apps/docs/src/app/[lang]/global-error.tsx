"use client";

import * as Sentry from "@sentry/nextjs";
import { RootProvider } from "fumadocs-ui/provider/next";
import { NextIntlClientProvider } from "next-intl";
import { Suspense, useEffect } from "react";

import "@/app/global.css";
import { CustomHeader } from "@/components/CustomHeader";
import { SiteErrorState } from "@/components/site-error-state";
import enMessages from "../../../../../packages/messages/docs/en.json";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col font-sans">
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <RootProvider
            theme={{
              enabled: true,
              defaultTheme: "light",
              enableSystem: true,
            }}
          >
            <Suspense
              fallback={
                <div className="sticky top-0 z-50 h-16 w-full border-b border-border bg-background/90 backdrop-blur-md" />
              }
            >
              <CustomHeader />
            </Suspense>
            <main className="flex-1">
              <SiteErrorState
                kind="server-error"
                digest={error.digest}
                onRetry={reset}
              />
            </main>
          </RootProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
