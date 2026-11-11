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
import { MoreHorizontal, Plus, RotateCcw } from "lucide-react";
import type { Activity } from "@/api/activities";
import { useHeartRateZones } from "@/api/use-heart-rate";
import { useActivityPowerZones } from "@/api/use-power";
import { useResolvedPaceZones } from "@/api/use-pace";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  coordinateAtTrackTime,
  groupTimelineByZone,
  sliceTrackByTime,
  timelineTimeAtDistance,
  timelineValueAt,
  timelineLowerBound,
  type TimelineRange,
  type TimelineGroup,
} from "@/lib/activity-timeline";
import {
  useActivityTimelineLayout,
  type TimelineGrouping,
  type TimelineRowConfig,
} from "@/hooks/useActivityTimelineLayout";
import { useSetTimelineMapFocus } from "../activity-analysis-link-context";
import { useActivityTimeline } from "./use-activity-timeline";
import { TimelineChart } from "./timeline-chart";

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
  const paceZones = useResolvedPaceZones(activityId);
  const [pinned, setPinned] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [range, setRange] = useState<TimelineRange | null>(null);
  const [zoom, setZoom] = useState<TimelineRange | null>(null);
  const [preview, setPreview] = useState<TimelineRange | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
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
  const xAtTime = useCallback(
    (time: number) =>
      axis === "time"
        ? time
        : timelineValueAt(distance ?? [], time, model?.distanceGap ?? 0, true),
    [axis, distance, model?.distanceGap],
  );
  const viewport = useMemo<TimelineRange>(() => {
    const from = zoom ? xAtTime(zoom[0]) : null;
    const to = zoom ? xAtTime(zoom[1]) : null;
    return from !== null && to !== null && to > from ? [from, to] : [0, maxX];
  }, [zoom, xAtTime, maxX]);
  const percent = (x: number) =>
    ((x - viewport[0]) / (viewport[1] - viewport[0])) * 100;
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
  const groups = useMemo<TimelineGroup[]>(() => {
    if (!model) return [];
    if (layout.grouping === "laps")
      return model.laps.map((lap) => ({
        id: String(lap.id),
        label: t("lap", { number: lap.index }),
        range: lap.range,
      }));
    const zones = {
      heartRate: heartRateZones.data?.zones,
      power: powerZones.data?.zones,
      pace: paceZones.data?.zones,
    }[layout.grouping];
    return groupTimelineByZone(
      model.groupingSeries[layout.grouping],
      Array.isArray(zones)
        ? zones.map((zone, index) =>
            // Heart-rate and power distribution use an open-ended last zone.
            layout.grouping !== "pace" && index === zones.length - 1
              ? { ...zone, max: undefined }
              : zone,
          )
        : [],
      model.duration,
    );
  }, [
    model,
    layout.grouping,
    heartRateZones.data,
    powerZones.data,
    paceZones.data,
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
      viewport[0] +
      Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) *
        (viewport[1] - viewport[0]);
    return axis === "time"
      ? x
      : timelineTimeAtDistance(distance ?? [], x, model?.distanceGap);
  };
  const reset = () => {
    stopHover();
    setZoom(null);
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
  const ticks = Array.from(
    { length: 6 },
    (_, index) => viewport[0] + (index * (viewport[1] - viewport[0])) / 5,
  );
  const zonesLoading = {
    laps: false,
    heartRate: heartRateZones.isPending,
    power: powerZones.isPending,
    pace: paceZones.isPending,
  }[layout.grouping];
  return (
    <section
      aria-label={t("title")}
      className="overflow-hidden rounded-md border border-border bg-background"
      data-timeline-start={viewport[0]}
      data-timeline-end={viewport[1]}
    >
      <div className="grid h-10 grid-cols-[160px_minmax(0,1fr)] items-center border-b border-border/60 pr-3">
        <div className="flex items-center gap-1 px-2">
          <Select
            value={layout.grouping}
            onValueChange={(grouping) =>
              setLayout((value) => ({
                ...value,
                grouping: grouping as TimelineGrouping,
              }))
            }
          >
            <SelectTrigger
              className="min-w-0 flex-1"
              aria-label={t("grouping")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {(["laps", "heartRate", "power", "pace"] as const).map(
                  (mode) => (
                    <SelectItem key={mode} value={mode}>
                      {t(`groups.${mode}`)}
                    </SelectItem>
                  ),
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
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
                <DropdownMenuItem onSelect={reset} disabled={!zoom && !range}>
                  <RotateCcw />
                  {t("resetZoom")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div
          className="relative h-8 overflow-hidden"
          role="group"
          aria-label={t("groups." + layout.grouping)}
        >
          {groups.map((group) => {
            const rawStart = xAtTime(group.range[0]),
              rawEnd = xAtTime(group.range[1]);
            if (
              rawStart === null ||
              rawEnd === null ||
              rawEnd <= viewport[0] ||
              rawStart >= viewport[1]
            )
              return null;
            const from = Math.max(rawStart, viewport[0]),
              to = Math.min(rawEnd, viewport[1]);
            if (to <= from) return null;
            const selected =
              range?.[0] === group.range[0] && range[1] === group.range[1];
            return (
              <button
                key={group.id}
                type="button"
                aria-label={`${group.label} ${timeLabel(group.range[0])}–${timeLabel(group.range[1])}`}
                aria-pressed={selected}
                data-selected={selected}
                className="absolute top-1 h-6 overflow-hidden rounded-xs border border-border bg-muted px-0.5 text-[11px] data-[selected=true]:border-foreground data-[selected=true]:font-semibold"
                style={{
                  left: `${percent(from)}%`,
                  width: `${((to - from) / (viewport[1] - viewport[0])) * 100}%`,
                  ...(group.color
                    ? {
                        backgroundColor: `color-mix(in srgb, ${group.color} 18%, var(--background))`,
                      }
                    : {}),
                }}
                onClick={() => {
                  stopHover();
                  setRange(selected ? null : group.range);
                }}
              >
                {group.label}
              </button>
            );
          })}
          {!groups.length ? (
            <span
              className="flex h-full items-center text-xs text-muted-foreground"
              role="status"
            >
              {zonesLoading ? t("loadingGroups") : t("noGroups")}
            </span>
          ) : null}
        </div>
      </div>
      <div className="relative">
        {visibleRows.map(({ config, metric }, index) => (
          <TimelineChart
            key={config.id}
            config={config}
            metric={metric}
            metrics={model.metrics}
            axis={axis}
            distance={model.distance}
            distanceGap={model.distanceGap}
            viewport={viewport}
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
            className="absolute inset-y-0 left-40 right-3 cursor-crosshair touch-pan-y focus-visible:outline-2 focus-visible:outline-ring"
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
                className="pointer-events-none absolute inset-y-0 border-x border-foreground/20 bg-foreground/5"
                style={{
                  left: `${percent(fromX)}%`,
                  width: `${((toX - fromX) / (viewport[1] - viewport[0])) * 100}%`,
                }}
              />
            ) : null}
            {currentX !== null &&
            currentX >= viewport[0] &&
            currentX <= viewport[1] ? (
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
                left: `${index * 20}%`,
                transform:
                  index === 0
                    ? undefined
                    : index === 5
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
              }}
            >
              {axis === "time" ? timeLabel(value) : formatDistance(value)}
            </span>
          ))}
        </div>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          variant="ghost"
          size="sm"
          className="w-full rounded-none"
          aria-label={t("addChart")}
        >
          <Plus />
          {t("addChart")}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            {model.metrics.map((metric) => (
              <DropdownMenuItem
                key={metric.id}
                onSelect={() =>
                  setLayout((value) => ({
                    ...value,
                    rows: [
                      ...value.rows,
                      {
                        id: crypto.randomUUID(),
                        metric: metric.id,
                        height: 86,
                        smoothing: 0,
                      },
                    ],
                  }))
                }
              >
                {t(`metrics.${metric.id}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </section>
  );
}
