"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import LOGO from "@/components/LOGO";
import { cn } from "@/lib/utils";

export function DemoChartContainer({
  title,
  infoContent,
  tools,
  children,
  height = "h-[200px] md:h-[290px]",
  className,
  accentColor,
  titleIcon,
}: {
  title?: string;
  infoContent?: React.ReactNode;
  tools?: React.ReactNode;
  children?: React.ReactNode;
  height?: string;
  className?: string;
  accentColor?: string;
  titleIcon?: React.ReactNode;
}) {
  return (
    <Card className={cn("overflow-hidden border-border/70", className)}>
      <CardContent className="flex flex-col gap-1.5 p-1.5 md:gap-2 md:p-2">
        <div className="flex min-h-6 items-center justify-between gap-2 px-1 md:min-h-7 md:px-0">
          <div className="flex min-w-0 items-center gap-1.5 md:gap-2">
            {titleIcon ? (
              <div
                className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-compact md:flex"
                style={{
                  backgroundColor: accentColor ? `${accentColor}14` : undefined,
                  color: accentColor,
                }}
              >
                {titleIcon}
              </div>
            ) : (
              <div className="hidden md:block">
                <LOGO width={20} height={20} />
              </div>
            )}
            {title ? (
              <span className="min-w-0 truncate text-xs font-medium leading-5 text-foreground/80 md:text-sm">
                {title}
              </span>
            ) : null}
          </div>
          {infoContent || tools ? (
            <div className="flex shrink-0 items-center gap-0.5 md:gap-1">
              {infoContent}
              {tools}
            </div>
          ) : null}
        </div>
        <div
          className={cn(
            height,
            "relative rounded-compact bg-neutral-50/80 dark:bg-muted/45",
          )}
        >
          {children}
        </div>
      </CardContent>
    </Card>
  );
}
