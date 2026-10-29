"use client";

import { useEffect } from "react";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "next-themes";

import "@/app/globals.css";
import { ClientErrorView } from "@/components/ClientAppErrorView";
import enMessages from "../../../../../packages/messages/client-core/en.json";
import QueryProvider from "@/providers/QueryProvider";
import { DEFAULT_RENDER_TIME_ZONE } from "@/i18n/config";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <QueryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            enableColorScheme
            disableTransitionOnChange
          >
            <NextIntlClientProvider
              locale="en"
              messages={enMessages}
              timeZone={DEFAULT_RENDER_TIME_ZONE}
            >
              <ClientErrorView error={error} reset={reset} />
            </NextIntlClientProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
