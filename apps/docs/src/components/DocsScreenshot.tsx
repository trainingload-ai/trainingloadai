"use client";

import { ArrowUpRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { DocsScreenshotVisual } from "@/components/DocsScreenshotVisual";
import {
  resolveDocsScreenshot,
  type DocsScreenshotMedia,
} from "@/lib/docs-screenshot";

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

/** Theme-specific real product captures, paired only for the same feature. */
export function DocsScreenshot({
  id,
  title,
  description,
  route,
  platform,
  platformLabel,
  imageSrc,
  imageAlt,
  appPath,
  demoLabel,
}: DocsScreenshotProps) {
  const locale = useLocale();
  const t = useTranslations("docsScreenshot");
  const { capture, desktop, mobile, destination } = resolveDocsScreenshot({
    id,
    locale,
    imageSrc,
    appPath,
  });
  const paired = Boolean(desktop && mobile);
  const displayPlatform = platform ?? capture?.platform ?? "web";
  const linkLabel =
    demoLabel ?? t(displayPlatform === "mobile" ? "openWebDemo" : "openDemo");
  const platformName = (value: "web" | "mobile") =>
    t(value === "web" ? "webPlatform" : "mobilePlatform");
  const navigation = [desktop, mobile]
    .filter((media): media is DocsScreenshotMedia => Boolean(media))
    .map((media) => {
      const label =
        !paired && platformLabel ? platformLabel : platformName(media.platform);
      const path =
        media.captureId === id ? (route ?? media.navigation) : media.navigation;
      return `${label}${path ? ` · ${path}` : ""}`;
    })
    .join("　·　");

  return (
    <figure className="not-prose my-8" data-docs-screenshot={id}>
      <a
        href={destination.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${linkLabel}: ${title}`}
        data-docs-demo-link
        className="block rounded-feature focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      >
        <DocsScreenshotVisual
          desktop={desktop}
          mobile={mobile}
          address={destination.address}
          imageAlt={imageAlt ?? title}
          webLabel={platformName("web")}
          mobileLabel={platformName("mobile")}
        />
        {!desktop && !mobile ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-feature border bg-card p-6 text-center">
            <span className="font-medium">{title}</span>
            <span className="text-sm text-muted-foreground">{linkLabel}</span>
          </div>
        ) : null}
      </a>
      <figcaption className="mt-4 space-y-1 text-center text-sm leading-6 text-muted-foreground">
        <p>{description}</p>
        {navigation ? <p className="text-xs">{navigation}</p> : null}
        <p className="inline-flex items-center justify-center gap-1 text-xs">
          {linkLabel}
          <ArrowUpRight aria-hidden="true" className="size-3" />
        </p>
      </figcaption>
    </figure>
  );
}
