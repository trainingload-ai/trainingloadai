"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/colorPicker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  TimelineRowConfig,
  TimelineMetricId,
} from "@/hooks/useActivityTimelineLayout";
import type { TimelineMetric } from "./use-activity-timeline";

export function TimelineRowSettings({
  config,
  metrics,
  color,
  onChange,
  onRemove,
  onMove,
  canMoveUp,
  canMoveDown,
}: {
  config: TimelineRowConfig;
  metrics: TimelineMetric[];
  color: string;
  onChange: (change: Partial<TimelineRowConfig>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const t = useTranslations("ActivityTimeline");
  const id = useId();
  const label = t(`metrics.${config.metric}`);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="compact"
          className="min-w-0 flex-1 justify-between gap-1 border border-transparent px-0 text-muted-foreground hover:text-foreground data-[state=open]:text-foreground has-[>svg]:px-0 [&_svg]:size-3"
          aria-label={t("configureChart", { metric: label })}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: color }}
              aria-hidden
            />
            <span className="truncate">{label}</span>
          </span>
          <ChevronDown className="text-muted-foreground/60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="right"
        sideOffset={12}
        className="w-80 p-0"
        aria-label={t("configureChart", { metric: label })}
      >
        <div className="border-b border-border/60 px-4 py-3">
          <h3 className="text-xs font-semibold">
            {t("configureChart", { metric: label })}
          </h3>
        </div>
        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 p-4">
          <label
            className="text-xs text-muted-foreground"
            htmlFor={`${id}-metric`}
          >
            {t("metric")}
          </label>
          <Select
            value={config.metric}
            onValueChange={(metric) =>
              onChange({
                metric: metric as TimelineMetricId,
                color: undefined,
              })
            }
          >
            <SelectTrigger id={`${id}-metric`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {metrics.map((metric) => (
                  <SelectItem key={metric.id} value={metric.id}>
                    {t(`metrics.${metric.id}`)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground" id={`${id}-color`}>
            {t("color")}
          </span>
          <div
            className="flex h-8 items-center gap-2"
            role="group"
            aria-labelledby={`${id}-color`}
          >
            <ColorPicker
              value={color}
              onChange={(color) => onChange({ color })}
              description={t("chartColorDescription")}
              className="size-7 shrink-0"
            />
            <span className="font-mono text-xs text-muted-foreground">
              {color.toUpperCase()}
            </span>
          </div>
          <label
            className="text-xs text-muted-foreground"
            htmlFor={`${id}-height`}
          >
            {t("height")}
          </label>
          <Select
            value={String(config.height)}
            onValueChange={(height) => onChange({ height: Number(height) })}
          >
            <SelectTrigger id={`${id}-height`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {[64, 86, 128, 180].map((height) => (
                  <SelectItem key={height} value={String(height)}>
                    {t(`heights.${height}`)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <label
            className="text-xs text-muted-foreground"
            htmlFor={`${id}-smoothing`}
          >
            {t("smoothing")}
          </label>
          <Select
            value={String(config.smoothing)}
            onValueChange={(smoothing) =>
              onChange({ smoothing: Number(smoothing) })
            }
          >
            <SelectTrigger id={`${id}-smoothing`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {[0, 5, 10, 30, 60].map((seconds) => (
                  <SelectItem key={seconds} value={String(seconds)}>
                    {seconds ? t("seconds", { seconds }) : t("raw")}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon-compact"
              aria-label={t("moveUp")}
              disabled={!canMoveUp}
              onClick={() => onMove(-1)}
            >
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon-compact"
              aria-label={t("moveDown")}
              disabled={!canMoveDown}
              onClick={() => onMove(1)}
            >
              <ArrowDown />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="compact"
            className="text-muted-foreground hover:bg-destructive/5 hover:text-destructive"
            onClick={onRemove}
          >
            <Trash2 />
            {t("removeChart")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
