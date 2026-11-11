"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getMetricColor } from "@/lib/chart-data-utils";
import type { TimelineMetricId } from "@/hooks/useActivityTimelineLayout";
import type { TimelineMetric } from "./use-activity-timeline";

export function TimelineAddChartDialog({
  metrics,
  onAdd,
}: {
  metrics: TimelineMetric[];
  onAdd: (metric: TimelineMetricId) => void;
}) {
  const t = useTranslations("ActivityTimeline");
  const [open, setOpen] = useState(false);
  const titleId = useId();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full rounded-none"
          disabled={!metrics.length}
        >
          <Plus data-icon="inline-start" />
          {t("addChart")}
        </Button>
      </DialogTrigger>
      <DialogContent aria-labelledby={titleId}>
        <DialogHeader>
          <DialogTitle id={titleId}>{t("addChart")}</DialogTitle>
          <DialogDescription>{t("addChartDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {metrics.map((metric) => (
            <Button
              key={metric.id}
              variant="outline"
              size="auto"
              aria-label={t(`metrics.${metric.id}`)}
              className="min-h-12 justify-start gap-2 px-3 py-3"
              onClick={() => {
                onAdd(metric.id);
                setOpen(false);
              }}
            >
              <span
                className="h-0.5 w-3 shrink-0"
                style={{ backgroundColor: getMetricColor(metric.colorMetric) }}
                aria-hidden
              />
              <span className="truncate">{t(`metrics.${metric.id}`)}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {metric.unit}
              </span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
