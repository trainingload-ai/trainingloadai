"use client";

import { ArrowUpRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { ProductBrowserWindow } from "@/components/ProductBrowserChrome";
import { ProductVisualPlaceholder } from "@/components/ProductVisualPlaceholder";
import { resolveDocsScreenshot } from "@/lib/docs-screenshot";

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
  demoLabel?: string;
};

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
  demoLabel,
}: DocsScreenshotProps) {
  const locale = useLocale();
  const t = useTranslations("docsScreenshot");
  const {
    capture,
    imageSrc: resolvedImageSrc,
    destination,
  } = resolveDocsScreenshot({
    id,
    locale,
    imageSrc,
    appPath,
  });
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
        aria-label={`${demoLabel ?? t("openDemo")}: ${title}`}
      >
        {demoLabel ?? t("openDemo")}
        <ArrowUpRight
          aria-hidden="true"
          className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        />
      </a>
    </div>
  );

  return (
    <figure className="not-prose my-8" data-docs-screenshot={id}>
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
      <figcaption className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
        {resolvedImageSrc ? <p>{description}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span>
            {platformLabel ?? (platform === "mobile" ? "Mobile" : "Web")}
            {route ? ` · ${route}` : ""}
          </span>
          {resolvedImageSrc ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <a
                href={resolvedImageSrc}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("openImage")}
              </a>
              <a
                href={destination.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {demoLabel ?? t("openDemo")}
                <ArrowUpRight aria-hidden="true" className="size-3.5" />
              </a>
            </div>
          ) : null}
        </div>
      </figcaption>
    </figure>
  );
}
