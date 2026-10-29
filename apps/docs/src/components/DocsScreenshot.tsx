"use client";

import { ArrowUpRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import screenshotManifest from "../../content/screenshots/manifest.json";
import { ProductBrowserWindow } from "@/components/ProductBrowserChrome";
import { ProductVisualPlaceholder } from "@/components/ProductVisualPlaceholder";
import { publicDemoDestination } from "@/lib/public-demo-url";

type DocsScreenshotProps = {
  id: string;
  title: string;
  description: string;
  route?: string;
  platform?: "web" | "mobile";
  platformLabel?: string;
  imageSrc?: string;
  imageAlt?: string;
  appPath?: string;
};

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

/**
 * Stable screenshot slot for product documentation.
 *
 * The manifest is the source of truth for capture status, assets, and Demo
 * destinations. Pending captures render an honest link to the relevant live
 * Demo page instead of a simulated product interface.
 */
export function DocsScreenshot({
  id,
  title,
  description,
  route,
  platform = "web",
  platformLabel,
  imageSrc,
  imageAlt,
  appPath,
}: DocsScreenshotProps) {
  const locale = useLocale();
  const t = useTranslations("docsScreenshot");
  const capture = screenshotCaptures.get(id);
  const manifestAsset =
    capture?.status === "ready"
      ? (capture.localizedAssets?.[locale] ?? capture.asset)
      : undefined;
  const resolvedImageSrc = imageSrc ?? localAssetPath(manifestAsset);
  const destination = publicDemoDestination(
    locale,
    appPath ?? stableCaptureRoute(capture?.route) ?? inferredAppPath(id),
  );
  const visual = resolvedImageSrc ? (
    <ProductVisualPlaceholder
      label={title}
      imageSrc={resolvedImageSrc}
      imageAlt={imageAlt ?? title}
      imageAspectRatio={capture?.aspectRatio}
      showLabelOverlay={false}
      className={
        platform === "web" ? "rounded-none border-0 shadow-none" : undefined
      }
    />
  ) : (
    <div className="flex min-h-64 flex-col justify-between gap-8 bg-card p-6 text-left sm:p-8">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {t("demoLabel")}
        </div>
        <div className="mt-3 text-xl font-semibold text-foreground">
          {title}
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      <a
        href={destination.href}
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex w-fit items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`${t("openDemo")}: ${title}`}
      >
        {t("openDemo")}
        <ArrowUpRight
          aria-hidden="true"
          className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        />
      </a>
    </div>
  );

  return (
    <figure className="my-8" data-docs-screenshot={id}>
      {platform === "web" ? (
        <ProductBrowserWindow
          address={destination.address}
          addressHref={destination.href}
          addressAriaLabel={`${title}: ${destination.address}`}
        >
          {visual}
        </ProductBrowserWindow>
      ) : (
        visual
      )}
      <figcaption className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
        {platformLabel ?? (platform === "mobile" ? "Mobile" : "Web")}
        {route ? ` · ${route}` : ""}
      </figcaption>
    </figure>
  );
}
