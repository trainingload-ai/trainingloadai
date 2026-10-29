"use client";

import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { buildToolAppUrl } from "@shared/product-analytics";
import { trackToolEvent, type ToolId } from "@/lib/tool-analytics";

export function ToolAppCta(props: {
  lang: string;
  toolId: ToolId;
  tone?: "marketing" | "product";
}) {
  const t = useTranslations("tools.appCta");
  const href = buildToolAppUrl({
    locale: props.lang,
    toolId: props.toolId,
    ctaPlacement: "tool_footer",
    destination: "app_home",
  });

  useEffect(() => {
    trackToolEvent("tool_viewed", props.toolId, { lang: props.lang });
  }, [props.lang, props.toolId]);

  if (props.tone === "product") {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-compact bg-neutral-100 px-3 py-3 dark:bg-muted/45">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            trackToolEvent("tool_app_cta_clicked", props.toolId, {
              cta_placement: "tool_footer",
              destination: "app_home",
              lang: props.lang,
            })
          }
          className="inline-flex h-8 items-center justify-center rounded-compact bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
        >
          {t("button")}
          <ArrowRight className="ml-1.5 size-4" />
        </a>
      </section>
    );
  }

  return (
    <section className="grid gap-5 rounded-compact border border-emerald-500/25 bg-emerald-500/90 p-6 text-white shadow-2xl shadow-emerald-500/20 dark:border-emerald-400/20 dark:bg-emerald-500/95 dark:text-neutral-950 md:grid-cols-[1fr_auto] md:items-center">
      <div className="space-y-2">
        <h2 className="text-2xl font-black tracking-tight">{t("title")}</h2>
        <p className="text-sm leading-relaxed text-white/85 dark:text-neutral-950/75">
          {t("subtitle")}
        </p>
      </div>
      <div>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            trackToolEvent("tool_app_cta_clicked", props.toolId, {
              cta_placement: "tool_footer",
              destination: "app_home",
              lang: props.lang,
            })
          }
          className="inline-flex h-11 items-center justify-center rounded-compact bg-white px-5 text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-50 dark:bg-card dark:text-white dark:hover:bg-accent"
        >
          {t("button")}
          <ArrowRight className="ml-2 size-4" />
        </a>
      </div>
    </section>
  );
}
