"use client";
/* eslint-disable @next/next/no-img-element */

import { X, ZoomIn } from "lucide-react";
import { type ComponentPropsWithoutRef, useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type ImportedImageSource = {
  src: string;
};

type ZoomableImageProps = Omit<ComponentPropsWithoutRef<"img">, "src"> & {
  src?: ComponentPropsWithoutRef<"img">["src"] | ImportedImageSource;
  containerClassName?: string;
  overlayClassName?: string;
};

function resolveImageSource(src: ZoomableImageProps["src"]) {
  return typeof src === "object" && src !== null && "src" in src
    ? src.src
    : src;
}

export function ZoomableImage({
  alt = "",
  className,
  containerClassName,
  overlayClassName,
  onClick,
  src,
  ...props
}: ZoomableImageProps) {
  const [open, setOpen] = useState(false);
  const resolvedSrc = resolveImageSource(src);

  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const openPreview = () => {
    onClick?.({
      type: "click",
    } as React.MouseEvent<HTMLImageElement>);
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={openPreview}
        className={cn(
          "group relative block max-w-full cursor-zoom-in overflow-hidden rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-neutral-600/70 dark:focus-visible:ring-offset-neutral-950",
          containerClassName,
        )}
        aria-label={alt ? `Preview image: ${alt}` : "Preview image"}
      >
        <img
          alt={alt}
          src={resolvedSrc}
          className={cn(
            "max-w-full rounded-control transition-transform duration-200 group-hover:scale-[1.01]",
            className,
          )}
          {...props}
        />
        <span className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <ZoomIn className="h-3.5 w-3.5" />
          Preview
        </span>
      </button>

      {open ? (
        <div
          className={cn(
            "fixed inset-0 z-100 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm sm:p-6",
            overlayClassName,
          )}
          role="dialog"
          aria-modal="true"
          aria-label={alt ? `Image preview: ${alt}` : "Image preview"}
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>

          <div
            className="flex max-h-full w-full max-w-7xl flex-col items-center gap-3"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              alt={alt}
              src={resolvedSrc}
              className="max-h-[85vh] w-auto max-w-full rounded-control object-contain shadow-2xl"
              {...props}
            />
            {alt ? (
              <p className="max-w-4xl text-center text-sm text-white/85">
                {alt}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
