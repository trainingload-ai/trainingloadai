"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { I18nProviderProps } from "fumadocs-ui/i18n";
import { buildLocalePathname, isDocsLocale } from "@/lib/locale-options";
import { persistLocalePreference } from "@/lib/locale-preference";

export function DocsRootProvider({
  children,
  i18n,
}: {
  children: ReactNode;
  i18n: I18nProviderProps;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const changeLocale = (locale: string) => {
    if (!isDocsLocale(locale)) return;

    persistLocalePreference(locale);
    const nextPath = buildLocalePathname(pathname, locale);
    router.push(`${nextPath}${window.location.search}`);
  };

  return (
    <RootProvider
      theme={{
        enabled: true,
        defaultTheme: "light",
        enableSystem: true,
      }}
      i18n={{ ...i18n, onLocaleChange: changeLocale }}
    >
      {children}
    </RootProvider>
  );
}
