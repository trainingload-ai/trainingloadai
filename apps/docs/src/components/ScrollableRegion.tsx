"use client";

import { useRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import {
  useScrollability,
  scrollRegionByKeyboard,
} from "@/lib/use-scrollability";

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
  role = "region",
  ...props
}: ScrollableRegionProps) {
  const ref = useRef<HTMLDivElement & HTMLPreElement>(null);
  const scrollable = useScrollability(ref);
  return (
    <Element
      {...props}
      ref={ref}
      role={scrollable ? role : undefined}
      aria-label={scrollable ? label : undefined}
      tabIndex={scrollable ? 0 : undefined}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        scrollRegionByKeyboard(event);
      }}
      className={cn(
        "relative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    />
  );
}
