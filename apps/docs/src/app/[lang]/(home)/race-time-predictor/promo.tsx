"use client";
import { ArrowRight, Target } from "lucide-react";
import { useTranslations } from "next-intl";
import { buildToolAppUrl } from "@shared/product-analytics";
import { trackToolEvent } from "@/lib/tool-analytics";
import { CalculatorPromo } from "@/components/calculators/app-promo";
import styles from "./race-time-predictor.module.css";

export function RaceFooterCta({ lang }: { lang: string }) {
  const t = useTranslations("raceTimePredictor.page.footerCta");
  const href = buildToolAppUrl({
    locale: lang,
    toolId: "race_time_predictor",
    ctaPlacement: "tool_footer",
    destination: "app_home",
  });

  return (
    <section className={styles.footerCta} aria-labelledby="race-footer-title">
      <div>
        <Target className="size-6" aria-hidden />
        <h2 id="race-footer-title">{t("title")}</h2>
        <p>{t("body")}</p>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.footerCtaButton}
        onClick={() =>
          trackToolEvent("tool_app_cta_clicked", "race_time_predictor", {
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

export function RaceAppPromo({ lang }: { lang: string }) {
  return (
    <CalculatorPromo
      lang={lang}
      toolId="race_time_predictor"
      namespace="raceTimePredictor.page.promo"
      variant="recording"
    />
  );
}
