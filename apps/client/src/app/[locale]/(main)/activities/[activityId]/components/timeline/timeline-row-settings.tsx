"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
          className="min-w-0 flex-1 justify-start px-0"
          aria-label={t("configureChart", { metric: label })}
        >
          <span
            className="h-0.5 w-2 shrink-0"
            style={{ background: color }}
            aria-hidden
          />
          <span className="truncate">{label}</span>
          <ChevronDown aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={t("configureChart", { metric: label })}
      >
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel htmlFor={`${id}-metric`}>{t("metric")}</FieldLabel>
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
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-color`}>{t("color")}</FieldLabel>
            <Input
              id={`${id}-color`}
              type="color"
              value={color}
              onChange={(event) => onChange({ color: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-height`}>{t("height")}</FieldLabel>
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
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-smoothing`}>
              {t("smoothing")}
            </FieldLabel>
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
          </Field>
        </FieldGroup>
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon-compact"
              aria-label={t("moveUp")}
              disabled={!canMoveUp}
              onClick={() => onMove(-1)}
            >
              <ArrowUp />
            </Button>
            <Button
              variant="outline"
              size="icon-compact"
              aria-label={t("moveDown")}
              disabled={!canMoveDown}
              onClick={() => onMove(1)}
            >
              <ArrowDown />
            </Button>
          </div>
          <Button variant="ghost" size="compact" onClick={onRemove}>
            <Trash2 />
            {t("removeChart")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
