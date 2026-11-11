"use client";

import { Heart, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatSecondsToTime } from "@/utils/timeFormatter";
import type { TimelineRange, TimelineZone } from "@/lib/activity-timeline";

type SegmentZone = TimelineZone & { percent: number };
export type TimelineSegmentSummary = {
  id: string;
  label: string;
  range: TimelineRange;
  duration: string;
  distance: string;
  pace: string;
  heartRate: string;
  power: string;
  color?: string;
  hrZone: SegmentZone | null;
  powerZone: SegmentZone | null;
};

export function TimelineSegmentHeader({
  group,
  left,
  width,
  selected,
  onSelect,
}: {
  group: TimelineSegmentSummary;
  left: number;
  width: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("ActivityTimeline");
  const time = (seconds: number) => formatSecondsToTime(Math.round(seconds));
  const metrics = [
    { label: t("metrics.pace"), value: group.pace },
    { label: t("metrics.heartRate"), value: group.heartRate },
    { label: t("metrics.power"), value: group.power },
  ];
  return (
    <div
      data-segment-id={group.id}
      data-selected={selected}
      className="absolute inset-y-0 border-r border-border/40 bg-card transition-colors data-[selected=true]:bg-muted/45"
      style={{ left: `${left}%`, width: `${width}%` }}
    >
      <button
        type="button"
        className="flex size-full flex-col justify-between gap-1.5 overflow-hidden px-3 py-2.5 text-left tabular-nums hover:bg-muted/35 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
        aria-label={`${group.label} ${time(group.range[0])}–${time(group.range[1])}`}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <span className="truncate text-xs font-semibold">{group.label}</span>
          <span className="shrink-0 text-sm font-semibold">
            {group.duration}
          </span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span className="truncate">
            {time(group.range[0])}–{time(group.range[1])}
          </span>
          <span className="shrink-0">{group.distance}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {metrics.map((metric) => {
            const [value, ...units] = metric.value.split(" ");
            return (
              <div
                key={metric.label}
                className="min-w-0"
                title={`${metric.label} ${metric.value}`}
              >
                <div className="truncate text-sm font-medium leading-5">
                  {value}
                </div>
                <div className="truncate text-[10px] leading-3 text-muted-foreground">
                  {units.join(" ") || metric.label}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex min-w-0 items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span
            className="flex min-w-0 items-center gap-1"
            title={`${t("dominantHeartRateDescription")} ${group.hrZone?.name ?? "—"}`}
          >
            <Heart
              className="size-3 shrink-0"
              aria-hidden
              style={{ color: group.hrZone?.color }}
            />
            <span className="truncate">
              {group.hrZone
                ? `${group.hrZone.shortName ?? group.hrZone.name} · ${group.hrZone.percent}%`
                : "—"}
            </span>
          </span>
          <span
            className="flex min-w-0 items-center gap-1"
            title={`${t("dominantPowerDescription")} ${group.powerZone?.name ?? "—"}`}
          >
            <Zap
              className="size-3 shrink-0"
              aria-hidden
              style={{ color: group.powerZone?.color }}
            />
            <span className="truncate">
              {group.powerZone
                ? `${group.powerZone.shortName ?? group.powerZone.name} · ${group.powerZone.percent}%`
                : "—"}
            </span>
          </span>
        </div>
      </button>
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-70"
        style={{ backgroundColor: group.color }}
        aria-hidden
      />
      {selected ? (
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-foreground"
          aria-hidden
        />
      ) : null}
    </div>
  );
}
