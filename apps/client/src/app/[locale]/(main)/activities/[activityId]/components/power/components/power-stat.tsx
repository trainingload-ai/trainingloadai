import React from "react";

interface PowerStatProps {
  title: string;
  value: string | number | React.ReactNode;
  unit?: string;
  color?: string;
  extraRight?: React.ReactNode;
  extraRightPlain?: boolean;
  extraRightNoStyle?: boolean;
  className?: string;
  variant?: "grid" | "row";
}

/**
 * 功率统计组件，用于显示功率相关的统计数据
 */
const PowerStat: React.FC<PowerStatProps> = ({
  title,
  value,
  unit,
  color,
  extraRight,
  extraRightPlain,
  extraRightNoStyle,
  className,
  variant = "grid",
}) => {
  const layoutClasses =
    variant === "row"
      ? "min-w-[160px] flex-shrink-0 border-r border-neutral-100 last:border-r-0 dark:border-neutral-600"
      : "h-full";

  return (
    <div
      className={`flex min-w-0 flex-col bg-card ${layoutClasses} ${className || ""}`}
    >
      <div className="flex min-w-0 flex-col gap-1.5 px-2 py-2 md:gap-6 md:px-3">
        <div className="flex min-w-0 items-center justify-between gap-2 text-left text-mobile-caption pc:text-xs font-medium text-muted-foreground md:text-sm">
          <div className="flex min-w-0 items-center gap-1">
            {color && (
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-full md:h-3 md:w-3"
                style={{ backgroundColor: color }}
              />
            )}
            <span className="min-w-0 truncate">{title}</span>
          </div>
          {extraRight && !extraRightPlain ? (
            <div
              className={
                extraRightNoStyle
                  ? "ml-2 shrink-0"
                  : "ml-2 shrink-0 rounded-sm border border-neutral-200 bg-neutral-50/70 px-1.5 py-0.5 text-mobile-unit pc:text-[10px] text-muted-foreground dark:border-neutral-700 dark:bg-neutral-800/40 md:text-mobile-caption"
              }
            >
              {extraRight}
            </div>
          ) : null}
        </div>
        <div className="flex min-w-0 items-center justify-between gap-1 text-base font-medium md:gap-2 md:text-2xl">
          <div className="flex min-w-0 items-baseline gap-1">
            <span className="min-w-0 truncate font-medium text-foreground">
              {value || "--"}
            </span>
            {unit && (
              <span className="shrink-0 text-mobile-caption pc:text-xs text-muted-foreground">
                {unit}
              </span>
            )}
          </div>
          {extraRightPlain ? (
            <div className="flex shrink-0 items-center justify-end">
              {extraRight}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default PowerStat;
