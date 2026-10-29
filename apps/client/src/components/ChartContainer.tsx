import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import CardLoader from "@/components/ui/CardLoader";
import LOGO from "@/components/ui/LOGO";
import { cn } from "@/lib/utils";

interface ChartContainerProps {
  title?: string;
  infoContent?: React.ReactNode;
  tools?: React.ReactNode;
  children?: React.ReactNode;
  isLoading?: boolean;
  height?: string;
  className?: string;
  accentColor?: string;
  titleIcon?: React.ReactNode;
  appearance?: "default" | "soft" | "mobile-soft" | "activity-detail";
}
/**
 * 通用图表容器组件
 * 提供统一的图表布局，包括标题、描述、logo和加载状态
 */
const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
  (
    {
      title,
      infoContent,
      tools,
      children,
      isLoading = false,
      height,
      className,
      accentColor,
      titleIcon,
      appearance = "default",
    },
    ref,
  ) => {
    const activityDetailAppearance = appearance === "activity-detail";
    const hasHeader = Boolean(title || titleIcon || infoContent || tools);
    const resolvedHeight =
      height ??
      (activityDetailAppearance
        ? "h-[232px] pc:h-[244px]"
        : "h-[200px] md:h-[290px]");

    return (
      <Card
        className={cn(
          "overflow-hidden",
          activityDetailAppearance
            ? "rounded-surface border border-border/55 bg-muted/25 shadow-none dark:bg-muted/35 pc:border-border/70"
            : appearance === "soft"
              ? "rounded-surface border-0 bg-neutral-100 dark:bg-muted/45"
              : appearance === "mobile-soft"
                ? "rounded-surface border-0 bg-neutral-100 dark:bg-muted/45 pc:border pc:border-border/70 pc:bg-card pc:dark:border-border/80 pc:dark:bg-card"
                : "border-border/70",
          className,
        )}
      >
        <CardContent
          className={cn(
            "flex flex-col",
            activityDetailAppearance
              ? "relative gap-0 p-0"
              : "gap-1.5 p-1.5 md:gap-2 md:p-2",
          )}
        >
          {isLoading && <CardLoader />}
          {hasHeader ? (
            <div
              className={cn(
                "flex items-center justify-between gap-2",
                activityDetailAppearance
                  ? "pointer-events-none absolute inset-x-2 top-2 z-20"
                  : "min-h-6 px-1 md:min-h-7 md:px-0",
              )}
            >
              {title || titleIcon || !activityDetailAppearance ? (
                <div
                  className={cn(
                    "flex min-w-0 items-center gap-1.5 md:gap-2",
                    activityDetailAppearance &&
                      "rounded-control bg-background/90 px-2 py-1.5 shadow-sm backdrop-blur-sm",
                  )}
                >
                  {titleIcon ? (
                    <div
                      className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md md:flex"
                      style={{
                        backgroundColor: accentColor
                          ? `${accentColor}14`
                          : undefined,
                        color: accentColor,
                      }}
                    >
                      {titleIcon}
                    </div>
                  ) : activityDetailAppearance ? null : (
                    <div className="hidden md:block">
                      <LOGO width={20} height={20} />
                    </div>
                  )}
                  {title ? (
                    <span
                      className={cn(
                        "min-w-0 truncate text-foreground/80",
                        activityDetailAppearance
                          ? "text-[15px] font-semibold leading-5 text-foreground pc:text-xs pc:font-medium"
                          : "text-mobile-caption font-medium leading-5 pc:text-xs md:text-sm",
                      )}
                    >
                      {title}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {infoContent || tools ? (
                <div
                  className={cn(
                    "flex shrink-0 items-center gap-0.5 md:gap-1",
                    activityDetailAppearance &&
                      "pointer-events-auto rounded-control bg-background/90 p-0.5 shadow-sm backdrop-blur-sm",
                  )}
                >
                  {infoContent ? (
                    <div className="flex items-center justify-center">
                      {infoContent}
                    </div>
                  ) : null}
                  {tools ? (
                    <div
                      className={cn(
                        "flex items-center justify-center",
                        activityDetailAppearance && "touch-manipulation",
                      )}
                    >
                      {tools}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <div
            className={cn(
              resolvedHeight,
              "relative w-full",
              activityDetailAppearance
                ? "bg-muted/25 dark:bg-muted/35"
                : appearance === "soft"
                  ? "bg-transparent dark:bg-transparent"
                  : appearance === "mobile-soft"
                    ? "bg-transparent dark:bg-transparent pc:bg-neutral-50/80 pc:dark:bg-muted/45"
                    : "bg-neutral-50/80 dark:bg-muted/45",
            )}
            ref={ref}
          >
            {children}
          </div>
        </CardContent>
      </Card>
    );
  },
);

ChartContainer.displayName = "ChartContainer";

export default ChartContainer;
