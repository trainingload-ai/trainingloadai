/* eslint-disable @next/next/no-img-element */

import { ProductBrowserWindow } from "@/components/ProductBrowserChrome";
import type { DocsScreenshotMedia } from "@/lib/docs-screenshot";
import { cn } from "@/lib/utils";
import styles from "./DocsScreenshot.module.css";

function ScreenshotImage({
  media,
  alt,
  preload = false,
}: {
  media: DocsScreenshotMedia;
  alt: string;
  preload?: boolean;
}) {
  return (
    <div style={{ aspectRatio: `${media.width} / ${media.height}` }}>
      <img
        src={media.imageSrc}
        alt={alt}
        width={media.width}
        height={media.height}
        loading={preload ? "eager" : "lazy"}
        decoding="async"
        className={cn("block h-auto w-full", media.darkImageSrc && "dark:hidden")}
      />
      {media.darkImageSrc ? (
        <img
          src={media.darkImageSrc}
          alt={alt}
          width={media.width}
          height={media.height}
          loading={preload ? "eager" : "lazy"}
          decoding="async"
          className="hidden h-auto w-full dark:block"
        />
      ) : null}
    </div>
  );
}

/** Shared presentation only; the surrounding guide or card owns navigation. */
export function DocsScreenshotVisual({
  desktop,
  mobile,
  address,
  imageAlt,
  webLabel,
  mobileLabel,
  preload = false,
}: {
  desktop?: DocsScreenshotMedia;
  mobile?: DocsScreenshotMedia;
  address: string;
  imageAlt: string;
  webLabel: string;
  mobileLabel: string;
  preload?: boolean;
}) {
  const paired = Boolean(desktop && mobile);
  return (
    <div
      className={cn(styles.composition, paired && styles.paired)}
      data-docs-screenshot-visual
      data-docs-paired={paired || undefined}
    >
      {desktop ? (
        <ProductBrowserWindow
          address={address}
          className={styles.browser}
          chromeClassName={styles.chrome}
        >
          <ScreenshotImage
            media={desktop}
            alt={`${imageAlt} — ${webLabel}`}
            preload={preload}
          />
        </ProductBrowserWindow>
      ) : null}
      {mobile ? (
        <div className={styles.phone}>
          <ScreenshotImage media={mobile} alt={`${imageAlt} — ${mobileLabel}`} />
        </div>
      ) : null}
    </div>
  );
}
