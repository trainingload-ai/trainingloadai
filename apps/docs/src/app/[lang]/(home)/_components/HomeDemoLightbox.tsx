"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { OverlayContainerContext } from "@/components/ui/overlay-container";

const dialogIconButtonClassName =
  "grid size-9 place-items-center rounded-compact border border-border/70 bg-background/88 text-muted-foreground shadow-lg shadow-black/15 backdrop-blur transition-colors hover:text-foreground";

type LightboxBackAction = {
  ariaLabel: string;
  onClick: () => void;
};

type HomeDemoLightboxHeaderContextValue = {
  setBackAction: (action: LightboxBackAction | null) => void;
};

const HomeDemoLightboxHeaderContext =
  createContext<HomeDemoLightboxHeaderContextValue | null>(null);

export function useHomeDemoLightboxBack() {
  return useContext(HomeDemoLightboxHeaderContext)?.setBackAction ?? null;
}

type HomeDemoLightboxProps = {
  label: string;
  children: ReactNode;
  expanded: ReactNode;
  className?: string;
  dialogClassName?: string;
};

export function HomeDemoLightbox({
  label,
  children,
  expanded,
  className,
  dialogClassName,
}: HomeDemoLightboxProps) {
  const t = useTranslations("accessibility");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);
  const [open, setOpen] = useState(false);
  const [backAction, setBackActionState] = useState<LightboxBackAction | null>(
    null,
  );
  const titleId = useId();

  const setBackAction = useCallback((action: LightboxBackAction | null) => {
    setBackActionState(action);
  }, []);

  const close = useCallback(() => {
    setBackActionState(null);
    setOpen(false);
  }, []);

  const headerContext = useMemo(
    () => ({
      setBackAction,
    }),
    [setBackAction],
  );

  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  return (
    <div className={cn("client-demo-radius group relative", className)}>
      <div aria-hidden="true" inert>
        {children}
      </div>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        className="absolute inset-0 z-20 cursor-zoom-in rounded-[inherit] border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={() => {
          setOpen(true);
          // A native close event is queued; allow reopening before React receives it.
          const dialog = dialogRef.current;
          if (dialog && !dialog.open) dialog.showModal();
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 top-3 z-40 grid size-8 place-items-center rounded-compact border border-border/70 bg-background/90 text-muted-foreground opacity-90 shadow-lg shadow-black/10 backdrop-blur transition-colors group-hover:text-foreground group-hover:opacity-100 dark:bg-neutral-950/82"
      >
        <Maximize2 className="size-4" />
      </span>

      {open && typeof document !== "undefined"
        ? createPortal(
            <dialog
              ref={dialogRef}
              closedby="any"
              aria-labelledby={titleId}
              onClose={(event) => {
                if (!event.currentTarget.open) close();
              }}
              onPointerDown={(event) => {
                if ("closedBy" in HTMLDialogElement.prototype) return;
                const rect = event.currentTarget.getBoundingClientRect();
                pressedBackdrop.current =
                  event.clientX < rect.left ||
                  event.clientX > rect.right ||
                  event.clientY < rect.top ||
                  event.clientY > rect.bottom;
              }}
              onPointerUp={(event) => {
                if ("closedBy" in HTMLDialogElement.prototype) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const outside =
                  event.clientX < rect.left ||
                  event.clientX > rect.right ||
                  event.clientY < rect.top ||
                  event.clientY > rect.bottom;
                if (pressedBackdrop.current && outside)
                  event.currentTarget.close();
                pressedBackdrop.current = false;
              }}
              className={cn(
                "docs-demo-dialog client-demo-radius fixed inset-0 m-auto h-[min(860px,calc(100dvh-32px))] max-h-none w-[min(1180px,calc(100vw-24px))] max-w-none flex-col overflow-hidden rounded-overlay border border-border/80 bg-background/[0.96] p-0 text-foreground shadow-[0_28px_90px_-34px_rgba(25,27,24,0.7)] backdrop-blur-xl open:flex backdrop:bg-neutral-950/30 backdrop:backdrop-blur-md md:w-[min(1180px,calc(100vw-40px))] dark:bg-background/[0.94] dark:shadow-black/70 dark:backdrop:bg-black/65",
                dialogClassName,
              )}
            >
              <h2 id={titleId} className="sr-only">
                {label}
              </h2>

              <div className="relative z-30 flex shrink-0 items-center justify-between px-3 pt-3">
                <div className="size-9">
                  {backAction ? (
                    <button
                      type="button"
                      aria-label={backAction.ariaLabel}
                      className={dialogIconButtonClassName}
                      onClick={backAction.onClick}
                    >
                      <ArrowLeft className="size-4" />
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label={t("closePreview")}
                  autoFocus
                  className={dialogIconButtonClassName}
                  onClick={() => dialogRef.current?.close()}
                >
                  <X className="size-4" />
                </button>
              </div>

              <HomeDemoLightboxHeaderContext.Provider value={headerContext}>
                <OverlayContainerContext.Provider value={dialogRef}>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-3">
                    {expanded}
                  </div>
                </OverlayContainerContext.Provider>
              </HomeDemoLightboxHeaderContext.Provider>
            </dialog>,
            document.body,
          )
        : null}
    </div>
  );
}
