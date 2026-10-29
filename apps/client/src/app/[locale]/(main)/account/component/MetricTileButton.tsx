import * as React from "react";

import { cn } from "@/lib/utils";

export type MetricTileButtonProps =
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    title: React.ReactNode;
    value: React.ReactNode;
    secondaryValue?: React.ReactNode;
    mutedValue?: boolean;
    tabularValue?: boolean;
    titleClassName?: string;
    valueClassName?: string;
    secondaryValueClassName?: string;
    secondaryValuePlacement?: "inline" | "bottom-right";
    disabledReason?: string;
  };

export const MetricTileButton = React.forwardRef<
  HTMLButtonElement,
  MetricTileButtonProps
>(
  (
    {
      title,
      value,
      secondaryValue,
      mutedValue,
      tabularValue,
      className,
      titleClassName,
      valueClassName,
      secondaryValueClassName,
      secondaryValuePlacement = "inline",
      disabledReason,
      type = "button",
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        title={disabledReason}
        className={cn(
          "relative flex w-full flex-col gap-4 rounded-md bg-background px-3 py-3 text-left transition-colors hover:bg-neutral-200 dark:hover:bg-muted",
          secondaryValuePlacement === "bottom-right" && "pb-5",
          className,
        )}
        {...props}
      >
        <div
          className={cn(
            "text-mobile-caption pc:text-[11px] md:text-mobile-caption text-muted-foreground truncate",
            titleClassName,
          )}
        >
          {title}
        </div>
        <div className="flex items-start justify-between gap-2">
          <div
            className={cn(
              "text-sm leading-snug truncate",
              tabularValue && "tabular-nums",
              mutedValue && "text-muted-foreground font-medium",
              valueClassName,
            )}
          >
            {value}
          </div>
          {secondaryValue ? (
            <div
              className={cn(
                "text-mobile-caption pc:text-[11px] text-muted-foreground shrink-0 tabular-nums",
                secondaryValuePlacement === "bottom-right" &&
                  "absolute bottom-2 right-3",
                secondaryValueClassName,
              )}
            >
              {secondaryValue}
            </div>
          ) : null}
        </div>
      </button>
    );
  },
);

MetricTileButton.displayName = "MetricTileButton";
