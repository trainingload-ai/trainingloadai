"use client";

import React, { useMemo, useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  adaptiveDialogFooterActionButtonClassName,
  adaptiveDialogFooterToolbarClassName,
} from "@/components/ui/adaptive-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SportType } from "@/api/activities";
import { useUserCriticalPowerHistory } from "@/hooks/useUserProfile";
import { updateUserProfile } from "@/api/settings";
import UplotReact from "uplot-react";
import uPlot from "uplot";
import dayjs from "dayjs";
import {
  useElementSize,
  useCssVarResolver,
} from "@/components/charts/uplot/useElementSize";
import { useUplotDomTooltip } from "@/components/charts/uplot/useUplotDomTooltip";
import CardLoader from "@/components/ui/CardLoader";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";

interface PowerHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sportType?: SportType;
  metric: "cp" | "ftp";
}

const MemoUplotReact = React.memo(UplotReact);

export const PowerHistoryDialog = React.memo(function PowerHistoryDialog({
  open,
  onOpenChange,
  sportType = SportType.RUN,
  metric,
}: PowerHistoryDialogProps) {
  const t = useTranslations("UserProfile");
  const prefix = metric === "cp" ? "cpHistory" : "ftpHistory";

  const { data: history, isLoading } = useUserCriticalPowerHistory(
    sportType,
    metric,
  );
  const queryClient = useQueryClient();
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const cssVar = useCssVarResolver();

  const updateMutation = useMutation({
    mutationFn: updateUserProfile,
    onSuccess: () => {
      toast.success(t(`${prefix}.updateSuccess`));
      queryClient.invalidateQueries({ queryKey: queryKeys.root.userProfile });
      queryClient.invalidateQueries({
        queryKey: queryKeys.user.criticalPowerHistory(sportType, metric),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.user.checkCriticalPowerUpdateNeeded(),
      });
      setShowUpdateConfirm(false);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(t(`${prefix}.updateFailed`));
      console.error(error);
    },
  });

  // Prepare chart data
  const {
    chartData,
    sortedHistory,
    latestRecord,
    latestActiveIndex,
    isUpdateNeeded,
  } = useMemo(() => {
    if (!history || history.length === 0)
      return {
        chartData: null,
        sortedHistory: [],
        latestRecord: null,
        latestActiveIndex: -1,
        isUpdateNeeded: false,
      };

    // Sort by time just in case
    const sorted = [...history].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
    );

    // Dedup by day: keep the latest record per day
    const dayMap = new Map<string, (typeof history)[number]>();
    for (const h of sorted) {
      const day = dayjs(h.time).format("YYYY-MM-DD");
      dayMap.set(day, h);
    }
    const deduped = Array.from(dayMap.values()).sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
    );

    const xVals = deduped.map((h) => new Date(h.time).getTime() / 1000);
    const yVals = deduped.map((h) => (metric === "cp" ? h.cp : h.ftp));

    // Find the latest record
    const latest = deduped[deduped.length - 1];

    // Find the latest active record index
    const activeRecord = deduped.findLast((h) => h.status === 1);
    const activeIdx = activeRecord ? deduped.indexOf(activeRecord) : -1;

    const latestVal = latest ? (metric === "cp" ? latest.cp : latest.ftp) : 0;
    const activeVal = activeRecord
      ? metric === "cp"
        ? activeRecord.cp
        : activeRecord.ftp
      : undefined;
    const updateNeeded =
      !!latest &&
      latest.status === 2 &&
      (activeVal === undefined || Math.abs(latestVal - activeVal) > 0);

    return {
      chartData: [xVals, yVals] as uPlot.AlignedData,
      sortedHistory: deduped,
      latestRecord: latest,
      latestActiveIndex: activeIdx,
      isUpdateNeeded: updateNeeded,
    };
  }, [history, metric]);

  const handleUpdate = () => {
    if (!latestRecord || !sportType) return;

    const typeForProfile =
      sportType === SportType.RUN ||
      sportType === SportType.CYCLING ||
      sportType === SportType.SWIM
        ? (sportType as "RUN" | "CYCLING" | "SWIM")
        : undefined;

    updateMutation.mutate({
      [metric]: metric === "cp" ? latestRecord.cp : latestRecord.ftp,
      type: typeForProfile,
    });
  };

  const renderTooltip = useCallback(
    ({ idx, contentEl }: { idx: number; contentEl: HTMLDivElement }) => {
      if (!history || !chartData || idx === null || idx === undefined) return;

      const point = sortedHistory[idx];
      if (!point) return;

      const isCurrent = idx === latestActiveIndex;
      const val = metric === "cp" ? point.cp : point.ftp;

      const content = (
        <div className="flex flex-col gap-1 min-w-[120px]">
          <div className="text-mobile-caption pc:text-xs text-muted-foreground">
            {dayjs(point.time).format("YYYY-MM-DD HH:mm")}
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium">{metric.toUpperCase()}</span>
            <span className="font-bold">{val.toFixed(1)} W</span>
          </div>
          {isCurrent && (
            <div className="mt-1 text-mobile-caption pc:text-xs text-emerald-500 font-medium flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
              {t(`${prefix}.current`)}
            </div>
          )}
        </div>
      );
      contentEl.innerHTML = renderToStaticMarkup(content);
    },
    [history, chartData, sortedHistory, t, latestActiveIndex, metric, prefix],
  );

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: renderTooltip,
  });

  const activePointPlugin = useMemo(() => {
    return {
      hooks: {
        drawSeries: (u: uPlot, seriesIdx: number) => {
          if (seriesIdx !== 1 || latestActiveIndex === -1) return;
          const ctx = u.ctx;

          const xVal = u.data[0][latestActiveIndex];
          const yVal = u.data[1][latestActiveIndex];

          if (
            xVal === undefined ||
            xVal === null ||
            yVal === undefined ||
            yVal === null
          )
            return;

          const cx = u.valToPos(xVal, "x", true);
          const cy = u.valToPos(yVal, "y", true);

          ctx.save();
          ctx.fillStyle = "#22c55e";
          ctx.font = "bold 12px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(t(`${prefix}.current`), cx, cy - 12);
          ctx.restore();
        },
      },
    };
  }, [latestActiveIndex, t, prefix]);

  const options = useMemo<uPlot.Options>(() => {
    return {
      width: chartAreaSize?.width || 600,
      height: 300,
      mode: 1,
      legend: { show: false },
      padding: [20, 10, 0, 10], // top, right, bottom, left
      cursor: {
        drag: { x: false, y: false },
        points: { size: 6, fill: cssVar("var(--primary)") },
      },
      series: [
        {
          // X-axis (Time)
          value: (self: uPlot, val: number) =>
            dayjs.unix(val).format("YYYY-MM-DD"),
        },
        {
          // Value
          label: metric.toUpperCase(),
          stroke: cssVar("var(--primary)"),
          width: 2,
          points: {
            show: true,
            size: (self: uPlot, seriesIdx: number, idx: number) => {
              const isCurrent = idx === latestActiveIndex;
              return isCurrent ? 10 : 4;
            },
            fill: (self: uPlot, seriesIdx: number, idx: number) => {
              const isCurrent = idx === latestActiveIndex;
              return isCurrent ? "#22c55e" : cssVar("var(--primary)");
            },
            stroke: (self: uPlot, seriesIdx: number, idx: number) => {
              const isCurrent = idx === latestActiveIndex;
              return isCurrent ? "#22c55e" : cssVar("var(--primary)");
            },
          },
        },
      ] as unknown as uPlot.Series[],
      axes: [
        {
          space: 80,
          stroke: cssVar("var(--muted-foreground)"),
          font: "12px sans-serif",
          grid: {
            show: true,
            stroke: cssVar("var(--border)"),
            width: 1,
          },
          values: (self: uPlot, splits: number[]) =>
            splits.map((v) => dayjs.unix(v).format("MM-DD")),
        },
        {
          space: 40,
          stroke: cssVar("var(--muted-foreground)"),
          font: "12px sans-serif",
          grid: {
            show: true,
            stroke: cssVar("var(--border)"),
            width: 1,
            dash: [5, 5],
          },
        },
      ],
      plugins: [tooltipPlugin, activePointPlugin],
    };
  }, [
    chartAreaSize,
    cssVar,
    tooltipPlugin,
    activePointPlugin,
    metric,
    latestActiveIndex,
  ]);

  return (
    <>
      <AdaptiveDialog open={open} onOpenChange={onOpenChange}>
        <AdaptiveDialogContent desktopClassName="sm:max-w-[700px]">
          <AdaptiveDialogHeader>
            <AdaptiveDialogTitle>{t(`${prefix}.title`)}</AdaptiveDialogTitle>
          </AdaptiveDialogHeader>
          <div className="w-full h-[320px] relative" ref={chartAreaRef}>
            {isLoading ? (
              <CardLoader />
            ) : chartData ? (
              <>
                <div ref={chartWrapperRef}>
                  <MemoUplotReact options={options} data={chartData} />
                </div>
                {tooltip}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                {t(`${prefix}.noData`)}
              </div>
            )}
          </div>
          {isUpdateNeeded && latestRecord && (
            <AdaptiveDialogFooter
              className={cn(
                adaptiveDialogFooterToolbarClassName,
                "items-stretch",
              )}
            >
              <div className="text-sm text-muted-foreground sm:flex-1">
                {t(`${prefix}.updateAvailable`)}
              </div>
              <Button
                type="button"
                size="dialog-action"
                className={cn(
                  adaptiveDialogFooterActionButtonClassName,
                  "w-full flex-none sm:w-auto sm:flex-initial sm:shrink-0",
                )}
                onClick={() => setShowUpdateConfirm(true)}
              >
                {t(`${prefix}.updateButton`, {
                  value: (metric === "cp"
                    ? latestRecord.cp
                    : latestRecord.ftp
                  )?.toFixed(1),
                })}
              </Button>
            </AdaptiveDialogFooter>
          )}
        </AdaptiveDialogContent>
      </AdaptiveDialog>

      <AlertDialog open={showUpdateConfirm} onOpenChange={setShowUpdateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(`${prefix}.confirmUpdateTitle`)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {latestRecord &&
                t(`${prefix}.confirmUpdateDesc`, {
                  value: (metric === "cp"
                    ? latestRecord.cp
                    : latestRecord.ftp
                  )?.toFixed(1),
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleUpdate}>
              {t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});
