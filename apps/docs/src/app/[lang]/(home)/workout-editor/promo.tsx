"use client";
import { ArrowRight, Layers3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { buildToolAppUrl } from "@shared/product-analytics";
import { trackToolEvent } from "@/lib/tool-analytics";
import { CalculatorPromo } from "@/components/calculators/app-promo";
import styles from "./workout-editor.module.css";

export function WorkoutFooterCta({ lang }: { lang: string }) {
  const t = useTranslations("workoutEditor.page.footerCta");
  const href = buildToolAppUrl({
    locale: lang,
    toolId: "workout_editor",
    ctaPlacement: "tool_footer",
    destination: "app_home",
  });

  return (
    <section
      className={styles.footerCta}
      aria-labelledby="workout-footer-title"
    >
      <div>
        <Layers3 className="size-5" aria-hidden />
        <h2 id="workout-footer-title">{t("title")}</h2>
        <p>{t("body")}</p>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.footerCtaButton}
        onClick={() =>
          trackToolEvent("tool_app_cta_clicked", "workout_editor", {
            cta_placement: "tool_footer",
            destination: "app_home",
            lang,
          })
        }
      >
        {t("button")}
        <ArrowRight className="size-4" aria-hidden />
      </a>
    </section>
  );
}

export function WorkoutAppPromo({ lang }: { lang: string }) {
  return (
    <CalculatorPromo
      lang={lang}
      toolId="workout_editor"
      namespace="workoutEditor.page.promo"
      variant="plan"
    />
  );
}
