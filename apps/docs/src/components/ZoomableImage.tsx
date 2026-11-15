"use client";
/* eslint-disable @next/next/no-img-element */

import { X, ZoomIn } from "lucide-react";
import {
  type ComponentPropsWithoutRef,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

type ImportedImageSource = { src: string; width?: number; height?: number };
type ZoomableImageProps = Omit<ComponentPropsWithoutRef<"img">, "src"> & {
  src?: ComponentPropsWithoutRef<"img">["src"] | ImportedImageSource;
  containerClassName?: string;
  overlayClassName?: string;
};

export function ZoomableImage({
  alt = "",
  className,
  containerClassName,
  overlayClassName,
  onClick,
  src,
  width,
  height,
  loading = "lazy",
  decoding = "async",
  ...props
}: ZoomableImageProps) {
  const t = useTranslations("accessibility");
  const [open, setOpen] = useState(false);
  const imported =
    typeof src === "object" && src !== null && "src" in src ? src : undefined;
  const resolvedSrc = imported?.src ?? (src as string | undefined);
  const imageWidth = width ?? imported?.width;
  const imageHeight = height ?? imported?.height;

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          if (!event.defaultPrevented) setOpen(true);
        }}
        className={cn(
          "group relative block max-w-full cursor-zoom-in overflow-hidden rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          containerClassName,
        )}
        aria-label={
          alt ? t("previewImageNamed", { description: alt }) : t("previewImage")
        }
        aria-haspopup="dialog"
      >
        <img
          {...props}
          alt={alt}
          src={resolvedSrc}
          width={imageWidth}
          height={imageHeight}
          loading={loading}
          decoding={decoding}
          onClick={onClick}
          className={cn(
            "max-w-full rounded-control transition-transform duration-200 group-hover:scale-[1.01] motion-reduce:transform-none motion-reduce:transition-none",
            className,
          )}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
        >
          <ZoomIn className="size-3.5" />
          {t("preview")}
        </span>
      </button>
      {open
        ? createPortal(
            <ImagePreviewDialog
              alt={alt}
              src={resolvedSrc}
              width={imageWidth}
              height={imageHeight}
              overlayClassName={overlayClassName}
              onClose={() => setOpen(false)}
              imageProps={props}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function ImagePreviewDialog({
  alt,
  src,
  width,
  height,
  overlayClassName,
  onClose,
  imageProps,
}: {
  alt: string;
  src?: string;
  width?: number | string;
  height?: number | string;
  overlayClassName?: string;
  onClose: () => void;
  imageProps: ComponentPropsWithoutRef<"img">;
}) {
  const t = useTranslations("accessibility");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={dialogRef}
      onClose={(event) => {
        if (!event.currentTarget.open) onClose();
      }}
      aria-labelledby={titleId}
      className={cn(
        "docs-image-preview fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none items-center justify-center overflow-auto border-0 bg-transparent p-4 text-white open:flex backdrop:bg-black/85 backdrop:backdrop-blur-sm sm:p-6",
        overlayClassName,
      )}
      onPointerDown={(event) => {
        // Only the empty surface of this full-viewport dialog is a backdrop.
        pressedBackdrop.current = event.target === event.currentTarget;
      }}
      onPointerUp={(event) => {
        if (pressedBackdrop.current && event.target === event.currentTarget)
          event.currentTarget.close();
        pressedBackdrop.current = false;
      }}
    >
      <h2 id={titleId} className="sr-only">
        {t("imagePreview")}
      </h2>
      <button
        type="button"
        onClick={() => dialogRef.current?.close()}
        className="absolute right-4 top-4 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        aria-label={t("closePreview")}
      >
        <X aria-hidden="true" className="size-5" />
      </button>
      <div className="flex max-h-full w-full max-w-7xl flex-col items-center gap-3">
        <img
          {...imageProps}
          alt={alt}
          src={src}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          className="max-h-[85dvh] w-auto max-w-full rounded-control object-contain shadow-2xl"
        />
        {alt ? (
          <p className="max-w-4xl text-center text-sm text-white/85">{alt}</p>
        ) : null}
      </div>
    </dialog>
  );
}
