"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import dayjs from "dayjs";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { useStore } from "@/lib/store";
import {
  type PMCData,
  useDashboardPMC,
  usePMCData,
  useSmartCalculatePMC,
} from "@/api/usePMC";
import { SubHeader } from "@/components/SubHeader/SubHeader";
import { Button } from "@/components/ui/button";
import PMCStat from "./components/PMCStat";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMobileMetricSubpageNavigation } from "@/components/metrics/use-mobile-metric-subpage-navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FitnessStatusStatCard } from "../dashboard/components/FitnessStatus/components/FitnessStatusStatCard";
import { FitnessStatusCardSubContent } from "../dashboard/components/FitnessStatus/components/FitnessStatusCardSubContent";
import {
  buildFitnessStatusStats,
  createInitialMetricDialogState,
  type MetricClickData,
} from "../dashboard/components/FitnessStatus/fitness-status-model";

const PMC_MOBILE_RANGES = [30, 60, 90] as const;
const PMC_MOBILE_INSIGHT_KEYS = new Set(["atl", "ctl", "acRatio", "monotony"]);

function PmcMobileRangeMenu() {
  const t = useTranslations("dateSelector");
  const { pmcFilters, setPmcTime } = useStore();
  const time = pmcFilters.time;
  const selectedDays =
    time.mode === "range"
      ? (PMC_MOBILE_RANGES.find(
          (days) => time.wellKnown === `Last ${days} days`,
        ) ??
        PMC_MOBILE_RANGES.find(
          (days) =>
            dayjs(time.endDate)
              .startOf("day")
              .diff(dayjs(time.startDate).startOf("day"), "day") +
              1 ===
            days,
        ))
      : undefined;
  const resolvedDays = selectedDays ?? 30;
  const getRangeLabel = (days: (typeof PMC_MOBILE_RANGES)[number]) => {
    const key = `last${days}Days` as const;
    return t.has(key) ? t(key) : `${days} ${t("day")}`;
  };
  const selectedLabel = getRangeLabel(resolvedDays);
  const setRange = (days: (typeof PMC_MOBILE_RANGES)[number]) => {
    setPmcTime({
      mode: "range",
      startDate: dayjs()
        .subtract(days - 1, "day")
        .toISOString(),
      endDate: dayjs().toISOString(),
      ...(days === 90 ? {} : { wellKnown: `Last ${days} days` as const }),
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild unstyled>
        <button
          type="button"
          aria-label={selectedLabel}
          className="inline-flex h-8 max-w-28 -translate-x-5 items-center gap-1 rounded-compact bg-transparent px-2 text-[13px] font-medium text-emerald-600 transition-colors active:bg-emerald-500/10 dark:text-emerald-400 dark:active:bg-emerald-400/10"
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown
            className="size-3.5 shrink-0 opacity-80"
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-40 rounded-control border-border/60 bg-background/95 p-1.5 shadow-xl backdrop-blur-xl dark:bg-zinc-900/95"
      >
        <DropdownMenuRadioGroup
          value={String(resolvedDays)}
          onValueChange={(value) => {
            const days = Number(value);
            if (days === 30 || days === 60 || days === 90) setRange(days);
          }}
        >
          {PMC_MOBILE_RANGES.map((days) => (
            <DropdownMenuRadioItem
              key={days}
              value={String(days)}
              className="rounded-compact py-2 text-sm"
            >
              {getRangeLabel(days)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PmcChartLoading() {
  return (
    <div
      className="h-[200px] animate-pulse rounded-md border border-border/70 bg-muted/40 md:h-[290px]"
      aria-hidden="true"
    />
  );
}

const FitnessChart = dynamic(() => import("./components/FitnessChart"), {
  loading: PmcChartLoading,
});
const FatigueChart = dynamic(() => import("./components/FatigueChart"), {
  loading: PmcChartLoading,
});
const FormChart = dynamic(() => import("./components/FormChart"), {
  loading: PmcChartLoading,
});
const PMCCombinedChart = dynamic(
  () => import("./components/PMCCombinedChart"),
  { loading: PmcChartLoading },
);
const MetricHistoryDialog = dynamic(
  () =>
    import("../dashboard/components/FitnessStatus/MetricHistoryDialog").then(
      (module) => module.MetricHistoryDialog,
    ),
  { ssr: false },
);

type CombinedChartProps = {
  data: PMCData[];
  isLoading?: boolean;
  error?: Error | null;
};

function DeferredPmcCombinedChart(props: CombinedChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (shouldLoad) return;
    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => setShouldLoad(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div ref={containerRef}>
      {shouldLoad ? <PMCCombinedChart {...props} /> : <PmcChartLoading />}
    </div>
  );
}

type PmcZone =
  | "danger"
  | "optimal"
  | "neutral"
  | "fresh"
  | "peak"
  | "transition";

const pmcZoneStyles: Record<PmcZone, string> = {
  danger: "bg-red-500/15 text-red-600 dark:bg-red-500/20 dark:text-red-400",
  optimal:
    "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
  neutral:
    "bg-slate-500/15 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300",
  fresh: "bg-sky-500/15 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400",
  peak: "bg-violet-500/15 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400",
  transition:
    "bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
};

const pmcZoneFillColors: Record<PmcZone, { light: string; dark: string }> = {
  danger: { light: "#f87171", dark: "#f87171" },
  optimal: { light: "#10b981", dark: "#34d399" },
  neutral: { light: "#94a3b8", dark: "#cbd5e1" },
  fresh: { light: "#0ea5e9", dark: "#38bdf8" },
  peak: { light: "#8b5cf6", dark: "#a78bfa" },
  transition: { light: "#f59e0b", dark: "#fbbf24" },
};

const PMC_TSB_TRACK_SEGMENTS = [
  { left: 0, width: 12.5, rgb: "248, 113, 113" },
  { left: 12.5, width: 25, rgb: "16, 185, 129" },
  { left: 37.5, width: 18.75, rgb: "203, 213, 225" },
  { left: 56.25, width: 12.5, rgb: "14, 165, 233" },
  { left: 68.75, width: 12.5, rgb: "139, 92, 246" },
  { left: 81.25, width: 18.75, rgb: "245, 158, 11" },
] as const;

function PmcMobileTsbBar({
  fillPercent,
  zone,
}: {
  fillPercent: number;
  zone: PmcZone;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  return (
    <div
      className="relative h-4 w-full overflow-hidden rounded-full"
      style={{
        backgroundColor: dark
          ? "rgba(255, 255, 255, 0.10)"
          : "rgba(228, 228, 231, 0.80)",
        boxShadow: `inset 0 0 0 1px ${dark ? "rgba(255, 255, 255, 0.10)" : "rgba(228, 228, 231, 0.80)"}`,
      }}
      aria-hidden="true"
    >
      {PMC_TSB_TRACK_SEGMENTS.map((segment) => (
        <span
          key={segment.left}
          className="absolute inset-y-0"
          style={{
            left: `${segment.left}%`,
            width: `${segment.width}%`,
            backgroundColor: `rgba(${segment.rgb}, ${dark ? 0.3 : 0.2})`,
          }}
        />
      ))}
      {[12.5, 37.5, 56.25, 68.75, 81.25].map((left) => (
        <span
          key={left}
          className="absolute top-0 h-4 w-px"
          style={{
            left: `${left}%`,
            backgroundColor: dark ? "rgba(255, 255, 255, 0.15)" : "#d4d4d8",
          }}
        />
      ))}
      <span
        className="absolute left-0 top-0 h-4 rounded-full"
        style={{
          width: `${Math.min(100, Math.max(0, fillPercent))}%`,
          backgroundColor: pmcZoneFillColors[zone][dark ? "dark" : "light"],
        }}
      />
    </div>
  );
}

function formatPmcValue(value: number | null | undefined, signed = false) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  const rounded = Math.round(value);
  return signed && rounded > 0 ? `+${rounded}` : String(rounded);
}

function PmcMobileTrendLegend({ atl, ctl }: { atl?: number; ctl?: number }) {
  const t = useTranslations("PMC");
  return (
    <div className="ml-auto flex shrink-0 items-center justify-end gap-3">
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
        <span className="size-2 rounded-full bg-sky-500" aria-hidden="true" />
        <span>
          {t("fitness.title")}{" "}
          <strong className="font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
            {formatPmcValue(ctl)}
          </strong>
        </span>
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
        <span
          className="size-2 rounded-full bg-violet-500"
          aria-hidden="true"
        />
        <span>
          {t("fatigue.title")}{" "}
          <strong className="font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
            {formatPmcValue(atl)}
          </strong>
        </span>
      </span>
    </div>
  );
}

function PmcMobileHero({
  ctl,
  atl,
  tsb,
  acRatio,
  zone,
  fillPercent,
}: {
  ctl?: number;
  atl?: number;
  tsb?: number;
  acRatio?: number;
  zone: PmcZone;
  fillPercent: number;
}) {
  const t = useTranslations("PMC");

  return (
    <section className="overflow-hidden rounded-surface bg-neutral-100 p-4 dark:bg-muted/45">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">
            {t("mobile.currentStatus")}
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-4xl font-bold tabular-nums">
              {formatPmcValue(tsb, true)}
            </span>
            <span className="text-sm text-muted-foreground">
              {t("form.title")} ({t("abbr.form")})
            </span>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            pmcZoneStyles[zone],
          )}
        >
          {t(`mobile.zones.${zone}`)}
        </span>
      </div>

      <div className="mt-4">
        <PmcMobileTsbBar zone={zone} fillPercent={fillPercent} />
      </div>

      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        {t(`mobile.tips.${zone}`)}
      </p>

      <div className="mt-3 grid grid-cols-3 border-t border-border/60 pt-3">
        {[
          {
            label: `${t("fitness.title")} (${t("abbr.fitness")})`,
            value: formatPmcValue(ctl),
            className: "text-sky-600 dark:text-sky-400",
          },
          {
            label: `${t("fatigue.title")} (${t("abbr.fatigue")})`,
            value: formatPmcValue(atl),
            className: "text-violet-600 dark:text-violet-400",
          },
          {
            label: "A:C",
            value:
              typeof acRatio === "number" && Number.isFinite(acRatio)
                ? acRatio.toFixed(2)
                : "--",
            className: "text-foreground",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-baseline justify-center gap-1"
          >
            <span className="text-[11px] text-muted-foreground">
              {item.label}
            </span>
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                item.className,
              )}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function PMCPage() {
  const t = useTranslations("PMC");
  const tFitness = useTranslations("dashboard.fitnessStatus");
  const locale = useLocale();
  const {
    pmcFilters,
    setPmcTime,
    setPmcSportType,
    pmcSelectedStat,
    systemUnit,
  } = useStore();
  const selectedStatId = pmcSelectedStat?.id ?? "fitness";
  const isMobile = useIsMobile();
  const dashboardPmc = useDashboardPMC();
  const [metricDialog, setMetricDialog] = useState(
    createInitialMetricDialogState(),
  );

  const handleMetricClick = useCallback((metric: MetricClickData) => {
    setMetricDialog({
      open: true,
      key: metric.key,
      title: metric.title,
      currentValue: metric.value,
      unit: metric.unit,
      description: metric.details,
      links: metric.links,
    });
  }, []);

  const mobileInsightStats = useMemo(
    () =>
      buildFitnessStatusStats({
        t: tFitness,
        locale,
        fitnessData: dashboardPmc.fitnessData,
        weeklySummaryPair: undefined,
        formatWeeklyValue: () => "-",
        getWeeklyUnit: () => "",
        systemUnit,
        onMetricClick: handleMetricClick,
      }).filter((stat) => PMC_MOBILE_INSIGHT_KEYS.has(stat.key)),
    [dashboardPmc.fitnessData, handleMetricClick, locale, systemUnit, tFitness],
  );

  const renderMobileInsightSubContent = useCallback(
    (stat: (typeof mobileInsightStats)[number]) => (
      <FitnessStatusCardSubContent
        stat={stat}
        t={tFitness}
        weeklySummaryPair={undefined}
        formatWeeklyValue={() => "-"}
        fitnessData={dashboardPmc.fitnessData}
        atlPercent={dashboardPmc.atlPercent}
        ctlPercent={dashboardPmc.ctlPercent}
        tsbZone={dashboardPmc.tsbZone}
        tsbDomainMin={dashboardPmc.tsbDomainMin}
        tsbDomainMax={dashboardPmc.tsbDomainMax}
        tsbFillPercent={dashboardPmc.tsbFillPercent}
        acRatioZone={dashboardPmc.acRatioZone}
        acRatioFillPercent={dashboardPmc.acRatioFillPercent}
        monotonyZone={dashboardPmc.monotonyZone}
        monotonyFillPercent={dashboardPmc.monotonyFillPercent}
      />
    ),
    [dashboardPmc, tFitness],
  );
  useMobileMetricSubpageNavigation({
    title: t("pmcAnalysis"),
    trailing: <PmcMobileRangeMenu />,
  });

  // 设置页面标题
  useSetPageTitle(t("title"));

  // 从 pmcFilters.time 获取时间范围
  const timeRange = pmcFilters.time;

  // 计算 startDate 和 endDate
  const getDateRange = () => {
    if (timeRange.mode === "range") {
      return {
        startDate: timeRange.startDate,
        endDate: timeRange.endDate,
      };
    } else if (timeRange.mode === "all-time") {
      return {}; // 不传递日期参数，获取所有数据
    }
    // 其他模式可以根据需要添加
    return {};
  };

  const dateRange = getDateRange();

  // 获取 PMC 数据
  const { data, isLoading, error, refetch } = usePMCData({
    ...dateRange,
    sportType: pmcFilters.selectedSportType,
  });

  const pmcExtremes = dashboardPmc.pmcExtremes;
  // PMC 计算 mutation
  const smartCalculateMutation = useSmartCalculatePMC();

  // 重新计算 PMC 数据
  const handleCalculate = async () => {
    try {
      // 先触发 PMC 计算
      await smartCalculateMutation.mutateAsync();
      // 计算完成后重新获取数据
      refetch();
    } catch (error) {
      console.error("PMC 计算失败:", error);
    }
  };
  const isCalculating = smartCalculateMutation.isPending;

  /** 与图表 query  scope 对齐：仅在该筛选下首次拿到「空序列」时兜底 POST，避免每次进入页面都重复计算 */
  const pmcQueryScopeKey = `${pmcFilters.selectedSportType}:${JSON.stringify(dateRange)}`;
  const emptyRecoverForScopeRef = useRef<string | null>(null);
  useEffect(() => {
    if (isLoading) return;
    const rows = data as PMCData[] | undefined;
    if (rows && rows.length > 0) return;
    if (emptyRecoverForScopeRef.current === pmcQueryScopeKey) return;
    emptyRecoverForScopeRef.current = pmcQueryScopeKey;
    void handleCalculate();
  }, [isLoading, data, pmcQueryScopeKey]);

  // 创建计算按钮
  const calculateButton = (
    <Button
      onClick={handleCalculate}
      disabled={isCalculating}
      variant="outline"
      size="sm"
    >
      {isCalculating ? t("calculating") : t("calculate")}
    </Button>
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 pb-3 md:gap-4">
      {/* 与 Dashboard 筛选条同一视觉：圆角 neutral 底栏 + SubHeader */}
      <div className="mb-1 hidden px-1 md:block">
        <div className="rounded-surface bg-neutral-100 px-2.5 py-2 dark:bg-muted/45">
          <SubHeader
            time={pmcFilters.time}
            setTime={setPmcTime}
            selectedSportType={pmcFilters.selectedSportType}
            setSportType={setPmcSportType}
            exclude={["thisMonth", "thisYear", "allTime", "customRange"]}
            buttons={[calculateButton]}
          />
        </div>
      </div>

      {isMobile ? (
        <div className="flex flex-col gap-4">
          <PmcMobileHero
            ctl={dashboardPmc.fitnessData?.ctl}
            atl={dashboardPmc.fitnessData?.atl}
            tsb={dashboardPmc.fitnessData?.tsb}
            acRatio={dashboardPmc.fitnessData?.acRatio}
            zone={dashboardPmc.tsbZone}
            fillPercent={dashboardPmc.tsbFillPercent}
          />

          <section className="space-y-2.5">
            <div className="flex items-center gap-3 px-0.5">
              <h2 className="min-w-0 flex-1 text-sm font-semibold">
                {t("mobile.loadTrend")}
              </h2>
              <PmcMobileTrendLegend
                ctl={dashboardPmc.fitnessData?.ctl}
                atl={dashboardPmc.fitnessData?.atl}
              />
            </div>
            <DeferredPmcCombinedChart
              data={(data as PMCData[]) || []}
              isLoading={isLoading}
              error={error}
            />
          </section>

          <section className="space-y-3">
            <h2 className="px-0.5 text-sm font-semibold">
              {t("mobile.metricInsights")}
            </h2>
            {mobileInsightStats.map((stat) => (
              <FitnessStatusStatCard
                key={stat.key}
                stat={stat}
                onClick={stat.onClick}
                className="rounded-surface p-1"
                subContent={renderMobileInsightSubContent(stat)}
                rightAccessory={
                  <ChevronRight
                    className="size-3.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                }
              />
            ))}
          </section>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-1 md:gap-4">
          {/* PMC 统计数据 */}
          <div className="rounded-md bg-neutral-100 p-2 dark:bg-muted/45">
            <div className="w-full">
              <div
                className="grid gap-2 md:grid-cols-3 md:items-center"
                role="radiogroup"
                aria-label={t("metricsExplanation")}
              >
                <PMCStat
                  title={t("fatigue.title")}
                  type="fatigue"
                  data={(data as PMCData[]) || []}
                  isLoading={isLoading}
                  extremes={pmcExtremes}
                  className="min-w-0"
                />
                <PMCStat
                  title={t("fitness.title")}
                  type="fitness"
                  data={(data as PMCData[]) || []}
                  isLoading={isLoading}
                  extremes={pmcExtremes}
                  className="min-w-0"
                />
                <PMCStat
                  title={t("form.title")}
                  type="form"
                  data={(data as PMCData[]) || []}
                  isLoading={isLoading}
                  extremes={pmcExtremes}
                  className="min-w-0"
                />
              </div>
            </div>
          </div>

          {/* 根据选中的 Stat 显示对应的图表 */}
          <div>
            {selectedStatId === "fitness" ? (
              <FitnessChart
                data={(data as PMCData[]) || []}
                isLoading={isLoading}
                error={error}
              />
            ) : null}
            {selectedStatId === "fatigue" ? (
              <FatigueChart
                data={(data as PMCData[]) || []}
                isLoading={isLoading}
                error={error}
              />
            ) : null}
            {selectedStatId === "form" ? (
              <FormChart
                data={(data as PMCData[]) || []}
                isLoading={isLoading}
                error={error}
              />
            ) : null}
          </div>

          {/* 综合 PMC 图表 */}
          <div>
            <DeferredPmcCombinedChart
              data={(data as PMCData[]) || []}
              isLoading={isLoading}
              error={error}
            />
          </div>
        </div>
      )}

      {metricDialog.open ? (
        <MetricHistoryDialog
          open
          onOpenChange={(open) =>
            setMetricDialog((current) => ({ ...current, open }))
          }
          metricKey={metricDialog.key}
          title={metricDialog.title}
          currentValue={metricDialog.currentValue}
          unit={metricDialog.unit}
          description={metricDialog.description}
          links={metricDialog.links}
          mobileSheet
        />
      ) : null}
    </div>
  );
}
