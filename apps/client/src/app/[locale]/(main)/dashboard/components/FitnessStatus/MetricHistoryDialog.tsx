import React from "react";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
} from "@/components/ui/adaptive-dialog";
import { MobileSheet } from "@/components/mobile-app/components/MobileSheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { ArrowUpRight } from "lucide-react";
import { MetricHistoryChartByKey } from "./MetricHistoryChart";
import type { MetricKey } from "./metric-history-chart-types";

export interface MetricHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metricKey: MetricKey;
  title: string;
  currentValue: string;
  unit: string;
  description?: string;
  links?: Array<{ label: string; href: string }>;
  /** 首页移动端使用统一的 MobileSheet；桌面端仍保留 Dialog。 */
  mobileSheet?: boolean;
}

export interface MetricHistoryPanelProps {
  metricKey: MetricHistoryDialogProps["metricKey"];
  title: string;
  currentValue: string;
  unit: string;
  description?: string;
  links?: MetricHistoryDialogProps["links"];
  enabled?: boolean;
  showHeader?: boolean;
  containerClassName?: string;
}

export function MetricHistoryPanel({
  metricKey,
  title,
  currentValue,
  unit,
  description,
  links,
  enabled = true,
  showHeader = true,
  containerClassName,
}: MetricHistoryPanelProps) {
  return (
    <div className={`flex flex-col ${containerClassName ?? ""}`}>
      {showHeader && (
        <div className="flex flex-row gap-4">
          <div className="text-base font-semibold text-foreground">{title}</div>
          <div className="text-base font-bold text-primary">
            {currentValue}
            <span className="text-mobile-caption pc:text-xs font-normal text-muted-foreground ml-1">
              {unit}
            </span>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 gap-6 py-4">
        <div className="w-full shrink-0">
          {metricKey !== "paceZones" ? (
            <MetricHistoryChartByKey metricKey={metricKey} enabled={enabled} />
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto pr-2 min-h-0">
          <div className="space-y-4 text-sm text-muted-foreground bg-neutral-100 dark:bg-muted/45 p-4 rounded-md">
            <h4 className="font-semibold text-foreground">{title}</h4>
            {description ? (
              <p className="whitespace-pre-line text-mobile-caption pc:text-xs leading-relaxed">
                {description}
              </p>
            ) : null}

            {links && links.length > 0 ? (
              <div className="space-y-2 mt-4 pt-4 border-t border-border/50">
                {links.map((link) => (
                  <a
                    key={`${metricKey}-${link.href}-${link.label}`}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-mobile-caption pc:text-xs text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground"
                  >
                    <span className="inline-flex items-center gap-1">
                      {link.label}
                      <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                    </span>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MetricHistoryDialog({
  open,
  onOpenChange,
  metricKey,
  title,
  currentValue,
  unit,
  description,
  links,
  mobileSheet = false,
}: MetricHistoryDialogProps) {
  const isMobile = useIsMobile();

  if (mobileSheet && isMobile) {
    return (
      <MobileSheet
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        className="h-[85dvh]"
        contentClassName="pt-2"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-baseline gap-1.5 px-1 pt-1">
            <span className="text-2xl font-bold tabular-nums text-foreground">
              {currentValue}
            </span>
            {unit ? (
              <span className="text-mobile-caption text-muted-foreground">
                {unit}
              </span>
            ) : null}
          </div>
          <MetricHistoryPanel
            enabled={open}
            metricKey={metricKey}
            title={title}
            currentValue={currentValue}
            unit={unit}
            description={description}
            links={links}
            showHeader={false}
            containerClassName="min-h-0 flex-1"
          />
        </div>
      </MobileSheet>
    );
  }

  return (
    <AdaptiveDialog open={open} onOpenChange={onOpenChange}>
      <AdaptiveDialogContent
        desktopClassName="sm:max-w-[70vw] lg:max-w-[50vw] max-h-[85vh] flex flex-col p-0"
        mobileClassName="max-h-[85vh] overflow-hidden"
      >
        <div className="p-4">
          <MetricHistoryPanel
            enabled={open}
            metricKey={metricKey}
            title={title}
            currentValue={currentValue}
            unit={unit}
            description={description}
            links={links}
            containerClassName="min-h-0"
          />
        </div>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
