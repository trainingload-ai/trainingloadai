"use client";

import { Heart, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { formatSecondsToTime } from "@/utils/timeFormatter";
import type { TimelineRange, TimelineZone } from "@/lib/activity-timeline";

type SegmentZone = TimelineZone & { percent: number };
export type TimelineSegmentSummary = {
  id: string;
  number: number;
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

const DETAIL_WIDTH = 200;
const LABEL_WIDTH = 80;
const time = (seconds: number) => formatSecondsToTime(Math.round(seconds));

function SegmentDetails({
  group,
  tooltip = false,
}: {
  group: TimelineSegmentSummary;
  tooltip?: boolean;
}) {
  const t = useTranslations("ActivityTimeline");
  const metrics = [
    { label: t("metrics.pace"), value: group.pace },
    { label: t("metrics.heartRate"), value: group.heartRate },
    { label: t("metrics.power"), value: group.power },
  ];
  return (
    <div className="flex h-full min-w-0 flex-col justify-between gap-2 tabular-nums">
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <span
          className={cn(
            "text-xs font-semibold",
            tooltip ? "break-words" : "truncate",
          )}
        >
          {group.label}
        </span>
        <span className="shrink-0 text-sm font-semibold">{group.duration}</span>
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
    </div>
  );
}

export function TimelineSegmentHeader({
  group,
  left,
  width,
  pixelWidth,
  selected,
  onSelect,
}: {
  group: TimelineSegmentSummary;
  left: number;
  width: number;
  pixelWidth: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const detailed = pixelWidth >= DETAIL_WIDTH;
  const labeled = pixelWidth >= LABEL_WIDTH;
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusFrame = useRef<number | null>(null);
  const cancelFocusFrame = () => {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = null;
  };
  useEffect(() => cancelFocusFrame, []);
  const button = (
    <button
      ref={triggerRef}
      type="button"
      className={cn(
        "absolute inset-y-0 left-1/2 w-full min-w-2 -translate-x-1/2 overflow-hidden text-left tabular-nums hover:bg-muted/35 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
        detailed ? "px-3 py-2.5" : labeled ? "px-2 py-2.5" : "p-0",
      )}
      aria-label={`${group.label} ${time(group.range[0])}–${time(group.range[1])}`}
      aria-pressed={selected}
      onClick={onSelect}
      onFocus={(event) => {
        if (detailed || !event.currentTarget.matches(":focus-visible")) return;
        cancelFocusFrame();
        // Native focus may scroll the trigger into view, closing Radix's tooltip.
        // Reopen after that layout settles so keyboard users retain the summary.
        focusFrame.current = requestAnimationFrame(() => {
          focusFrame.current = requestAnimationFrame(() => {
            focusFrame.current = null;
            if (document.activeElement === triggerRef.current)
              setTooltipOpen(true);
          });
        });
      }}
      onBlur={() => {
        cancelFocusFrame();
        setTooltipOpen(false);
      }}
    >
      {detailed ? (
        <SegmentDetails group={group} />
      ) : labeled ? (
        <span className="flex h-full min-w-0 flex-col justify-between gap-2">
          <span className="truncate text-xs font-semibold">{group.label}</span>
          <span className="truncate text-sm font-medium">{group.duration}</span>
          <span className="truncate text-[11px] text-muted-foreground">
            {group.distance}
          </span>
        </span>
      ) : (
        <span
          className="flex h-full justify-center pt-3 text-[10px] font-medium text-muted-foreground"
          aria-hidden
        >
          {group.number}
        </span>
      )}
    </button>
  );
  return (
    <div
      data-segment-id={group.id}
      data-selected={selected}
      data-segment-detail={detailed ? "full" : labeled ? "compact" : "marker"}
      className="absolute inset-y-0 border-r border-border/40 bg-card transition-colors data-[selected=true]:bg-muted/45"
      style={{ left: `${left}%`, width: `${width}%` }}
    >
      {detailed ? (
        button
      ) : (
        <Tooltip open={tooltipOpen} onOpenChange={setTooltipOpen}>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent
            side="top"
            align="end"
            sideOffset={8}
            collisionPadding={12}
            showArrow={false}
            className="w-72 border border-border bg-popover p-3 text-popover-foreground shadow-md"
          >
            <SegmentDetails group={group} tooltip />
          </TooltipContent>
        </Tooltip>
      )}
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
