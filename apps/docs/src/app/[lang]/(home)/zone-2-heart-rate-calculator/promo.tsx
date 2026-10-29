"use client";
import { ArrowRight, Target } from "lucide-react";
import { useTranslations } from "next-intl";
import { buildToolAppUrl } from "@shared/product-analytics";
import { trackToolEvent } from "@/lib/tool-analytics";
import { CalculatorPromo } from "@/components/calculators/app-promo";
import styles from "./zone-2-heart-rate-calculator.module.css";

export function Zone2FooterCta({ lang }: { lang: string }) {
  const t = useTranslations("zone2HeartRateCalculator.page.footerCta");
  const href = buildToolAppUrl({
    locale: lang,
    toolId: "zone_2_heart_rate_calculator",
    ctaPlacement: "tool_footer",
    destination: "app_home",
  });

  return (
    <section className={styles.footerCta} aria-labelledby="zone2-footer-title">
      <div>
        <Target className="size-6" aria-hidden />
        <h2 id="zone2-footer-title">{t("title")}</h2>
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
            "zone_2_heart_rate_calculator",
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

export function Zone2AppPromo({ lang }: { lang: string }) {
  return (
    <CalculatorPromo
      lang={lang}
      toolId="zone_2_heart_rate_calculator"
      namespace="zone2HeartRateCalculator.page.promo"
      variant="load"
    />
  );
}
