"use client";

import { useCallback, useState } from "react";

import { buildMetricDocsLink } from "../metric-history/demo-fixtures";
import {
  createInitialMetricHistoryDialogState,
  type FitnessMetricKey,
  type MetricHistoryDialogState,
} from "../metric-history/types";

export type MetricHistoryStatInput = {
  key: string;
  title: string;
  value: string;
  unit?: string;
  details?: string;
  description?: string;
};

export function useMetricHistoryDialog(lang: string, aboutMetric: (title: string) => string) {
  const [metricDialog, setMetricDialog] = useState<MetricHistoryDialogState>(
    createInitialMetricHistoryDialogState,
  );

  const openMetricHistory = useCallback(
    (stat: MetricHistoryStatInput) => {
      const key = stat.key as FitnessMetricKey;
      setMetricDialog({
        open: true,
        key,
        title: stat.title,
        currentValue: stat.value,
        unit: stat.unit ?? "",
        description: stat.details ?? stat.description ?? "",
        links: [buildMetricDocsLink(key, lang, aboutMetric(stat.title))],
      });
    },
    [aboutMetric, lang],
  );

  const closeMetricHistory = useCallback((open: boolean) => {
    setMetricDialog((current) => ({ ...current, open }));
  }, []);

  return {
    metricDialog,
    openMetricHistory,
    closeMetricHistory,
  };
}
