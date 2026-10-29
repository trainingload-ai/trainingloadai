"use client";

import { useEffect } from "react";
import Image from "next/image";
import { ArrowRight, Target } from "lucide-react";
import { useTranslations } from "next-intl";
import { buildToolAppUrl } from "@shared/product-analytics";
import { buttonVariants } from "@/components/ui/button";
import { trackToolEvent } from "@/lib/tool-analytics";
import { cn } from "@/lib/cn";
import styles from "./lactate-threshold-calculator.module.css";

type PromoStep = {
  title: string;
  body: string;
};

function readSteps(raw: unknown): PromoStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is PromoStep =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as PromoStep).title === "string" &&
      typeof (item as PromoStep).body === "string",
  );
}

function readLines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string");
}

const PREVIEW_LOCALES = new Set(["en", "ja", "zh", "zh-hant"]);
const PREVIEW_ROOT = "/lactate-threshold-calculator";

export function LactateFooterCta({ lang }: { lang: string }) {
  const t = useTranslations("lactateThresholdCalculator.page.footerCta");
  const href = buildToolAppUrl({
    locale: lang,
    toolId: "lactate_threshold_calculator",
    ctaPlacement: "tool_footer",
    destination: "app_home",
  });

  return (
    <section className={styles.footerCta} aria-labelledby="lt-footer-title">
      <div>
        <Target className="size-6" aria-hidden />
        <h2 id="lt-footer-title">{t("title")}</h2>
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
            "lactate_threshold_calculator",
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

export function LactateAppPromo({ lang }: { lang: string }) {
  const t = useTranslations("lactateThresholdCalculator.page.promo");
  const href = buildToolAppUrl({
    locale: lang,
    toolId: "lactate_threshold_calculator",
    ctaPlacement: "tool_footer",
    destination: "app_home",
  });
  const steps = readSteps(t.raw("steps"));
  const benefits = readLines(t.raw("benefits"));
  const previewLocale = PREVIEW_LOCALES.has(lang) ? lang : "en";

  useEffect(() => {
    trackToolEvent("tool_viewed", "lactate_threshold_calculator", { lang });
  }, [lang]);

  return (
    <section id="app" className={styles.promo}>
      <div className={styles.promoHero}>
        <div className={styles.promoCopy}>
          <p className={styles.promoKicker}>{t("kicker")}</p>
          <h2 className={styles.promoTitle}>{t("title")}</h2>
          <p className={styles.promoLead}>{t("lead")}</p>
        </div>
        <div className={styles.promoStage}>
          <figure className={styles.promoPreview}>
            <div className={styles.promoPhone}>
              <Image
                src={`${PREVIEW_ROOT}/zones-${previewLocale}.png`}
                alt={t("collage.zonesAlt")}
                width={786}
                height={1704}
                sizes="(max-width: 560px) 45vw, 248px"
                loading="lazy"
                decoding="async"
              />
            </div>
            <figcaption>{t("collage.zonesCaption")}</figcaption>
          </figure>
          <figure className={styles.promoPreview}>
            <div className={styles.promoPhone}>
              <Image
                src={`${PREVIEW_ROOT}/plan-${previewLocale}.png`}
                alt={t("collage.planAlt")}
                width={1320}
                height={2868}
                sizes="(max-width: 560px) 45vw, 248px"
                loading="lazy"
                decoding="async"
              />
            </div>
            <figcaption>{t("collage.planCaption")}</figcaption>
          </figure>
        </div>
        <div className={styles.promoCtaAction}>
          <p className={styles.promoCtaTitle}>{t("cta.title")}</p>
          <p className={styles.promoCtaBody}>{t("cta.body")}</p>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackToolEvent(
                "tool_app_cta_clicked",
                "lactate_threshold_calculator",
                {
                  cta_placement: "tool_footer",
                  destination: "app_home",
                  lang,
                },
              )
            }
            className={cn(
              buttonVariants({ size: "lg" }),
              styles.promoButton,
              "h-auto bg-[#021815] text-[#f4fff9] hover:bg-[#01483f]",
            )}
          >
            {t("cta.button")}
            <ArrowRight className="size-4" aria-hidden />
          </a>
          <p className={styles.promoTrust}>{t("cta.trust")}</p>
        </div>
      </div>
      {steps.length > 0 ? (
        <ol className={styles.promoSteps}>
          {steps.map((step, index) => (
            <li key={step.title} className={styles.promoStep}>
              <span className={styles.promoIndex}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      ) : null}
      {benefits.length > 0 ? (
        <ul className={styles.promoBenefits}>
          {benefits.map((benefit) => (
            <li key={benefit}>{benefit}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
