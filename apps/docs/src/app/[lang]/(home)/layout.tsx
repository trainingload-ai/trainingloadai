import type { ReactNode } from "react";

import { DocsMarketingShell } from "@/components/layout/DocsMarketingShell";

export default async function Layout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const { lang } = await params;
  return <DocsMarketingShell lang={lang}>{children}</DocsMarketingShell>;
}
