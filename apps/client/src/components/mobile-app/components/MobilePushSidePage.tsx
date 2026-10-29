"use client";

import { createPortal } from "react-dom";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type TouchEvent,
} from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export const MOBILE_SIDE_PAGE_EVENT = "trainingload:mobile-side-page";
export const MOBILE_SIDE_PAGE_REQUEST_EVENT =
  "trainingload:mobile-side-page-request";
export const MOBILE_SIDE_PAGE_EXPOSED_WIDTH = "clamp(78px, 24vw, 104px)";
export const MOBILE_SIDE_PAGE_OFFSET = `calc(100vw - ${MOBILE_SIDE_PAGE_EXPOSED_WIDTH})`;
export const MOBILE_SIDE_PAGE_TRANSITION = "duration-300 ease-out";

export function requestMobileSidePageClose() {
  window.dispatchEvent(
    new CustomEvent(MOBILE_SIDE_PAGE_REQUEST_EVENT, {
      detail: { open: false },
    }),
  );
}

export function MobileSidePageScrim({ open }: { open: boolean }) {
  const t = useTranslations("SharedUI");

  return (
    <button
      type="button"
      aria-label={t("close")}
      aria-hidden={!open}
      tabIndex={open ? 0 : -1}
      onClick={requestMobileSidePageClose}
      className={cn(
        "absolute inset-0 z-40 flex items-start justify-start bg-black/20 backdrop-blur-md transition-opacity pc:hidden motion-reduce:transition-none dark:bg-black/35",
        MOBILE_SIDE_PAGE_TRANSITION,
        open ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <span
        aria-hidden="true"
        className="mt-[calc(env(safe-area-inset-top,0px)+6px)] ml-1 grid size-11 place-items-center text-emerald-600 dark:text-emerald-400"
      >
        <X className="size-5" />
      </span>
    </button>
  );
}

export function MobilePushSidePage({
  open,
  onOpenChange,
  children,
  className,
  role,
  ariaLabelledBy,
  ariaDescribedBy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
  role?: "dialog";
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const suppressClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(
    () => () => {
      if (suppressClickTimer.current) clearTimeout(suppressClickTimer.current);
    },
    [],
  );
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(MOBILE_SIDE_PAGE_EVENT, { detail: { open } }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent(MOBILE_SIDE_PAGE_EVENT, { detail: { open: false } }),
      );
    };
  }, [open]);
  useEffect(() => {
    const handleRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      if (detail?.open === false) onOpenChange(false);
    };
    window.addEventListener(MOBILE_SIDE_PAGE_REQUEST_EVENT, handleRequest);
    return () =>
      window.removeEventListener(MOBILE_SIDE_PAGE_REQUEST_EVENT, handleRequest);
  }, [onOpenChange]);

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = Math.abs(touch.clientY - start.y);
    if (dx < -64 && dy < 42) {
      suppressClick.current = true;
      if (suppressClickTimer.current) clearTimeout(suppressClickTimer.current);
      suppressClickTimer.current = setTimeout(() => {
        suppressClick.current = false;
        suppressClickTimer.current = null;
      }, 180);
      onOpenChange(false);
    }
  };
  const handleClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (!suppressClick.current) return;
    event.preventDefault();
    event.stopPropagation();
  };

  if (!mounted) return null;
  return createPortal(
    <>
      <aside
        role={role}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-hidden={!open}
        onClickCapture={handleClickCapture}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => {
          touchStart.current = null;
        }}
        className={cn(
          "fixed inset-y-0 left-0 z-40 overflow-y-auto overscroll-contain bg-background px-[14px] pb-[max(env(safe-area-inset-bottom),16px)] pt-[calc(max(env(safe-area-inset-top),12px)+72px)] transition-transform pc:hidden motion-reduce:transition-none",
          MOBILE_SIDE_PAGE_TRANSITION,
          open ? "translate-x-0" : "-translate-x-full pointer-events-none",
          className,
        )}
        style={{ width: MOBILE_SIDE_PAGE_OFFSET }}
      >
        {children}
      </aside>
    </>,
    document.body,
  );
}
