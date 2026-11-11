"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { useTranslations } from "next-intl";
import { MoreHorizontal, RotateCcw, Pencil } from "lucide-react";
import type { Activity } from "@/api/activities";
import { useHeartRateZones } from "@/api/use-heart-rate";
import { useActivityPowerZones } from "@/api/use-power";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useElementSize } from "@/components/charts/uplot/useElementSize";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatSecondsToTime } from "@/utils/timeFormatter";
import { getPowerZoneColorByZone } from "@/utils/util";
import {
  coordinateAtTrackTime,
  sliceTrackByTime,
  timelineValueAt,
  timelineLowerBound,
  type TimelineRange,
} from "@/lib/activity-timeline";
import {
  useActivityTimelineLayout,
  type TimelineRowConfig,
} from "@/hooks/useActivityTimelineLayout";
import { useSetTimelineMapFocus } from "../activity-analysis-link-context";
import { useActivityTimeline } from "./use-activity-timeline";
import { TimelineChart } from "./timeline-chart";
import { TimelineAddChartDialog } from "./timeline-add-chart-dialog";
import {
  buildTimelineSegmentScale,
  timelineWeightedAverage,
  timelineDominantZone,
} from "@/lib/activity-timeline-segments";
import { useTimelineSegments } from "./use-timeline-segments";
import { TimelineSegmentsDialog } from "./timeline-segments-dialog";
import { TimelineSegmentHeader } from "./timeline-segment-header";
import { useStore } from "@/lib/store";
import type { TimelineSegment } from "@shared/activity-timeline";

const timeLabel = (value: number) => formatSecondsToTime(Math.round(value));

