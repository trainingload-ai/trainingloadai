"use client";
import { ArrowRight, Target } from "lucide-react";
import { useTranslations } from "next-intl";
import { buildToolAppUrl } from "@shared/product-analytics";
import { trackToolEvent } from "@/lib/tool-analytics";
import { CalculatorPromo } from "@/components/calculators/app-promo";
import styles from "./heart-rate-zones-calculator.module.css";

export function HeartRateZonesFooterCta({ lang }: { lang: string }) {
  const t = useTranslations("heartRateZonesCalculator.page.footerCta");
  const href = buildToolAppUrl({
    locale: lang,
    toolId: "heart_rate_zones_calculator",
    ctaPlacement: "tool_footer",
    destination: "app_home",
  });

  return (
    <section
      className={styles.footerCta}
      aria-labelledby="hr-zones-footer-title"
    >
      <div>
        <Target className="size-6" aria-hidden />
        <h2 id="hr-zones-footer-title">{t("title")}</h2>
        <p>{t("body")}</p>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.footerCtaButton}
        onClick={() =>
          trackToolEvent(
            "tool_app_cta_clicked",
            "heart_rate_zones_calculator",
            {
              cta_placement: "tool_footer",
              destination: "app_home",
              lang,
            },
          )
        }
      >
        {t("button")}
        <ArrowRight className="size-4" aria-hidden />
      </a>
    </section>
  );
}

export function HeartRateZonesPromo({ lang }: { lang: string }) {
  return (
    <CalculatorPromo
      lang={lang}
      toolId="heart_rate_zones_calculator"
      namespace="heartRateZonesCalculator.page.promo"
      variant="load"
    />
  );
}
