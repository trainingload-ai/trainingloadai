import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { selectClientMessages } from "@/lib/client-messages";

export async function ClientMessages({
  locale,
  namespaces,
  children,
}: {
  locale: string;
  namespaces: readonly string[];
  children: ReactNode;
}) {
  const messages = await getMessages({ locale });

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={selectClientMessages(messages, namespaces)}
    >
      {children}
    </NextIntlClientProvider>
  );
}

export function createClientMessagesLayout(namespaces: readonly string[]) {
  return async function ClientMessagesLayout({
    params,
    children,
  }: {
    params: Promise<{ lang: string }>;
    children: ReactNode;
  }) {
    const { lang } = await params;
    return (
      <ClientMessages locale={lang} namespaces={namespaces}>
        {children}
      </ClientMessages>
    );
  };
}
