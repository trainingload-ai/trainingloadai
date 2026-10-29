"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogTrigger,
} from "@/components/ui/adaptive-dialog";
import { MobileSheet } from "@/components/mobile-app/components/MobileSheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { FitnessStatusMetricKey } from "@/hooks/useFitnessStatusConfig";
import type { FitnessStatCard } from "./SortableFitnessStatCard";

export function FitnessStatusAddMetricDialog({
  open,
  onOpenChange,
  metricKeys,
  statsByKey,
  selectedMetricKeys,
  onAddMetric,
  renderSubContent,
  showTrigger = true,
  mobileSheet = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metricKeys: FitnessStatusMetricKey[];
  statsByKey: Map<FitnessStatusMetricKey, FitnessStatCard>;
  selectedMetricKeys: Set<FitnessStatusMetricKey>;
  onAddMetric: (key: FitnessStatusMetricKey) => void;
  renderSubContent: (stat: FitnessStatCard) => React.ReactNode;
  /** 为 false 时仅通过 open 控制，不渲染默认虚线触发卡片 */
  showTrigger?: boolean;
  /** 首页受控模式使用统一的 MobileSheet；桌面端仍保留 Dialog。 */
  mobileSheet?: boolean;
}) {
  const t = useTranslations("dashboard.fitnessStatus");
  const isMobile = useIsMobile();

  const metricCards = (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {metricKeys.map((key) => {
        const stat = statsByKey.get(key);
        if (!stat) return null;
        const isSelected = selectedMetricKeys.has(key);
        return (
          <Card
            key={key}
            className={cn(
              "relative overflow-hidden",
              isSelected
                ? "cursor-not-allowed opacity-50"
                : "tap-feedback hover:bg-neutral-200 dark:hover:bg-muted",
            )}
            onClick={() => {
              if (isSelected) return;
              onAddMetric(key);
              onOpenChange(false);
            }}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <div className={cn("rounded-full", stat.bgColor)}>
                <stat.icon className={cn("h-4 w-4", stat.color)} />
              </div>
            </CardHeader>
            <CardContent className="lg:p-2">
              <div className="text-2xl font-bold">
                {stat.value}
                {stat.unit ? (
                  <span className="ml-1 text-mobile-caption font-normal text-muted-foreground pc:text-xs">
                    {stat.unit}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center justify-between">
                {renderSubContent(stat)}
                <div className="w-6 shrink-0" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  if (mobileSheet && isMobile && !showTrigger) {
    return (
      <MobileSheet
        open={open}
        onOpenChange={onOpenChange}
        title={t("addMetric")}
        className="h-[85dvh]"
      >
        {metricCards}
      </MobileSheet>
    );
  }

  return (
    <AdaptiveDialog open={open} onOpenChange={onOpenChange}>
      {showTrigger ? (
        <AdaptiveDialogTrigger asChild>
          <Card className="tap-feedback relative overflow-hidden col-span-1 border-dashed border-2 bg-transparent hover:bg-neutral-200 dark:hover:bg-muted">
            <CardContent className="h-full flex flex-col items-center justify-center gap-2 py-6">
              <Plus className="h-5 w-5 text-muted-foreground" />
              <div className="text-sm text-muted-foreground">
                {t("addMetric")}
              </div>
            </CardContent>
          </Card>
        </AdaptiveDialogTrigger>
      ) : null}
      <AdaptiveDialogContent
        desktopClassName="sm:max-w-[80vw] lg:max-w-[70vw] max-h-[85vh] overflow-hidden flex flex-col p-0"
        mobileClassName="max-h-[85vh] overflow-hidden"
      >
        <div className="p-4 sm:p-6 border-b">
          <AdaptiveDialogHeader>
            <AdaptiveDialogTitle>{t("addMetric")}</AdaptiveDialogTitle>
          </AdaptiveDialogHeader>
        </div>
        <div className="overflow-y-auto p-4 sm:p-6">{metricCards}</div>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
