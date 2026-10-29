"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { TrackedLink } from "@/components/TrackedLink";
import styles from "./product-preview.module.css";

export function ProductPreview({
  lang,
  title,
  body,
  href,
  cta,
  variant = "recording",
}: {
  lang: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  variant?: "recording" | "plan";
}) {
  const t = useTranslations("calculatorProduct");
  const locale = ["zh", "zh-hant", "ja"].includes(lang) ? lang : "en";
  return (
    <div className={styles.preview}>
      <div className={styles.devices}>
        <div className={styles.phone}>
          <Image
            src={
              variant === "plan"
                ? `/css-calculator/phone-plan-dark-${locale}.webp`
                : `/ftp-calculator/recording-${locale}.png`
            }
            alt={t(variant === "plan" ? "planAlt" : "recordingAlt")}
            width={variant === "plan" ? 1320 : 786}
            height={variant === "plan" ? 2868 : 1704}
            loading="eager"
            sizes="(min-width: 1024px) 184px, (min-width: 600px) 180px, 36vw"
          />
        </div>
        {variant === "recording" ? (
          <div className={styles.watch}>
            <Image
              src={`/ftp-calculator/watch-${locale}.png`}
              alt={t("watchAlt")}
              width={416}
              height={496}
              sizes="(min-width: 600px) 120px, 22vw"
            />
          </div>
        ) : null}
      </div>
      <div className={styles.copy}>
        <p className={styles.kicker}>Trainingload.ai</p>
        <h2>{title}</h2>
        <p>{body}</p>
        <TrackedLink
          href={href}
          className={styles.link}
          eventName="related_tool_clicked"
          eventProperties={{ href, location: "calculator_hero" }}
        >
          {cta}
          <span aria-hidden> →</span>
        </TrackedLink>
      </div>
    </div>
  );
}
