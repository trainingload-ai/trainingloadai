import Image from "next/image";
import { ProductBrowserChrome } from "@/components/ProductBrowserChrome";
import { publicDemoDestination } from "@/lib/public-demo-url";
import type { RunningPlanSlug } from "@/lib/running-plan-pages";
import { previewAsset } from "./plan-preview-assets";
import styles from "../five-k-training-plan.module.css";

type SystemPreviewKind = "calendar" | "analysis" | "coach";

function systemPreview(
  kind: SystemPreviewKind,
  lang: string,
  planSlug: RunningPlanSlug,
) {
  if (kind === "calendar") {
    return {
      web: previewAsset("web-calendar-dark", lang, planSlug),
      mobile: previewAsset("mobile-calendar-dark", lang),
    };
  }
  if (kind === "analysis") {
    return {
      web: previewAsset("web-plan-dark", lang, planSlug),
      mobile: previewAsset("mobile-analysis-dark", lang),
    };
  }
  return {
    web: previewAsset("web-coach-dark", lang),
    mobile: previewAsset("mobile-coach-dark", lang),
  };
}

export function FiveKSystemPreview({
  kind,
  lang,
  label,
  planSlug,
}: {
  kind: SystemPreviewKind;
  lang: string;
  label: string;
  planSlug: RunningPlanSlug;
}) {
  const preview = systemPreview(kind, lang, planSlug);
  const appPath =
    kind === "calendar"
      ? "/calendar"
      : kind === "analysis"
        ? "/analysis"
        : "/ai-coach";

  const destination = publicDemoDestination(lang, appPath);

  return (
    <figure className={styles.systemProductVisual} aria-label={label}>
      <div className={styles.systemPreviewLabels} aria-hidden="true">
        <span>WEB</span>
        <span>iOS</span>
      </div>
      <div className={styles.systemScreens}>
        <div className={styles.systemWebScreen}>
          <ProductBrowserChrome
            address={destination.address}
            addressHref={destination.href}
            compact
            variant="dark"
          />
          <Image
            src={preview.web}
            width={1440}
            height={960}
            sizes="(min-width: 900px) 620px, 92vw"
            loading="eager"
            unoptimized
            alt={`${label} · TrainingLoad.ai Web`}
          />
        </div>
        <div className={styles.systemPhoneScreen}>
          <Image
            src={preview.mobile}
            width={1320}
            height={2868}
            sizes="(min-width: 900px) 170px, 34vw"
            loading="eager"
            unoptimized
            alt={`${label} · TrainingLoad.ai iOS`}
          />
        </div>
      </div>
    </figure>
  );
}
