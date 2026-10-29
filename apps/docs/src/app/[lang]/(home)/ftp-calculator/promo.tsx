"use client";

import { useEffect } from "react";
import { ArrowRight, Target } from "lucide-react";
import { useTranslations } from "next-intl";
import { buildToolAppUrl } from "@shared/product-analytics";
import { buttonVariants } from "@/components/ui/button";
import { trackToolEvent } from "@/lib/tool-analytics";
import { cn } from "@/lib/cn";
import styles from "./ftp-calculator.module.css";

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

const PHONE_SRC: Record<string, string> = {
  en: "/ftp-calculator/phone-en.webp",
  ja: "/ftp-calculator/phone-ja.webp",
  zh: "/ftp-calculator/phone-zh.webp",
  "zh-hant": "/ftp-calculator/phone-zh-hant.webp",
};

const WEB_SRC = "/ftp-calculator/web-pmc.webp";

export function FtpFooterCta({ lang }: { lang: string }) {
  const t = useTranslations("estimateCp.page.footerCta");
  const href = buildToolAppUrl({
    locale: lang,
    toolId: "ftp_calculator",
    ctaPlacement: "tool_footer",
    destination: "app_home",
  });

  return (
    <section className={styles.footerCta} aria-labelledby="ftp-footer-title">
      <div>
        <Target className="size-6" aria-hidden />
        <h2 id="ftp-footer-title">{t("title")}</h2>
        <p>{t("body")}</p>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.footerCtaButton}
        onClick={() =>
          trackToolEvent("tool_app_cta_clicked", "ftp_calculator", {
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

export function FtpAppPromo({ lang }: { lang: string }) {
  const t = useTranslations("estimateCp.page.promo");
  const href = buildToolAppUrl({
    locale: lang,
    toolId: "ftp_calculator",
    ctaPlacement: "tool_footer",
    destination: "app_home",
  });
  const steps = readSteps(t.raw("steps"));
  const benefits = readLines(t.raw("benefits"));
  const phoneSrc = PHONE_SRC[lang] ?? PHONE_SRC.en;

  useEffect(() => {
    trackToolEvent("tool_viewed", "ftp_calculator", { lang });
  }, [lang]);

  return (
    <section id="app" className={styles.promo}>
      <div className={styles.promoHero}>
        <div className={styles.promoCopy}>
          <p className={styles.promoKicker}>{t("kicker")}</p>
          <h2 className={styles.promoTitle}>{t("title")}</h2>
          <p className={styles.promoLead}>{t("lead")}</p>
        </div>
        <figure className={styles.promoStage}>
          <div className={styles.promoWeb}>
            <div className={styles.promoWebBar} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <img
              src={WEB_SRC}
              alt={t("collage.webAlt")}
              width={1150}
              height={751}
              decoding="async"
            />
          </div>
          <div className={styles.promoPhone}>
            <img
              src={phoneSrc}
              alt={t("collage.phoneAlt")}
              width={640}
              height={1391}
              decoding="async"
            />
          </div>
        </figure>
        <div className={styles.promoCtaAction}>
          <p className={styles.promoCtaTitle}>{t("cta.title")}</p>
          <p className={styles.promoCtaBody}>{t("cta.body")}</p>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackToolEvent("tool_app_cta_clicked", "ftp_calculator", {
                cta_placement: "tool_footer",
                destination: "app_home",
                lang,
              })
            }
            className={cn(
              buttonVariants({ size: "lg" }),
              styles.promoButton,
              "h-auto bg-[#021815] text-[#f4fff9] hover:bg-[#01483f] dark:bg-[#021815] dark:text-[#f4fff9] dark:hover:bg-[#01483f]",
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
