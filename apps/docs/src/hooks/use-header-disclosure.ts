"use client";

import { useEffect, type RefObject } from "react";

export function useHeaderDisclosure({
  open,
  close,
  headerRef,
  triggerRef,
}: {
  open: boolean;
  close: () => void;
  headerRef: RefObject<HTMLElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      close();
      triggerRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !headerRef.current?.contains(event.target)
      )
        close();
    };
    const wideLayout = window.matchMedia("(min-width: 1024px)");
    const onLayoutChange = () => {
      if (wideLayout.matches) close();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    wideLayout.addEventListener("change", onLayoutChange);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      wideLayout.removeEventListener("change", onLayoutChange);
    };
  }, [open, close, headerRef, triggerRef]);
}