export default function ActivityTimeline({
  activity,
  activityId,
}: {
  activity: Activity;
  activityId: string;
}) {
  const t = useTranslations("ActivityTimeline");
  const { model, loading, errors, retry, segments, formatDistance } =
    useActivityTimeline(activity, activityId);
  const { layout, setLayout } = useActivityTimelineLayout(
    activity.sportType === "RUN",
  );
  const heartRateZones = useHeartRateZones(activityId);
  const powerZones = useActivityPowerZones(activityId);
  const systemUnit = useStore((state) => state.systemUnit);
  const nativeSegments = useMemo<TimelineSegment[]>(
    () =>
      model?.laps.length
        ? model.laps.map((lap) => ({
            id: `lap:${lap.id}`,
            name: "",
            start: lap.range[0],
            end: lap.range[1],
          }))
        : model?.duration
          ? [{ id: "full-activity", name: "", start: 0, end: model.duration }]
          : [],
    [model],
  );
  const analysis = useTimelineSegments(activityId, nativeSegments);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(
    null,
  );
  const [editing, setEditing] = useState(false);
  const [editingRevision, setEditingRevision] = useState(0);
  const beginEdit = () => {
    setEditingRevision(analysis.revision);
    setEditing(true);
  };
  const [scrollOffset, setScrollOffset] = useState(0);
  const [pinned, setPinned] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [range, setRange] = useState<TimelineRange | null>(null);
  const [zoom, setZoom] = useState<TimelineRange | null>(null);
  const [preview, setPreview] = useState<TimelineRange | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { ref: observeScroll, size: scrollSize } =
    useElementSize<HTMLDivElement>();
  const bindScroll = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node;
      observeScroll(node);
    },
    [observeScroll],
  );
  const drag = useRef<{ time: number; x: number; moved: boolean } | null>(null);
  const frame = useRef<number | null>(null);
  const pendingHover = useRef<number | null>(null);
  const setMapFocus = useSetTimelineMapFocus();
  const distance = model?.distance;
  const axis =
    layout.axis === "distance" && distance?.length ? "distance" : "time";
  const maxX =
    axis === "distance" ? distance!.at(-1)!.value! : (model?.duration ?? 0);
  const current = hovered ?? pinned;
  const activeRange = preview ?? range;
  const coordinateAtTime = useCallback(
    (time: number) =>
      axis === "time"
        ? time
        : timelineValueAt(distance ?? [], time, model?.distanceGap ?? 0, true),
    [axis, distance, model?.distanceGap],
  );
  const viewport = useMemo<TimelineRange>(() => {
    const from = zoom ? coordinateAtTime(zoom[0]) : null;
    const to = zoom ? coordinateAtTime(zoom[1]) : null;
    return from !== null && to !== null && to > from ? [from, to] : [0, maxX];
  }, [zoom, coordinateAtTime, maxX]);
  const timeViewport = useMemo<TimelineRange>(
    () => zoom ?? [0, model?.duration ?? 1],
    [zoom, model?.duration],
  );
  const plotWidth = Math.max(1, (scrollSize.width || 1084) - 172);
  const scale = useMemo(
    () =>
      buildTimelineSegmentScale(
        analysis.segments,
        timeViewport,
        zoom
          ? plotWidth
          : Math.max(
              plotWidth,
              Math.min(12000, Math.max(1268, model?.duration ?? 0)),
            ),
        coordinateAtTime,
        selectedSegmentId,
      ),
    [
      analysis.segments,
      timeViewport,
      plotWidth,
      zoom,
      model?.duration,
      coordinateAtTime,
      selectedSegmentId,
    ],
  );
  const sceneWidth = scale.width + 172;
  const plotViewport = useMemo<TimelineRange>(() => {
    const start = Math.min(scrollOffset, Math.max(0, scale.width - plotWidth));
    return [start, start + plotWidth];
  }, [scrollOffset, scale.width, plotWidth]);
  const xAtTime = scale.positionAt;
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
    setScrollOffset(0);
  }, [axis, zoom]);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || pinned === null) return;
    const position = scale.positionAt(pinned);
    if (position < scroller.scrollLeft) scroller.scrollLeft = position;
    else if (position > scroller.scrollLeft + plotWidth)
      scroller.scrollLeft = position - plotWidth;
  }, [pinned, scale, plotWidth]);
  useEffect(() => {
    const scroller = scrollRef.current;
    const selected = analysis.segments.find(
      (segment) => segment.id === selectedSegmentId,
    );
    if (!scroller || !selected) return;
    const start = scale.positionAt(selected.start),
      end = scale.positionAt(selected.end);
    if (start < scroller.scrollLeft) scroller.scrollLeft = start;
    else if (end > scroller.scrollLeft + plotWidth)
      scroller.scrollLeft = end - plotWidth;
  }, [selectedSegmentId, analysis.segments, scale, plotWidth]);
  const percent = (x: number) => ((x - plotViewport[0]) / plotWidth) * 100;
  const pointTimes = useMemo(
    () =>
      [
        ...new Set(
          model?.metrics.flatMap((metric) =>
            metric.points.map((point) => point.time),
          ) ?? [],
        ),
      ]
        .sort((a, b) => a - b)
        .map((time) => ({ time })),
    [model],
  );
  const focusTracks = useMemo(
    () =>
      range && model
        ? sliceTrackByTime(
            segments,
            model.origin + range[0] * 1000,
            model.origin + range[1] * 1000,
          )
        : null,
    [range, model, segments],
  );
  useEffect(() => {
    setMapFocus({
      activityId,
      segments,
      coordinate:
        current !== null && model
          ? coordinateAtTrackTime(segments, model.origin + current * 1000)
          : null,
      tracks: focusTracks,
    });
  }, [activityId, segments, model, current, focusTracks, setMapFocus]);
  useEffect(
    () => () => {
      setMapFocus(null);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [setMapFocus],
  );
  const groups = useMemo(() => {
    if (!model) return [];
    const hrZones = (heartRateZones.data?.zones ?? []).map(
      (zone, index, all) => ({
        ...zone,
        shortName: `Z${index + 1}`,
        max: index === all.length - 1 ? undefined : zone.max,
        color: getPowerZoneColorByZone(zone.color, index + 1),
      }),
    );
    const pwZones = (powerZones.data?.zones ?? []).map((zone, index, all) => ({
      ...zone,
      shortName: `Z${index + 1}`,
      max: index === all.length - 1 ? undefined : zone.max,
      color: getPowerZoneColorByZone(zone.color, index + 1),
    }));
    return analysis.segments.map((segment, index) => {
      const range: TimelineRange = [segment.start, segment.end];
      const original = nativeSegments.find(
        (native) =>
          native.id === segment.id &&
          native.start === segment.start &&
          native.end === segment.end,
      );
      const lap = original
        ? activity.laps?.find((lap) => `lap:${lap.id}` === original.id)
        : undefined;
      const startDistance = timelineValueAt(
        model.distance,
        segment.start,
        model.distanceGap,
        true,
      );
      const endDistance = timelineValueAt(
        model.distance,
        segment.end,
        model.distanceGap,
        true,
      );
      const distanceM =
        lap?.distance ??
        (startDistance !== null && endDistance !== null
          ? Math.max(0, endDistance - startDistance)
          : null);
      const speed =
        lap?.avgSpeed ??
        timelineWeightedAverage(model.summarySeries.speed, range);
      const heartRate =
        lap?.avgHeartRate ??
        timelineWeightedAverage(model.summarySeries.heartRate, range);
      const power =
        (model.metrics.find((metric) => metric.id === "power")?.calculated
          ? null
          : lap?.avgPower) ??
        timelineWeightedAverage(model.summarySeries.power, range);
      const hrZone = timelineDominantZone(
        model.summarySeries.heartRate,
        hrZones,
        range,
      );
      const powerZone = timelineDominantZone(
        model.summarySeries.power,
        pwZones,
        range,
      );
      const primaryZone =
        activity.sportType === "RUN"
          ? (hrZone ?? powerZone)
          : (powerZone ?? hrZone);
      const pace =
        speed !== null && speed > 0
          ? activity.sportType === "RUN"
            ? `${timeLabel((systemUnit === "imperial" ? 1609.344 : 1000) / speed)} ${systemUnit === "imperial" ? "min/mi" : "min/km"}`
            : `${(speed * (systemUnit === "imperial" ? 2.236936 : 3.6)).toFixed(1)} ${systemUnit === "imperial" ? "mph" : "km/h"}`
          : "—";
      return {
        id: segment.id,
        label: segment.name || t("lap", { number: index + 1 }),
        range,
        color: primaryZone?.color,
        duration: timeLabel(segment.end - segment.start),
        distance: distanceM === null ? "—" : formatDistance(distanceM),
        pace,
        heartRate: heartRate === null ? "—" : `${Math.round(heartRate)} bpm`,
        power:
          power === null
            ? "—"
            : `${model.metrics.find((metric) => metric.id === "power")?.calculated ? "≈" : ""}${Math.round(power)} W`,
        hrZone,
        powerZone,
      };
    });
  }, [
    model,
    heartRateZones.data,
    powerZones.data,
    analysis.segments,
    nativeSegments,
    activity,
    systemUnit,
    formatDistance,
    t,
  ]);
  const visibleRows = useMemo(
    () =>
      layout.rows.flatMap((config) => {
        const metric = model?.metrics.find(
          (candidate) => candidate.id === config.metric,
        );
        return metric ? [{ config, metric }] : [];
      }),
    [layout.rows, model],
  );
  const visibleGroups = useMemo(
    () =>
      groups.flatMap((group) => {
        const start = Math.max(group.range[0], timeViewport[0]);
        const end = Math.min(group.range[1], timeViewport[1]);
        if (end <= start) return [];
        const left = scale.positionAt(start),
          right = scale.positionAt(end);
        return [
          {
            ...group,
            left: (left / scale.width) * 100,
            width: ((right - left) / scale.width) * 100,
          },
        ];
      }),
    [groups, timeViewport, scale],
  );

  const hover = (time: number | null) => {
    pendingHover.current = time;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      setHovered(pendingHover.current);
      frame.current = null;
    });
  };
  const stopHover = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setHovered(null);
  };
  const atPointer = (event: PointerEvent) => {
    const rect = plotRef.current!.getBoundingClientRect();
    const x =
      plotViewport[0] +
      Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) *
        plotWidth;
    return scale.timeAt(x);
  };
  const reset = () => {
    stopHover();
    setZoom(null);
    setSelectedSegmentId(null);
    setRange(null);
    setPreview(null);
  };
  const finishPointer = (event: PointerEvent) => {
    const start = drag.current;
    drag.current = null;
    if (!start) return;
    stopHover();
    const time = atPointer(event);
    setPreview(null);
    if (time === null) return;
    setPinned(time);
    if (start.moved && Math.abs(time - start.time) >= 1) {
      const selected: TimelineRange = [
        Math.min(start.time, time),
        Math.max(start.time, time),
      ];
      setSelectedSegmentId(null);
      setRange(selected);
      setZoom(selected);
    }
  };
  const updateRow = (id: string, change: Partial<TimelineRowConfig>) =>
    setLayout((value) => ({
      ...value,
      rows: value.rows.map((row) =>
        row.id === id ? { ...row, ...change, id } : row,
      ),
    }));
  const moveRow = (id: string, direction: -1 | 1) =>
    setLayout((value) => {
      const index = value.rows.findIndex((row) => row.id === id);
      const visibleIndex = visibleRows.findIndex(
        ({ config }) => config.id === id,
      );
      const neighbor = visibleRows[visibleIndex + direction]?.config.id;
      const next = value.rows.findIndex((row) => row.id === neighbor);
      const rows = [...value.rows];
      if (index < 0 || next < 0) return value;
      [rows[index], rows[next]] = [rows[next], rows[index]];
      return { ...value, rows };
    });

  if (!model?.metrics.length || maxX <= 0)
    return (
      <section className="flex flex-col gap-3 py-4" aria-label={t("title")}>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <p className="text-sm text-muted-foreground">
            {errors.length ? t("error") : t("empty")}
          </p>
        )}
        {errors.length ? (
          <Button variant="outline" className="self-start" onClick={retry}>
            {t("retry")}
          </Button>
        ) : null}
      </section>
    );
  const currentX = current === null ? null : xAtTime(current);
  const fromX = activeRange ? xAtTime(activeRange[0]) : null;
  const toX = activeRange ? xAtTime(activeRange[1]) : null;
  const tickCount = Math.max(6, Math.ceil((sceneWidth - 172) / 180) + 1);
  const ticks = Array.from(
    { length: tickCount },
    (_, index) => (index * scale.width) / (tickCount - 1),
  );
  return (
    <section
      aria-label={t("title")}
      className="overflow-hidden rounded-md border border-border bg-background"
      data-timeline-start={viewport[0]}
      data-timeline-end={viewport[1]}
    >
      <div
        ref={bindScroll}
        className="overflow-x-auto overscroll-x-contain"
        data-timeline-scroll
        onScroll={(event) => setScrollOffset(event.currentTarget.scrollLeft)}
      >
        <div style={{ width: sceneWidth, minWidth: "100%" }}>
          <div className="grid min-h-[120px] grid-cols-[160px_minmax(0,1fr)] items-center border-b border-border/60 pr-3">
            <div className="sticky left-0 z-20 flex h-full flex-col items-stretch justify-between gap-2 border-r border-border bg-background px-3 py-3">
              <div className="flex items-center justify-between gap-1">
                <span
                  className="px-1 text-xs font-medium"
                  title={t("segmentScaleDescription")}
                >
                  {t("segments")}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("timelineOptions")}
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuRadioGroup
                      value={axis}
                      onValueChange={(value) =>
                        setLayout((layout) => ({
                          ...layout,
                          axis: value as "time" | "distance",
                        }))
                      }
                      aria-label={t("axis")}
                    >
                      <DropdownMenuRadioItem value="time">
                        {t("time")}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem
                        value="distance"
                        disabled={!model.distance.length}
                      >
                        {t("distance")}
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        onSelect={reset}
                        disabled={!zoom && !range}
                      >
                        <RotateCcw />
                        {t("resetZoom")}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {analysis.custom
                  ? t("customSegments")
                  : model.laps.length
                    ? t("deviceLaps")
                    : t("fullActivity")}
              </span>
              <Button
                variant="ghost"
                size="compact"
                className="justify-start px-0"
                disabled={!analysis.canEdit}
                onClick={beginEdit}
              >
                <Pencil />
                {t("editSegments")}
              </Button>
            </div>
            <div
              className="relative h-[120px] min-w-0"
              role="group"
              aria-label={t("segments")}
            >
              {visibleGroups.map((group) => (
                <TimelineSegmentHeader
                  key={group.id}
                  group={group}
                  left={group.left}
                  width={group.width}
                  selected={selectedSegmentId === group.id}
                  onSelect={() => {
                    stopHover();
                    const selected = selectedSegmentId === group.id;
                    setSelectedSegmentId(selected ? null : group.id);
                    setRange(selected ? null : group.range);
                  }}
                />
              ))}
              {!visibleGroups.length ? (
                <span
                  className="flex h-full items-center text-xs text-muted-foreground"
                  role="status"
                >
                  {t("noSegments")}
                </span>
              ) : null}
            </div>
          </div>
          <div className="relative">
            <div
              className="pointer-events-none absolute inset-y-0 left-40 right-3 overflow-hidden"
              aria-hidden
            >
              {visibleGroups.map((group) => (
                <span
                  key={group.id}
                  className="absolute inset-y-0 border-l border-border/40"
                  style={{ left: `${group.left}%` }}
                />
              ))}
            </div>
            {visibleRows.map(({ config, metric }, index) => (
              <TimelineChart
                key={config.id}
                config={config}
                metric={metric}
                metrics={model.metrics}
                axis={axis}
                distance={model.distance}
                distanceGap={model.distanceGap}
                viewport={timeViewport}
                scale={scale}
                plotViewport={plotViewport}
                viewWidth={scrollSize.width || 1084}
                current={current}
                onChange={(change) => updateRow(config.id, change)}
                onRemove={() =>
                  setLayout((value) => ({
                    ...value,
                    rows: value.rows.filter((row) => row.id !== config.id),
                  }))
                }
                onMove={(direction) => moveRow(config.id, direction)}
                canMoveUp={index > 0}
                canMoveDown={index < visibleRows.length - 1}
              />
            ))}
            {visibleRows.length ? (
              <div
                ref={plotRef}
                className="absolute inset-y-0 cursor-crosshair touch-pan-y focus-visible:outline-2 focus-visible:outline-ring overflow-hidden"
                style={{ left: 160 + plotViewport[0], width: plotWidth }}
                role="slider"
                tabIndex={0}
                aria-label={t("inspect")}
                aria-valuemin={0}
                aria-valuemax={model.duration}
                aria-valuenow={current ?? 0}
                aria-valuetext={
                  current === null ? t("fullActivity") : timeLabel(current)
                }
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    reset();
                    return;
                  }
                  if (event.key === "Home" || event.key === "End") {
                    event.preventDefault();
                    stopHover();
                    setPinned(event.key === "Home" ? 0 : model.duration);
                    return;
                  }
                  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
                  event.preventDefault();
                  stopHover();
                  const index = timelineLowerBound(pointTimes, pinned ?? 0);
                  const next = Math.max(
                    0,
                    Math.min(
                      pointTimes.length - 1,
                      index + (event.key === "ArrowRight" ? 1 : -1),
                    ),
                  );
                  setPinned(pointTimes[next]?.time ?? null);
                }}
                onDoubleClick={reset}
                onPointerDown={(event) => {
                  if (event.button !== 0 || !event.isPrimary) return;
                  const time = atPointer(event);
                  if (time === null) return;
                  drag.current = { time, x: event.clientX, moved: false };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const time = atPointer(event);
                  hover(time);
                  if (
                    drag.current &&
                    time !== null &&
                    Math.abs(event.clientX - drag.current.x) > 5
                  ) {
                    drag.current.moved = true;
                    setPreview([
                      Math.min(time, drag.current.time),
                      Math.max(time, drag.current.time),
                    ]);
                  }
                }}
                onPointerLeave={() => {
                  if (!drag.current) hover(null);
                }}
                onPointerUp={finishPointer}
                onPointerCancel={() => {
                  drag.current = null;
                  setPreview(null);
                  stopHover();
                }}
              >
                {fromX !== null && toX !== null && !zoom ? (
                  <span
                    data-timeline-selection
                    className="pointer-events-none absolute inset-y-0 border-x border-foreground/30 bg-foreground/5"
                    style={{
                      left: `${percent(fromX)}%`,
                      width: `${((toX - fromX) / plotWidth) * 100}%`,
                      ...(selectedSegmentId
                        ? {
                            backgroundColor: `color-mix(in srgb, ${groups.find((group) => group.id === selectedSegmentId)?.color ?? "var(--foreground)"} 6%, transparent)`,
                          }
                        : {}),
                    }}
                  />
                ) : null}
                {currentX !== null &&
                currentX >= plotViewport[0] &&
                currentX <= plotViewport[1] ? (
                  <span
                    className="pointer-events-none absolute inset-y-0 border-l border-foreground/60"
                    style={{ left: `${percent(currentX)}%` }}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
          {visibleRows.length ? (
            <div
              className="relative ml-40 mr-3 h-6 text-[11px] text-muted-foreground tabular-nums"
              aria-hidden
            >
              {ticks.map((value, index) => (
                <span
                  key={index}
                  className="absolute top-1"
                  style={{
                    left: `${(index / (ticks.length - 1)) * 100}%`,
                    transform:
                      index === 0
                        ? undefined
                        : index === ticks.length - 1
                          ? "translateX(-100%)"
                          : "translateX(-50%)",
                  }}
                >
                  {axis === "time"
                    ? timeLabel(scale.timeAt(value))
                    : (() => {
                        const distance = coordinateAtTime(scale.timeAt(value));
                        return distance === null
                          ? "—"
                          : formatDistance(distance);
                      })()}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {editing ? (
        <TimelineSegmentsDialog
          segments={analysis.segments}
          native={nativeSegments}
          selectedId={selectedSegmentId}
          duration={model.duration}
          saving={analysis.saving}
          onClose={() => setEditing(false)}
          onSave={async (segments) => {
            const unchanged =
              segments.length === nativeSegments.length &&
              segments.every((segment, index) => {
                const native = nativeSegments[index];
                return (
                  native.id === segment.id &&
                  native.name === segment.name &&
                  native.start === segment.start &&
                  native.end === segment.end
                );
              });
            await analysis.save(unchanged ? null : segments, editingRevision);
            reset();
          }}
        />
      ) : null}
      <TimelineAddChartDialog
        metrics={model.metrics}
        onAdd={(metric) =>
          setLayout((value) => ({
            ...value,
            rows: [
              ...value.rows,
              { id: crypto.randomUUID(), metric, height: 86, smoothing: 0 },
            ],
          }))
        }
      />
    </section>
  );
}
