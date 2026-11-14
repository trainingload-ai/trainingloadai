"use client";

import { useEffect, useRef, useState, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ScrollableRegionProps = HTMLAttributes<HTMLElement> & {
  label: string;
  as?: "div" | "pre";
};

/** Add a keyboard stop only while this region actually needs scrolling. */
export function ScrollableRegion({
  label,
  as: Element = "div",
  className,
  onKeyDown,
  ...props
}: ScrollableRegionProps) {
  const ref = useRef<HTMLDivElement & HTMLPreElement>(null);
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () =>
      setScrollable(
        element.scrollWidth > element.clientWidth + 1 ||
          element.scrollHeight > element.clientHeight + 1,
      );
    const observer = new ResizeObserver(update);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    update();
    return () => observer.disconnect();
  }, []);
  return (
    <Element
      {...props}
      ref={ref}
      role={scrollable ? "region" : undefined}
      aria-label={scrollable ? label : undefined}
      tabIndex={scrollable ? 0 : undefined}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          event.defaultPrevented ||
          event.target !== event.currentTarget ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        )
          return;
        const element = event.currentTarget;
        if (
          element.scrollWidth <= element.clientWidth + 1 ||
          !["ArrowLeft", "ArrowRight"].includes(event.key)
        )
          return;
        event.preventDefault();
        element.scrollBy({
          left: event.key === "ArrowRight" ? 40 : -40,
          behavior: "instant",
        });
      }}
      className={cn(
        "relative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    />
  );
}
