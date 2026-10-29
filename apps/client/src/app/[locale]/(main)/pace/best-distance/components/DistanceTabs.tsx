"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface DistanceTabsProps {
  activeDistance: string | null;
  onDistanceChange: (distance: string) => void;
  className?: string;
  options: { label: string; value: string; translationKey?: string }[];
}

export function DistanceTabs({
  activeDistance,
  onDistanceChange,
  className,
  options,
}: DistanceTabsProps) {
  const t = useTranslations("bestDistance");
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (options.length > 0) {
      const isValid = options.some((o) => o.value === activeDistance);
      if (!isValid) {
        onDistanceChange(options[0].value);
      }
    }
  }, [options, onDistanceChange, activeDistance]);

  React.useEffect(() => {
    if (activeDistance && scrollContainerRef.current) {
      const activeBtn = scrollContainerRef.current.querySelector(
        `[data-value="${activeDistance}"]`,
      ) as HTMLElement;

      if (activeBtn) {
        const container = scrollContainerRef.current;
        const scrollLeft =
          activeBtn.offsetLeft -
          container.offsetWidth / 2 +
          activeBtn.offsetWidth / 2;

        container.scrollTo({
          left: scrollLeft,
          behavior: "smooth",
        });
      }
    }
  }, [activeDistance]);

  if (options.length === 0) return null;

  return (
    <div className={cn("w-full", className)}>
      <div
        ref={scrollContainerRef}
        className="no-scrollbar -mx-1 flex w-full overflow-x-auto px-1 scroll-smooth"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <div className="flex min-w-full w-max items-center gap-1.5">
          {options.map((option) => {
            const isActive = activeDistance === option.value;
            const label = option.translationKey
              ? t(`distances.${option.translationKey}`)
              : option.label;
            return (
              <button
                key={option.value}
                type="button"
                data-value={option.value}
                onClick={() => onDistanceChange(option.value)}
                className={cn(
                  "min-h-9 cursor-pointer select-none whitespace-nowrap rounded-md px-3 text-mobile-caption pc:text-xs font-medium transition-colors outline-none sm:min-h-8 sm:px-2.5",
                  isActive
                    ? "bg-foreground text-background"
                    : "bg-neutral-200/70 text-muted-foreground hover:bg-neutral-300 dark:bg-muted dark:hover:bg-muted/80",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
