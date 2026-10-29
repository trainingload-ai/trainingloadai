"use client";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { buildToolAppUrl } from "@shared/product-analytics";
import { trackToolEvent } from "@/lib/tool-analytics";
import { CalculatorPromo } from "@/components/calculators/app-promo";
import styles from "./vdot-calculator.module.css";

export function VdotFooterCta({ lang }: { lang: string }) {
  const t = useTranslations("vdotCalculator.page.footerCta");
  const href = buildToolAppUrl({
    locale: lang,
    toolId: "vdot_calculator",
    ctaPlacement: "tool_footer",
    destination: "app_home",
  });

  return (
    <section className={styles.footerCta} aria-labelledby="vdot-footer-title">
      <div>
        <h2 id="vdot-footer-title">{t("title")}</h2>
        <p>{t("body")}</p>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.footerCtaButton}
        onClick={() =>
          trackToolEvent("tool_app_cta_clicked", "vdot_calculator", {
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

export function VdotAppPromo({ lang }: { lang: string }) {
  return (
    <CalculatorPromo
      lang={lang}
      toolId="vdot_calculator"
      namespace="vdotCalculator.page.promo"
      variant="fitness"
    />
  );
}
