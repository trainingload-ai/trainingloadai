"use client";

import dynamic from "next/dynamic";
import { MonitorUp } from "lucide-react";

import { ProductBrowserWindow } from "@/components/ProductBrowserChrome";
import { publicDemoDestination } from "@/lib/public-demo-url";
import { HomeDemoLightbox } from "./HomeDemoLightbox";

const PmcDemoApp = dynamic(
  () =>
    import("./metric-demo/pmc/pmc-demo-app").then(
      (module) => module.PmcDemoApp,
    ),
  {
    loading: () => (
      <div className="h-[620px] animate-pulse rounded-surface bg-neutral-100 dark:bg-white/[0.04]" />
    ),
  },
);

export function PmcProductPreview({
  lang,
  label,
  hint,
}: {
  lang: string;
  label: string;
  hint: string;
}) {
  const destination = publicDemoDestination(lang, "/pmc");

  return (
    <ProductBrowserWindow
      address={destination.address}
      addressHref={destination.href}
      addressAriaLabel={`${label}: ${destination.address}`}
      className="h-[560px] rounded-feature bg-neutral-100 shadow-2xl shadow-neutral-950/15 dark:bg-neutral-900"
      contentClassName="relative bg-background"
    >
      <HomeDemoLightbox
        label={label}
        className="h-full rounded-none"
        dialogClassName="md:h-[min(900px,calc(100dvh-40px))] md:w-[min(1240px,calc(100vw-40px))]"
        expanded={
          <div className="client-demo-radius min-h-full bg-background px-1 pb-4 pt-2 text-foreground md:p-5">
            <PmcDemoApp lang={lang} />
          </div>
        }
      >
        <div className="relative h-full overflow-hidden bg-background">
          <div
            className="pointer-events-none absolute left-6 top-5 h-[760px] w-[1120px] origin-top-left bg-background text-foreground"
            style={{ transform: "scale(0.82)" }}
          >
            <PmcDemoApp lang={lang} />
          </div>
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-background via-background/75 to-transparent"
          />

          <div className="pointer-events-none absolute bottom-4 left-4 z-10 inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/90 px-3 py-2 text-xs font-semibold text-neutral-700 shadow-lg backdrop-blur dark:border-white/10 dark:bg-neutral-950/90 dark:text-neutral-200">
            <MonitorUp
              aria-hidden="true"
              className="size-3.5 text-emerald-500"
            />
            {hint}
          </div>
        </div>
      </HomeDemoLightbox>
    </ProductBrowserWindow>
  );
}
