"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

export function DeferredMount({
  children,
  fallback = null,
  rootMargin = "320px 0px",
}: {
  children: ReactNode;
  fallback?: ReactNode;
  rootMargin?: string;
}) {
  const boundaryRef = useRef<HTMLDivElement>(null);
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    if (shouldMount) return;
    const boundary = boundaryRef.current;
    if (!boundary || typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => setShouldMount(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShouldMount(true);
        observer.disconnect();
      },
      { rootMargin },
    );
    observer.observe(boundary);
    return () => observer.disconnect();
  }, [rootMargin, shouldMount]);

  return <div ref={boundaryRef}>{shouldMount ? children : fallback}</div>;
}
