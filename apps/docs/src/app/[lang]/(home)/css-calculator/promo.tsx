"use client";

import { useEffect } from "react";
import Image from "next/image";
import { ArrowRight, Target } from "lucide-react";
import { useTranslations } from "next-intl";
import { buildToolAppUrl } from "@shared/product-analytics";
import { buttonVariants } from "@/components/ui/button";
import { trackToolEvent } from "@/lib/tool-analytics";
import { cn } from "@/lib/cn";
import styles from "./css-calculator.module.css";

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

export function CssFooterCta({ lang }: { lang: string }) {
  const t = useTranslations("cssCalculator.page.footerCta");
  const href = buildToolAppUrl({
    locale: lang,
    toolId: "css_calculator",
    ctaPlacement: "tool_footer",
    destination: "app_home",
  });

  return (
    <section className={styles.footerCta} aria-labelledby="css-footer-title">
      <div>
        <Target className="size-6" aria-hidden />
        <h2 id="css-footer-title">{t("title")}</h2>
        <p>{t("body")}</p>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.footerCtaButton}
        onClick={() =>
          trackToolEvent("tool_app_cta_clicked", "css_calculator", {
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

export function CssAppPromo({ lang }: { lang: string }) {
  const t = useTranslations("cssCalculator.page.promo");
  const imageLang = ["zh", "zh-hant", "ja"].includes(lang) ? lang : "en";
  const href = buildToolAppUrl({
    locale: lang,
    toolId: "css_calculator",
    ctaPlacement: "tool_footer",
    destination: "app_home",
  });
  const steps = readSteps(t.raw("steps"));
  const benefits = readLines(t.raw("benefits"));

  useEffect(() => {
    trackToolEvent("tool_viewed", "css_calculator", { lang });
  }, [lang]);

  return (
    <section id="app" className={styles.promo}>
      <div className={styles.promoHero}>
        <div className={styles.promoCopy}>
          <p className={styles.promoKicker}>{t("kicker")}</p>
          <h2 className={styles.promoTitle}>{t("title")}</h2>
          <p className={styles.promoLead}>{t("lead")}</p>
        </div>
        <figure className={styles.swimPromoStage}>
          <div className={styles.promoStage}>
            <div className={styles.promoWeb}>
              <div className={styles.promoWebBar} aria-hidden>
                <span />
                <span />
                <span />
              </div>
              <Image
                src={`/css-calculator/web-plan-dark-${imageLang}.webp`}
                alt={t("collage.webAlt")}
                width={1200}
                height={960}
                sizes="(min-width: 900px) 460px, 78vw"
              />
            </div>
            <div className={styles.promoPhone}>
              <Image
                src={`/css-calculator/phone-plan-dark-${imageLang}.webp`}
                alt={t("collage.phoneAlt")}
                width={1320}
                height={2868}
                sizes="(min-width: 900px) 240px, 40vw"
              />
            </div>
          </div>
          <figcaption>{t("collage.caption")}</figcaption>
        </figure>
        <div className={styles.promoCtaAction}>
          <p className={styles.promoCtaTitle}>{t("cta.title")}</p>
          <p className={styles.promoCtaBody}>{t("cta.body")}</p>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackToolEvent("tool_app_cta_clicked", "css_calculator", {
                cta_placement: "tool_footer",
                destination: "app_home",
                lang,
              })
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
