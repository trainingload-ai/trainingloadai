"use client";

import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "next-themes";

import "@/app/globals.css";
import { ClientNotFoundView } from "@/components/ClientAppErrorView";
import QueryProvider from "@/providers/QueryProvider";
import { DEFAULT_RENDER_TIME_ZONE } from "@/i18n/config";
import enMessages from "../../../../packages/messages/client-core/en.json";

export default function RootNotFound() {
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
              <ClientNotFoundView />
            </NextIntlClientProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
