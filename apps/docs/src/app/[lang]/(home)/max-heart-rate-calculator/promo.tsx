"use client";
import { ArrowRight, Target } from "lucide-react";
import { useTranslations } from "next-intl";
import { buildToolAppUrl } from "@shared/product-analytics";
import { trackToolEvent } from "@/lib/tool-analytics";
import { CalculatorPromo } from "@/components/calculators/app-promo";
import styles from "./max-heart-rate-calculator.module.css";

export function MaxHrFooterCta({ lang }: { lang: string }) {
  const t = useTranslations("maxHeartRateCalculator.page.footerCta");
  const href = buildToolAppUrl({
    locale: lang,
    toolId: "max_heart_rate_calculator",
    ctaPlacement: "tool_footer",
    destination: "app_home",
  });

  return (
    <section className={styles.footerCta} aria-labelledby="hrmax-footer-title">
      <div>
        <Target className="size-6" aria-hidden />
        <h2 id="hrmax-footer-title">{t("title")}</h2>
        <p>{t("body")}</p>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.footerCtaButton}
        onClick={() =>
          trackToolEvent("tool_app_cta_clicked", "max_heart_rate_calculator", {
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

export function MaxHrAppPromo({ lang }: { lang: string }) {
  return (
    <CalculatorPromo
      lang={lang}
      toolId="max_heart_rate_calculator"
      namespace="maxHeartRateCalculator.page.promo"
      variant="recording"
    />
  );
}
