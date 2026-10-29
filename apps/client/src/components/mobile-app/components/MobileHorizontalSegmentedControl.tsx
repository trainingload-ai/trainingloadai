"use client";

import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type SegmentValue = string | number;

export type MobileHorizontalSegment<T extends SegmentValue> = {
  value: T;
  label: string;
};

export function MobileHorizontalSegmentedControl<T extends SegmentValue>({
  value,
  options,
  onValueChange,
  ariaLabel,
  className,
  itemClassName,
}: {
  value: T;
  options: readonly MobileHorizontalSegment<T>[];
  onValueChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  itemClassName?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<T, HTMLButtonElement>());

  const centerOption = useCallback((nextValue: T, behavior: ScrollBehavior) => {
    const scroller = scrollerRef.current;
    const button = buttonRefs.current.get(nextValue);
    if (!scroller || !button || typeof scroller.scrollTo !== "function") {
      return;
    }
    const buttonRect = button.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    scroller.scrollTo({
      behavior,
      left:
        scroller.scrollLeft +
        buttonRect.left -
        scrollerRect.left -
        (scroller.clientWidth - buttonRect.width) / 2,
    });
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      centerOption(value, reduceMotion ? "auto" : "smooth");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [centerOption, value]);

  const selectOption = (nextValue: T) => {
    onValueChange(nextValue);
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    centerOption(nextValue, reduceMotion ? "auto" : "smooth");
  };

  return (
    <div
      className={cn("overflow-hidden rounded-control-lg bg-muted p-0.5", className)}
    >
      <div
        ref={scrollerRef}
        data-mobile-horizontal-scroll
        aria-label={ariaLabel}
        className="touch-pan-x overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max min-w-full">
          {options.map((option) => {
            const selected = value === option.value;
            return (
              <button
                key={String(option.value)}
                ref={(element) => {
                  if (element) buttonRefs.current.set(option.value, element);
                  else buttonRefs.current.delete(option.value);
                }}
                type="button"
                aria-pressed={selected}
                onClick={() => selectOption(option.value)}
                className={cn(
                  "h-7 w-[68px] shrink-0 touch-manipulation whitespace-nowrap rounded-lg px-2 text-mobile-control font-medium outline-none transition-[background-color,color,box-shadow] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-muted",
                  selected
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground active:bg-background/70",
                  itemClassName,
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
