"use client";

import Image from "next/image";
import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  buildToolAppUrl,
  type ProductAnalyticsToolId,
} from "@shared/product-analytics";
import { trackToolEvent } from "@/lib/tool-analytics";
import styles from "./app-promo.module.css";

export function CalculatorPromo({
  lang,
  toolId,
  namespace,
  variant = "load",
  appHref,
}: {
  lang: string;
  toolId?: ProductAnalyticsToolId;
  appHref?: string;
  namespace: string;
  variant?: "load" | "recording" | "plan" | "fitness";
}) {
  const t = useTranslations(namespace);
  const common = useTranslations("calculatorProduct");
  const locale = ["zh", "zh-hant", "ja"].includes(lang) ? lang : "en";
  const href =
    appHref ??
    (toolId
      ? buildToolAppUrl({
          locale: lang,
          toolId,
          ctaPlacement: "tool_footer",
          destination: "app_home",
        })
      : `https://app.trainingload.ai/${lang}/plan`);
  const phoneSrc =
    variant === "plan"
      ? `/css-calculator/phone-plan-dark-${locale}.webp`
      : variant === "recording"
        ? `/ftp-calculator/recording-${locale}.png`
        : variant === "fitness"
          ? `/vo2-max-calculator/phone-vo2-${locale}.webp`
          : `/power-zones-calculator/phone-pmc-dark-${locale}.webp`;
  const webSrc =
    variant === "plan"
      ? `/css-calculator/web-plan-dark-${locale}.webp`
      : "/ftp-calculator/web-pmc.webp";
  const steps = t.raw("steps") as { title: string; body: string }[];
  useEffect(() => {
    if (toolId) trackToolEvent("tool_viewed", toolId, { lang });
  }, [lang, toolId]);
  return (
    <section
      id="app"
      className={styles.promo}
      aria-labelledby={`${toolId ?? "training-plan"}-promo`}
    >
      <div className={styles.inner}>
        <div className={styles.hero}>
          <div className={styles.copy}>
            <p className={styles.kicker}>Trainingload.ai</p>
            <h2 id={`${toolId ?? "training-plan"}-promo`}>{t("title")}</h2>
            <p className={styles.lead}>{t("lead")}</p>
          </div>
          <figure className={styles.stage}>
            <div className={styles.web}>
              <div className={styles.webBar} aria-hidden>
                <span />
                <span />
                <span />
              </div>
              <Image
                src={webSrc}
                alt={common(variant === "plan" ? "webPlanAlt" : "webLoadAlt")}
                width={variant === "plan" ? 1200 : 1150}
                height={variant === "plan" ? 960 : 751}
                sizes="(min-width: 1024px) 440px, 72vw"
              />
            </div>
            <div className={styles.phone}>
              <Image
                src={phoneSrc}
                alt={common(
                  variant === "plan"
                    ? "planAlt"
                    : variant === "recording"
                      ? "recordingAlt"
                      : variant === "fitness"
                        ? "fitnessAlt"
                        : "loadAlt",
                )}
                width={variant === "recording" ? 786 : 1320}
                height={variant === "recording" ? 1704 : 2868}
                sizes="(min-width: 1024px) 208px, 34vw"
              />
            </div>
          </figure>
          <div className={styles.action}>
            <h3>{t("actionTitle")}</h3>
            <p>{t("actionBody")}</p>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.button}
              onClick={() =>
                toolId &&
                trackToolEvent("tool_app_cta_clicked", toolId, {
                  cta_placement: "tool_footer",
                  destination: "app_home",
                  lang,
                })
              }
            >
              {common("cta")}
              <ArrowRight className="size-4" aria-hidden />
            </a>
            <p className={styles.trust}>{common("demoNote")}</p>
          </div>
        </div>
        <ol className={styles.steps}>
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className={styles.index}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
