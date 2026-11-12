import screenshotManifest from "../../content/screenshots/manifest.json";
import { publicDemoDestination } from "@/lib/public-demo-url";

type ScreenshotCapture = {
  id: string;
  route?: string;
  status: "pending" | "ready";
  asset: string;
  aspectRatio?: string;
  localizedAssets?: Record<string, string>;
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

export function resolveDocsScreenshot({
  id,
  locale,
  imageSrc,
  appPath,
}: DocsScreenshotOptions) {
  const capture = screenshotCaptures.get(id);
  const asset =
    capture?.status === "ready"
      ? (capture.localizedAssets?.[locale] ?? capture.asset)
      : undefined;
  return {
    capture,
    imageSrc: imageSrc ?? localAssetPath(asset),
    destination: publicDemoDestination(
      locale,
      appPath ?? stableCaptureRoute(capture?.route) ?? inferredAppPath(id),
    ),
  };
}
