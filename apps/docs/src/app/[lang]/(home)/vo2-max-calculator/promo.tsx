"use client";

import Image from "next/image";
import { ArrowRight, Target } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { buildToolAppUrl } from "@shared/product-analytics";
import { trackToolEvent } from "@/lib/tool-analytics";
import styles from "./vo2-max-calculator.module.css";

function AppLink({ children }: { children: React.ReactNode }) {
  const lang = useLocale();
  const href = buildToolAppUrl({
    locale: lang,
    toolId: "vo2_max_calculator",
    ctaPlacement: "tool_footer",
    destination: "app_home",
  });
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.promoButton}
      onClick={() =>
        trackToolEvent("tool_app_cta_clicked", "vo2_max_calculator", {
          cta_placement: "tool_footer",
          destination: "app_home",
          lang,
        })
      }
    >
      {children}
      <ArrowRight className="size-4" aria-hidden />
    </a>
  );
}

export function Vo2ResultPromo() {
  const lang = useLocale();
  const t = useTranslations("vo2MaxCalculator.page.promo");
  const imageLang = ["en", "zh", "zh-hant", "ja"].includes(lang) ? lang : "en";
  return (
    <section className={styles.promo} aria-labelledby="vo2-promo-title">
      <div className={styles.promoCopy}>
        <p className={styles.promoKicker}>Trainingload.ai</p>
        <h2 id="vo2-promo-title">{t("title")}</h2>
        <p>{t("body")}</p>
        <AppLink>{t("button")}</AppLink>
        <p className={styles.promoTrust}>{t("trust")}</p>
      </div>
      <figure className={styles.promoImages}>
        <div className={styles.promoPhone}>
          <Image
            src={`/vo2-max-calculator/phone-vo2-${imageLang}.webp`}
            alt={t("phoneAlt")}
            width={1320}
            height={2868}
            sizes="(min-width: 960px) 300px, 70vw"
          />
        </div>
        <div className={styles.promoDetail} aria-hidden="true">
          <Image
            src={`/vo2-max-calculator/phone-vo2-${imageLang}.webp`}
            alt=""
            width={1320}
            height={2868}
            sizes="(min-width: 960px) 340px, 55vw"
          />
        </div>
        <figcaption>{t("caption")}</figcaption>
      </figure>
      <div className={styles.promoSteps}>
        {(t.raw("steps") as { title: string; body: string }[]).map(
          (step, index) => (
            <article key={step.title}>
              <span>0{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ),
        )}
      </div>
    </section>
  );
}

export function Vo2FooterCta() {
  const t = useTranslations("vo2MaxCalculator.page.footerCta");
  return (
    <section className={styles.footerCta} aria-labelledby="vo2-footer-title">
      <div>
        <Target size={24} aria-hidden />
        <h2 id="vo2-footer-title">{t("title")}</h2>
        <p>{t("body")}</p>
      </div>
      <AppLink>{t("button")}</AppLink>
    </section>
  );
}
