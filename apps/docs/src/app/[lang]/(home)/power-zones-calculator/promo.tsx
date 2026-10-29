"use client";
import { ArrowRight, Target } from "lucide-react";
import { useTranslations } from "next-intl";
import { buildToolAppUrl } from "@shared/product-analytics";
import { trackToolEvent } from "@/lib/tool-analytics";
import { CalculatorPromo } from "@/components/calculators/app-promo";
import styles from "./power-zones-calculator.module.css";

export function PowerZonesFooterCta({ lang }: { lang: string }) {
  const t = useTranslations("powerZonesCalculator.page.footerCta");
  const href = buildToolAppUrl({
    locale: lang,
    toolId: "power_zones_calculator",
    ctaPlacement: "tool_footer",
    destination: "app_home",
  });

  return (
    <section className={styles.footerCta} aria-labelledby="pz-footer-title">
      <div>
        <Target className="size-6" aria-hidden />
        <h2 id="pz-footer-title">{t("title")}</h2>
        <p>{t("body")}</p>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.footerCtaButton}
        onClick={() =>
          trackToolEvent("tool_app_cta_clicked", "power_zones_calculator", {
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

export function PowerZonesAppPromo({ lang }: { lang: string }) {
  return (
    <CalculatorPromo
      lang={lang}
      toolId="power_zones_calculator"
      namespace="powerZonesCalculator.page.promo"
      variant="load"
    />
  );
}
