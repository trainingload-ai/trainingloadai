"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";

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

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, close]);

  return (
    <div className={cn("client-demo-radius group relative", className)}>
      <div aria-hidden="true" inert>
        {children}
      </div>
      <button
        type="button"
        aria-label={label}
        className="absolute inset-0 z-20 cursor-zoom-in rounded-[inherit] border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={() => setOpen(true)}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 top-3 z-40 grid size-8 place-items-center rounded-compact border border-border/70 bg-background/90 text-muted-foreground opacity-90 shadow-lg shadow-black/10 backdrop-blur transition-colors group-hover:text-foreground group-hover:opacity-100 dark:bg-neutral-950/82"
      >
        <Maximize2 className="size-4" />
      </span>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="client-demo-radius fixed inset-0 z-[100] flex items-center justify-center p-3 md:p-5">
              <button
                type="button"
                aria-label="Close"
                className="absolute inset-0 bg-neutral-950/30 backdrop-blur-md dark:bg-black/65"
                onClick={close}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className={cn(
                  "relative z-10 flex h-[min(860px,calc(100dvh-32px))] w-[min(1180px,calc(100vw-24px))] flex-col overflow-hidden rounded-overlay border border-border/80 bg-background/[0.96] text-foreground shadow-[0_28px_90px_-34px_rgba(25,27,24,0.7)] backdrop-blur-xl md:w-[min(1180px,calc(100vw-40px))] dark:bg-background/[0.94] dark:shadow-black/70",
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
                    aria-label="Close"
                    className={dialogIconButtonClassName}
                    onClick={close}
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <HomeDemoLightboxHeaderContext.Provider value={headerContext}>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-3">
                    {expanded}
                  </div>
                </HomeDemoLightboxHeaderContext.Provider>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
