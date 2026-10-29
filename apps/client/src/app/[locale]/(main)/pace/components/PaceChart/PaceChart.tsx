"use client";
import { useCallback, useMemo, memo, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useTranslations, useLocale } from "next-intl";
import uPlot from "uplot";
import UplotReact from "uplot-react";

import ChartContainer from "@/components/ChartContainer";
import { Time } from "@/components/DateSelector/types";
import { getTimeLabel } from "@/components/DateSelector/DateSelector";
import { SportType, useStore } from "@/lib/store";
import { usePaceDistanceCurve, usePaceCS } from "@/api/use-pace";
import { formatSecondsToTime } from "@/utils/timeFormatter";
import { useUplotDomTooltip } from "@/components/charts/uplot/useUplotDomTooltip";
import {
  useElementSize,
  useCssVarResolver,
} from "@/components/charts/uplot/useElementSize";
import {
  createUplotOptions,
  createAxes,
} from "@/components/charts/uplot/uPlotConfig";
import { createInnerYAxisLabelsPlugin } from "@/components/charts/uplot/uPlotPlugins";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface PaceChartProps {
  times: Time[];
  sportType: SportType;
}

interface ChartDataPoint {
  distance: string;
  [key: string]: string | number;
}

const RUN_CYCLING_LABELS = [
  "400m",
  "800m",
  "1500m",
  "1mi",
  "3k",
  "5k",
  "10k",
  "20k",
  "42.2k",
] as const;

const SWIM_LABELS = ["50m", "100m", "200m", "400m", "800m", "1500m"] as const;

const generateChartMeta = (
  times: Time[],
  tDate: (
    key: string,
    values?: Record<string, string | number | Date>,
  ) => string,
  locale: string,
): Array<{ key: `range${number}`; label: string; color: string }> => {
  const colors = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
  ];
  return times.map((time, index) => ({
    key: `range${index}`,
    label: getTimeLabel(time, tDate, locale) ?? "",
    color: colors[index % colors.length],
  }));
};

const transformDataForChart = (
  raw: Array<Record<string, number>>,
  labels: readonly string[],
): ChartDataPoint[] => {
  return labels.map((label) => {
    const point: ChartDataPoint = { distance: label };
    raw.forEach((row, index) => {
      point[`range${index}`] = row[label] ?? 0;
    });
    return point;
  });
};

const MemoUplotReact = memo(UplotReact);

