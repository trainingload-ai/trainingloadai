import { Suspense, type ReactNode } from "react";
import { CustomHeader } from "@/components/CustomHeader";
import { Footer } from "@/components/Footer";
import { newUserGiftValues } from "@/lib/offer-content";

export default async function BlogLayout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const { lang } = await params;
  return (
    <>
      <Suspense
        fallback={
          <div className="sticky top-0 z-50 w-full h-16 border-b border-neutral-300 dark:border-border bg-background/80 backdrop-blur-md" />
        }
      >
        <CustomHeader newUserGift={newUserGiftValues(process.env)} />
      </Suspense>
      <main className="flex-1 min-h-screen">{children}</main>
      <Footer lang={lang} />
    </>
  );
}
