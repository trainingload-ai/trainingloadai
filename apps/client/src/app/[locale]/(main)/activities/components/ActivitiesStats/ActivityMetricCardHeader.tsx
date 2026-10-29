"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { type SupportedMetricKey } from "./activities-stats-model";
import { ActivityMetricSelector } from "./ActivityMetricSelector";

export function ActivityMetricCardHeader({
  disableNext,
  metricKey,
  onMetricKeyChange,
  onNext,
  onPrev,
  periodLabel,
  title,
}: {
  disableNext?: boolean;
  metricKey: SupportedMetricKey;
  onMetricKeyChange: (metricKey: SupportedMetricKey) => void;
  onNext: () => void;
  onPrev: () => void;
  periodLabel: string;
  title: string;
}) {
  return (
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium flex justify-between items-center">
        <span className="flex items-center gap-2">
          <span>{title}</span>
          <ActivityMetricSelector
            metricKey={metricKey}
            onMetricKeyChange={onMetricKeyChange}
          />
        </span>
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium">{periodLabel}</span>
          <Button variant="ghost" size="icon-xs" onClick={onPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onNext}
            disabled={disableNext}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardTitle>
    </CardHeader>
  );
}
