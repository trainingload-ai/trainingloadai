"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export function imageSetFromSrcSet(srcSet: string) {
  return `image-set(${srcSet
    .split(", ")
    .map((candidate) => {
      const [url, resolution] = candidate.split(" ");
      return `url("${url}") ${resolution}`;
    })
    .join(", ")})`;
}

type ImageStyles = CSSProperties & {
  "--image-light": string;
  "--image-dark": string;
  "--image-mobile-light"?: string;
  "--image-mobile-dark"?: string;
};

/** CSS chooses one resource before hydration, including a persisted theme override. */
export function ThemedImage({
  light,
  dark = light,
  mobileLight,
  mobileDark = mobileLight,
  alt,
  width,
  height,
  eager = false,
  preload,
  className,
}: {
  light: string;
  dark?: string;
  mobileLight?: string;
  mobileDark?: string;
  alt: string;
  width: number;
  height: number;
  eager?: boolean;
  preload?: {
    light: string;
    dark?: string;
    mobileLight?: string;
    mobileDark?: string;
  };
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  useEffect(() => {
    if (eager || !ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setNearViewport(true);
        observer.disconnect();
      },
      { rootMargin: "1250px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [eager]);
  const style: ImageStyles = {
    aspectRatio: `${width} / ${height}`,
    "--image-light": light,
    "--image-dark": dark,
    "--image-mobile-light": mobileLight ?? light,
    "--image-mobile-dark": mobileDark ?? dark,
  };
  return (
    <>
      {eager && preload ? (
        <script
          async
          fetchPriority="high"
          src={`/theme-image-preload.js?image=${encodeURIComponent(preload.light)}`}
          data-desktop-light={preload.light}
          data-desktop-dark={preload.dark ?? preload.light}
          data-mobile-light={preload.mobileLight ?? preload.light}
          data-mobile-dark={preload.mobileDark ?? preload.dark ?? preload.light}
        />
      ) : null}
      <div
        ref={ref}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        data-themed-image
        data-image-ready={eager || nearViewport}
        className={cn("themed-image", className)}
        style={style}
      />
      {!eager ? (
        <noscript>
          <style>{`.themed-image[data-image-ready="false"]{background-image:var(--selected-image)}`}</style>
        </noscript>
      ) : null}
    </>
  );
}
