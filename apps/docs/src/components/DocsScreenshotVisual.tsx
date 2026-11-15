"use client";

/* eslint-disable @next/next/no-img-element */

import { getImageProps } from "next/image";
import { ThemedImage, imageSetFromSrcSet } from "@/components/ThemedImage";
import { ProductBrowserWindow } from "@/components/ProductBrowserChrome";
import type { DocsScreenshotMedia } from "@/lib/docs-screenshot";
import { cn } from "@/lib/utils";
import styles from "./DocsScreenshot.module.css";

function ScreenshotImage({
  media,
  alt,
  preload = false,
  renderWidth,
}: {
  media: DocsScreenshotMedia;
  alt: string;
  preload?: boolean;
  renderWidth: number;
}) {
  const imageProps = (src: string) =>
    getImageProps({
      src,
      alt,
      width: renderWidth,
      height: Math.round((renderWidth * media.height) / media.width),
    }).props;
  const light = imageProps(media.imageSrc);
  const dark = media.darkImageSrc ? imageProps(media.darkImageSrc) : undefined;
  return dark ? (
    <ThemedImage
      light={imageSetFromSrcSet(light.srcSet!)}
      dark={imageSetFromSrcSet(dark.srcSet!)}
      alt={alt}
      width={media.width}
      height={media.height}
      eager={preload}
      preload={{ light: light.srcSet!, dark: dark.srcSet! }}
      className="w-full"
    />
  ) : (
    <img
      src={media.imageSrc}
      alt={alt}
      width={media.width}
      height={media.height}
      loading={preload ? "eager" : "lazy"}
      decoding="async"
      className="block h-auto w-full"
    />
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
  imageWidth = 768,
}: {
  desktop?: DocsScreenshotMedia;
  mobile?: DocsScreenshotMedia;
  address: string;
  imageAlt: string;
  webLabel: string;
  mobileLabel: string;
  preload?: boolean;
  imageWidth?: number;
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
            renderWidth={imageWidth}
          />
        </ProductBrowserWindow>
      ) : null}
      {mobile ? (
        <div className={styles.phone}>
          <ScreenshotImage
            media={mobile}
            alt={`${imageAlt} — ${mobileLabel}`}
            renderWidth={384}
          />
        </div>
      ) : null}
    </div>
  );
}
