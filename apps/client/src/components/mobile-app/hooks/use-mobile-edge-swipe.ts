"use client";

import { useEffect, useRef } from "react";
import { MOBILE_MEDIA_QUERY } from "@/hooks/use-mobile";

const EDGE_START_PX = 28;
const OPEN_DISTANCE_PX = 64;
const VERTICAL_TOLERANCE_PX = 42;

export function useMobileEdgeSwipe(
  onOpen: () => void,
  enabled: boolean = true,
) {
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; y: number } | null = null;

    const handleStart = (event: TouchEvent) => {
      if (!window.matchMedia(MOBILE_MEDIA_QUERY).matches) return;
      if (
        event.target instanceof Element &&
        event.target.closest("[data-mobile-horizontal-scroll]")
      ) {
        start = null;
        return;
      }
      const touch = event.touches[0];
      start =
        touch && touch.clientX <= EDGE_START_PX
          ? { x: touch.clientX, y: touch.clientY }
          : null;
    };
    const handleMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!start || !touch) return;
      const dx = touch.clientX - start.x;
      const dy = Math.abs(touch.clientY - start.y);
      if (dx < OPEN_DISTANCE_PX || dy > VERTICAL_TOLERANCE_PX) return;
      start = null;
      onOpenRef.current();
    };
    const handleEnd = () => {
      start = null;
    };

    window.addEventListener("touchstart", handleStart, { passive: true });
    window.addEventListener("touchmove", handleMove, { passive: true });
    window.addEventListener("touchend", handleEnd, { passive: true });
    window.addEventListener("touchcancel", handleEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleStart);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
      window.removeEventListener("touchcancel", handleEnd);
    };
  }, [enabled]);
}
