import { Suspense, type ReactNode } from "react";

import { CustomHeader } from "@/components/CustomHeader";
import { Footer } from "@/components/Footer";
import { newUserGiftValues } from "@/lib/offer-content";

export async function DocsMarketingShell({
  lang,
  children,
}: {
  lang: string;
  children: ReactNode;
}) {
  const newUserGift = newUserGiftValues(process.env);

  return (
    <>
      <Suspense
        fallback={
          <div className="sticky top-0 z-50 h-16 w-full border-b border-border bg-background/80 backdrop-blur-md" />
        }
      >
        <CustomHeader newUserGift={newUserGift} />
      </Suspense>
      <main className="flex-1">{children}</main>
      <Footer lang={lang} />
    </>
  );
}
