import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { ProductBrowserChrome } from "@/components/ProductBrowserChrome";
import { publicDemoDestination } from "@/lib/public-demo-url";
import type { RunningPlanSlug } from "@/lib/running-plan-pages";
import { previewAsset } from "./plan-preview-assets";
import styles from "../five-k-training-plan.module.css";

function WebPlanImage({
  alt,
  lang,
  surface,
  planSlug,
}: {
  alt: string;
  lang: string;
  surface: "web-plan" | "web-calendar";
  planSlug?: RunningPlanSlug;
}) {
  return (
    <>
      <Image
        className={`${styles.actualWebImage} ${styles.themeLightImage}`}
        src={previewAsset(surface, lang, planSlug)}
        width={1440}
        height={960}
        sizes="(min-width: 900px) 680px, 92vw"
        priority
        alt={alt}
      />
      <Image
        className={`${styles.actualWebImage} ${styles.themeDarkImage}`}
        src={previewAsset(`${surface}-dark`, lang, planSlug)}
        width={1440}
        height={960}
        sizes="(min-width: 900px) 680px, 92vw"
        priority
        alt=""
        aria-hidden="true"
      />
    </>
  );
}

function MobilePlanImage({
  alt,
  lang,
  surface,
}: {
  alt: string;
  lang: string;
  surface: "mobile-plan" | "mobile-calendar";
}) {
  return (
    <>
      <Image
        className={`${styles.actualMobileImage} ${styles.themeLightImage}`}
        src={previewAsset(surface, lang)}
        width={1320}
        height={2868}
        sizes="(min-width: 900px) 190px, 34vw"
        priority
        unoptimized
        alt={alt}
      />
      <Image
        className={`${styles.actualMobileImage} ${styles.themeDarkImage}`}
        src={previewAsset(`${surface}-dark`, lang)}
        width={1320}
        height={2868}
        sizes="(min-width: 900px) 190px, 34vw"
        priority
        unoptimized
        alt=""
        aria-hidden="true"
      />
    </>
  );
}

export async function FiveKProductPreview({
  lang,
  planSlug,
  distance,
  variant = "hero",
}: {
  lang: string;
  planSlug: RunningPlanSlug;
  distance: string;
  variant?: "hero" | "workflow";
}) {
  const t = await getTranslations({
    locale: lang,
    namespace: "runningPlanPages.productPreview",
  });
  const showPlan = planSlug !== "couch-to-5k-training-plan";
  const showMobilePlan =
    planSlug === "5k-training-plan" ||
    planSlug === "5k-training-plan-intermediate";
  const destination = publicDemoDestination(
    lang,
    showPlan ? "/plans" : "/calendar",
  );
  const workflow = variant === "workflow";

  const screens = (
    <>
      <div className={workflow ? styles.workflowWeb : styles.webDevice}>
        <ProductBrowserChrome
          address={destination.address}
          addressHref={destination.href}
          compact
        />
        <WebPlanImage
          alt={showPlan ? `${distance}: ${t("webAlt")}` : t("webCalendarAlt")}
          lang={lang}
          surface={showPlan ? "web-plan" : "web-calendar"}
          planSlug={showPlan ? planSlug : undefined}
        />
      </div>
      <div className={workflow ? styles.workflowPhone : styles.mobileDevice}>
        <MobilePlanImage
          alt={t(showMobilePlan ? "mobileAlt" : "mobileCalendarAlt")}
          lang={lang}
          surface={showMobilePlan ? "mobile-plan" : "mobile-calendar"}
        />
      </div>
    </>
  );

  return workflow ? (
    <figure className={styles.workflowPreview}>{screens}</figure>
  ) : (
    <figure className={styles.devicePreview}>
      <div className={styles.previewCanvas}>{screens}</div>
    </figure>
  );
}