export function PaceChart({ times, sportType }: PaceChartProps) {
  const tPaceChart = useTranslations("PaceChart");
  const tDayCell = useTranslations("DayCell");
  const tDate = useTranslations("dateSelector");
  const locale = useLocale();
  const isMobile = useIsMobile();
  const { systemUnit } = useStore();
  const { ref: chartAreaRef, size: chartAreaSize } =
    useElementSize<HTMLDivElement>();
  const chartWrapperRef = useRef<HTMLDivElement>(null);

  const cssVar = useCssVarResolver();

  const {
    data = [],
    isLoading,
    error,
  } = usePaceDistanceCurve(times, sportType);
  const { data: csProfile } = usePaceCS(sportType);

  const unitText =
    sportType === "SWIM"
      ? "min/100m"
      : systemUnit === "imperial"
        ? "min/mi"
        : "min/km";

  const baseMetersForSpeed = sportType === "SWIM" ? 100 : 1000;
  const baseMetersForDisplay =
    sportType === "SWIM" ? 100 : systemUnit === "imperial" ? 1609.344 : 1000;

  const rangesMeta = useMemo(
    () => generateChartMeta(times, tDate, locale),
    [times, tDate, locale],
  );
  const csMeta = useMemo(
    () => ({ key: "cs" as const, label: tPaceChart("cs"), color: "#a78bfa" }),
    [tPaceChart],
  );

  const labels = sportType === "SWIM" ? SWIM_LABELS : RUN_CYCLING_LABELS;
  const shouldScrollX = false;
  const minPxPerPoint = 54;
  const desiredWidth = useMemo(() => {
    if (!shouldScrollX) return chartAreaSize.width;
    return Math.max(chartAreaSize.width, labels.length * minPxPerPoint);
  }, [chartAreaSize.width, labels.length, shouldScrollX]);
  const rawRows = data.map((row) => {
    const obj: Record<string, number> = {};
    labels.forEach((label) => {
      // 游泳项目：将后端键名映射回展示用标签
      const key =
        sportType === "SWIM"
          ? label === "400m"
            ? "400m_swim"
            : label === "800m"
              ? "800m_swim"
              : label === "1500m"
                ? "1500m_swim"
                : label
          : label;
      const paceSec = (row[key] as number) ?? 0;
      obj[label] = paceSec > 0 ? baseMetersForSpeed / paceSec : 0;
    });
    return obj;
  });
  const chartData = transformDataForChart(rawRows, labels);
  if (csProfile?.predictions?.length) {
    const csMap: Record<string, number> = {};
    csProfile.predictions.forEach((p) => {
      let label = p.key;
      if (sportType !== "SWIM") {
        label = p.key;
      } else {
        label =
          p.key === "400m_swim"
            ? "400m"
            : p.key === "800m_swim"
              ? "800m"
              : p.key === "1500m_swim"
                ? "1500m"
                : p.key;
      }
      const speed = p.timeSec > 0 ? p.distanceM / p.timeSec : 0;
      csMap[label] = speed;
    });
    chartData.forEach((point) => {
      const label = point.distance as string;
      point["cs"] = csMap[label] ?? 0;
    });
  }

  const uplotData = useMemo((): uPlot.AlignedData => {
    const xVals = labels.map((_, idx) => idx);
    const ySeries = rangesMeta.map((m) =>
      chartData.map((p) => Number(p[m.key] ?? 0)),
    );
    const csVals = chartData.map((p) => Number(p[csMeta.key] ?? 0));
    return [xVals, ...ySeries, csVals];
  }, [chartData, labels, rangesMeta, csMeta.key]);

  const legendItems = useMemo(() => {
    return [
      ...rangesMeta.map((m) => ({
        key: m.key,
        label: m.label,
        color: m.color,
      })),
      {
        key: csMeta.key,
        label: csMeta.label,
        color: csMeta.color,
      },
    ];
  }, [rangesMeta, csMeta]);

  const tooltipSeriesItems = useMemo(() => {
    return [
      ...rangesMeta.map((m, i) => ({
        label: m.label,
        color: m.color,
        dataIndex: i + 1,
      })),
      {
        label: String(csMeta.label),
        color: csMeta.color,
        dataIndex: rangesMeta.length + 1,
      },
    ];
  }, [rangesMeta, csMeta.color, csMeta.label]);

  const renderTooltip = useCallback(
    ({
      idx,
      contentEl,
    }: {
      idx: number;
      u: uPlot;
      contentEl: HTMLDivElement;
    }) => {
      if (idx === null || idx === undefined) return;

      const title = `${tDayCell("distance")}: ${labels[idx] ?? ""}`;

      const content = (
        <>
          <div className="font-medium">{title}</div>
          <div className="grid gap-1.5">
            {tooltipSeriesItems.map((item) => {
              const speed = Number(uplotData[item.dataIndex]?.[idx] ?? 0);
              const paceText =
                speed > 0
                  ? formatSecondsToTime(baseMetersForDisplay / speed)
                  : "--";
              return (
                <div
                  key={item.label}
                  className="[&>svg]:text-muted-foreground flex w-full flex-wrap items-center gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5"
                >
                  <div
                    className="shrink-0 rounded-micro border-border bg-(--color-bg) h-2.5 w-2.5"
                    style={
                      {
                        "--color-bg": item.color,
                        "--color-border": item.color,
                      } as React.CSSProperties
                    }
                  />
                  <div className="flex flex-1 justify-between leading-none items-center gap-2">
                    <div className="grid gap-3">
                      <span className="text-muted-foreground">
                        {item.label}:
                      </span>
                    </div>
                    <span className="text-foreground font-mono font-medium tabular-nums">
                      {`${paceText} ${unitText}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      );

      contentEl.innerHTML = renderToStaticMarkup(content);
    },
    [
      tDayCell,
      labels,
      tooltipSeriesItems,
      uplotData,
      baseMetersForDisplay,
      unitText,
    ],
  );

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: renderTooltip,
    rootClassName:
      "absolute z-10 pointer-events-none top-0 left-0 will-change-transform",
    contentClassName:
      "border-border/50 bg-background grid min-w-32 items-start gap-1.5 rounded-md border px-2.5 py-1.5 text-mobile-caption pc:text-xs shadow-xl",
  });

  const uplotPlugins = useMemo(
    (): uPlot.Plugin[] => [tooltipPlugin],
    [tooltipPlugin],
  );

  const uplotOptions = useMemo((): uPlot.Options | null => {
    const width = desiredWidth;
    const height = chartAreaSize.height;
    if (width <= 0 || height <= 0) return null;

    const axisStroke = cssVar("var(--muted-foreground)");
    const gridStroke = cssVar("var(--border)");

    const innerYAxisLabelsPlugin = createInnerYAxisLabelsPlugin({
      axisStroke,
      formatValue: (v) => {
        const speed = Number(v);
        if (!(speed > 0)) return "";
        const paceSec = baseMetersForDisplay / speed;
        return formatSecondsToTime(paceSec);
      },
    });

    const series: uPlot.Series[] = [
      {},
      ...rangesMeta.map((m) => ({
        label: m.label,
        width: 2,
        stroke: cssVar(m.color),
        points: { show: true, size: 6, width: 2, fill: cssVar(m.color) },
      })),
      {
        label: String(csMeta.label),
        width: 2,
        dash: [6, 4],
        stroke: cssVar(csMeta.color),
        points: { show: true, size: 3, width: 2, fill: cssVar(csMeta.color) },
      },
    ];

    const axes = createAxes({
      axisStroke,
      gridStroke,
      formatXValue: (v) => labels[Math.round(Number(v))] ?? "",
    });

    // X 轴强制使用整数分隔，避免标签重复
    axes[0].splits = () => labels.map((_, i) => i);

    return createUplotOptions({
      width,
      height,
      padding: isMobile ? [6, 0, 20, 0] : undefined,
      legend: { show: false },
      cursor: {
        y: false,
        drag: { setScale: false },
      },
      scales: {
        x: {
          time: false,
          range: () => [0, labels.length - 1],
        },
        y: {
          auto: true,
        } as unknown as uPlot.Scale,
      },
      axes,
      series,
      plugins: [...uplotPlugins, innerYAxisLabelsPlugin],
    });
  }, [
    desiredWidth,
    chartAreaSize.height,
    cssVar,
    baseMetersForDisplay,
    isMobile,
    labels,
    rangesMeta,
    csMeta,
    uplotPlugins,
  ]);

  const legend = (
    <div className={cn(isMobile ? "max-w-[92vw] overflow-x-auto" : undefined)}>
      <div className="flex items-center gap-4 whitespace-nowrap text-mobile-caption pc:text-xs">
        {legendItems.map((item) => (
          <div key={item.key} className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 shrink-0 rounded-micro"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );

  if (
    (error && chartData.length === 0) ||
    (!isLoading && chartData.length === 0)
  ) {
    return (
      <ChartContainer
        appearance="mobile-soft"
        isLoading={isLoading}
        title={tPaceChart("tabs.curve")}
        infoContent={legend}
      >
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          {tPaceChart("noData")}
        </div>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer
      appearance="mobile-soft"
      isLoading={isLoading}
      title={tPaceChart("tabs.curve")}
      infoContent={legend}
    >
      <div
        ref={chartAreaRef}
        data-uplot-chart
        className={cn(
          "h-full w-full relative",
          shouldScrollX && "overflow-x-auto overflow-y-hidden",
        )}
      >
        <div
          ref={chartWrapperRef}
          className="h-full relative"
          style={{ width: shouldScrollX ? desiredWidth : "100%" }}
        >
          {uplotOptions ? (
            <MemoUplotReact options={uplotOptions} data={uplotData} />
          ) : null}
          {tooltip}
        </div>
      </div>
    </ChartContainer>
  );
}
