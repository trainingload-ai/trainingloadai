import screenshotManifest from "../../content/screenshots/manifest.json";
import { publicDemoDestination } from "@/lib/public-demo-url";

type ScreenshotCapture = {
  id: string;
  platform?: "web" | "mobile";
  route?: string;
  status: "pending" | "ready";
  asset: string;
  darkAsset?: string;
  aspectRatio?: string;
  localizedAssets?: Record<string, string>;
  localizedDarkAssets?: Record<string, string>;
  companionId?: string;
  navigation?: Record<string, string>;
};

const screenshotCaptures = new Map(
  (screenshotManifest.captures as ScreenshotCapture[]).map((capture) => [
    capture.id,
    capture,
  ]),
);

function inferredAppPath(id: string) {
  if (id.includes("calendar")) return "/calendar";
  if (/(ai-coach|coach)/.test(id)) return "/ai-coach";
  if (/(pmc|training-analysis)/.test(id)) return "/pmc";
  if (/(vo2max|power-analysis|analysis-hub)/.test(id)) return "/analysis";
  if (id.includes("dashboard")) return "/dashboard";
  if (id.includes("competition")) return "/competitions";
  if (/(activity|upload)/.test(id)) return "/activities";
  if (/(plan|workout|strength)/.test(id)) return "/plans";
  if (/(account|usage|integration|strava|intervals|garmin)/.test(id)) {
    return "/account";
  }
  return "";
}

function stableCaptureRoute(route: string | undefined) {
  if (route === "/") return "";
  const segments = String(route ?? "")
    .split("/")
    .filter((segment) => segment && !/^\{.+\}$/.test(segment));
  return segments.length ? `/${segments.join("/")}` : undefined;
}

function localAssetPath(asset: string | undefined) {
  const normalized = String(asset ?? "").replace(/^\/+/, "");
  return normalized ? `/${normalized}` : undefined;
}

export type DocsScreenshotOptions = {
  id: string;
  locale: string;
  imageSrc?: string;
  appPath?: string;
};

export type DocsScreenshotMedia = {
  captureId: string;
  platform: "web" | "mobile";
  imageSrc: string;
  darkImageSrc?: string;
  width: number;
  height: number;
  navigation?: string;
};

function captureMedia(
  capture: ScreenshotCapture | undefined,
  locale: string,
  imageSrc?: string,
): DocsScreenshotMedia | undefined {
  const asset =
    capture?.status === "ready"
      ? (capture.localizedAssets?.[locale] ?? capture.asset)
      : undefined;
  const resolvedImageSrc = imageSrc ?? localAssetPath(asset);
  if (!resolvedImageSrc) return undefined;
  const dimensions = capture?.aspectRatio?.split("/").map(Number);
  return {
    captureId: capture?.id ?? "custom",
    platform: capture?.platform ?? "web",
    imageSrc: resolvedImageSrc,
    darkImageSrc: localAssetPath(
      capture?.localizedDarkAssets?.[locale] ?? capture?.darkAsset,
    ),
    width: dimensions?.[0] || 1280,
    height: dimensions?.[1] || 960,
    navigation: capture?.navigation?.[locale] ?? capture?.navigation?.en,
  };
}

export function resolveDocsScreenshot({
  id,
  locale,
  imageSrc,
  appPath,
}: DocsScreenshotOptions) {
  const capture = screenshotCaptures.get(id);
  const primary = captureMedia(capture, locale, imageSrc);
  const companionCapture = capture?.companionId
    ? screenshotCaptures.get(capture.companionId)
    : undefined;
  const companion =
    companionCapture?.platform !== capture?.platform
      ? captureMedia(companionCapture, locale)
      : undefined;
  const images = [primary, companion]
    .filter((media): media is DocsScreenshotMedia => Boolean(media))
    .sort(
      (a, b) =>
        Number(a.platform === "mobile") - Number(b.platform === "mobile"),
    );
  return {
    capture,
    imageSrc: primary?.imageSrc,
    images,
    desktop: images.find((media) => media.platform === "web"),
    mobile: images.find((media) => media.platform === "mobile"),
    destination: publicDemoDestination(
      locale,
      appPath ?? stableCaptureRoute(capture?.route) ?? inferredAppPath(id),
    ),
  };
}
