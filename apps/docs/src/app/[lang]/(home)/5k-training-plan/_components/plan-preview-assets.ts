import { productScreenshotUrl } from "@/lib/product-screenshot-url.mjs";
import type { RunningPlanSlug } from "@/lib/running-plan-pages";

type PreviewLocale = "en" | "zh" | "zh-hant" | "ja";
type WebPreviewSurface =
  | "web-plan"
  | "web-plan-dark"
  | "web-calendar"
  | "web-calendar-dark"
  | "web-coach-dark";

type MobilePreviewSurface =
  | "mobile-plan"
  | "mobile-plan-dark"
  | "mobile-calendar"
  | "mobile-calendar-dark"
  | "mobile-analysis-dark"
  | "mobile-coach-dark";

function previewLocale(lang: string): PreviewLocale {
  const normalized = lang.toLowerCase();
  if (
    normalized.startsWith("zh-hant") ||
    normalized.startsWith("zh-tw") ||
    normalized.startsWith("zh-hk")
  ) {
    return "zh-hant";
  }
  if (normalized.startsWith("zh")) return "zh";
  if (normalized.startsWith("ja")) return "ja";
  return "en";
}

export function previewAsset(
  surface: WebPreviewSurface | MobilePreviewSurface,
  lang: string,
  planSlug?: RunningPlanSlug,
) {
  const locale = previewLocale(lang);
  if (!surface.startsWith("web-")) {
    return `/5k-training-plan/${surface}-v2-${locale}.png`;
  }

  const path =
    planSlug === "10k-training-plan" ||
    planSlug === "half-marathon-training-plan" ||
    planSlug === "marathon-training-plan"
      ? planSlug
      : "5k-training-plan";
  return productScreenshotUrl(`/${path}/${surface}-v2-${locale}.png`);
}
