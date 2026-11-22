"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { isTrainingVisualizationV1, type TrainingMetricSource } from "@shared/training-visualization";
import { isTrainingVisualizationV2 } from "@shared/training-exploration";
import { isCoachHealthVisualization } from "@shared/ai-coach-schema";
import { formatHealthHrvLabel } from "@shared/health-overview";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { classifyApiError } from "@/lib/api-error";
import { TrainingVisualizationCard } from "./training-visualization-card";
import { CoachHealthCard } from "./coach-health-card";
import type { CoachChartView } from "./coach-preview-panel";

export function CoachChartPreview({ sid, view }: { sid: string; view: CoachChartView }) {
  return <ChartResult key={`${view.messageId}:${view.deliveryId}:${view.date ?? ""}`} sid={sid} view={view} />;
}

function ChartResult({ sid, view }: { sid: string; view: CoachChartView }) {
  const t = useTranslations();
  const format = useFormatter();
  const { messageId, deliveryId, fingerprint, measure, date } = view;
  const [hrvSource, setHrvSource] = useState<string>();
  const [metricSource, setMetricSource] = useState<TrainingMetricSource>();
  const [byActivity, setByActivity] = useState(false);
  const [pickedMeasure, setPickedMeasure] = useState<{ initial: typeof measure; key: typeof measure }>();
  const selectedMeasure = pickedMeasure && pickedMeasure.initial === measure ? pickedMeasure.key : measure;
  const readChart = async (signal: AbortSignal, alternate?: { hrvSource?: string; metricSource?: TrainingMetricSource; byActivity: boolean }) => {
    const address = [sid, messageId, deliveryId].map(encodeURIComponent);
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (alternate?.hrvSource) params.set("hrvSource", alternate.hrvSource);
    if (alternate?.metricSource) params.set("metricSource", alternate.metricSource);
    if (alternate?.byActivity) params.set("byActivity", "true");
    const search = params.size ? `?${params}` : "";
    const payload = await apiFetch<unknown>(
      `/ai/coach/sessions/${address[0]}/messages/${address[1]}/charts/${address[2]}${search}`,
      { signal, suppressErrorToast: true },
    );
    if (!isTrainingVisualizationV1(payload) && !isTrainingVisualizationV2(payload) &&
      !isCoachHealthVisualization(payload)) throw new Error("Invalid chart");
    return payload;
  };
  const original = useQuery({
    queryKey: ["coach-chart", sid, messageId, deliveryId, date],
    queryFn: ({ signal }) => readChart(signal),
    retry: 1,
  });
  const alternateSelected = Boolean(hrvSource || metricSource || byActivity);
  const alternate = useQuery({
    queryKey: ["coach-chart", sid, messageId, deliveryId, date, { hrvSource, metricSource, byActivity }],
    queryFn: ({ signal }) => readChart(signal, { hrvSource, metricSource, byActivity }),
    enabled: alternateSelected,
    retry: 1,
  });
  const chart = alternateSelected ? alternate : original;
  const originalHealth = isCoachHealthVisualization(original.data) ? original.data : undefined;
  const originalSource = originalHealth?.scope.hrvType &&
    JSON.stringify([originalHealth.scope.provider ?? null, originalHealth.scope.hrvType]);
  const sources = originalHealth?.hrvSources ?? [];
  const hasOriginalSource = sources.some(({ id }) => id === originalSource);
  const originalTraining = isTrainingVisualizationV1(original.data) ? original.data : undefined;
  const originalMetricSource = originalTraining?.provenance.metricSource;
  const metricSources = originalTraining?.metricSources ?? [];
  const metricSourceSelect = metricSources.some((source) => source !== originalMetricSource) ? (
    <select aria-label={t("AiCoachPage.trainingVisualization.metricSource")}
      className="max-w-full rounded-md border bg-background px-2 py-1.5 text-sm"
      value={metricSource ?? originalMetricSource ?? ""}
      onChange={(event) => setMetricSource(metricSources.find((source) => source !== originalMetricSource && source === event.target.value))}>
      {!originalMetricSource || !metricSources.includes(originalMetricSource) ? <option value={originalMetricSource ?? ""}>{t("AiCoachPage.trainingVisualization.originalSource")}</option> : null}
      {metricSources.map((source) => <option key={source} value={source}>{t(`AiCoachPage.trainingVisualization.sources.${source}`)}</option>)}
    </select>
  ) : null;
  const grouping = originalTraining?.provenance.source === "ACTIVITIES" && originalTraining.provenance.groupBy !== "ACTIVITY" ? (
    <Button size="sm" variant="outline" onClick={() => setByActivity((active) => !active)}>
      {t(byActivity ? "AiCoachPage.trainingVisualization.backToChart" : "AiCoachPage.trainingVisualization.byActivity")}
    </Button>
  ) : null;
  const sourceSelect = sources.some(({ id }) => id !== originalSource) ? (
    <select
      aria-label={t("AiCoachPage.trainingVisualization.healthSource")}
      className="max-w-full rounded-md border bg-background px-2 py-1.5 text-sm"
      value={hrvSource ?? (hasOriginalSource ? originalSource : "")}
      onChange={(event) => setHrvSource(event.target.value === originalSource ? undefined : event.target.value || undefined)}
    >
      {!hasOriginalSource ? <option value="">{t("AiCoachPage.trainingVisualization.originalSource")}</option> : null}
      {sources.map((source) => <option key={source.id} value={source.id}>{formatHealthHrvLabel(source)}</option>)}
    </select>
  ) : null;
  const unavailable = chart.isError && ["authentication", "not-found", "permission"].includes(classifyApiError(chart.error));
  if (chart.isPending || chart.isError || !chart.data) return <div className="space-y-2 p-3 text-sm">
    {sourceSelect}
    {metricSourceSelect}
    {grouping}
    <p role="status">{t(chart.isPending ? "ActivityDetail.loading" : unavailable ? "Overview.noData" : "ActivityTimeline.error")}</p>
    {chart.isError && !unavailable ? <Button size="sm" variant="outline" onClick={() => void chart.refetch()}>{t("ActivityTimeline.retry")}</Button> : null}
  </div>;
  const payload = chart.data;
  const refreshedFingerprint = isCoachHealthVisualization(payload) ? payload.fingerprint : payload.provenance.fingerprint;
  const observedAt = payload.observedAt ? new Date(payload.observedAt) : null;
  const updated = !date && !alternateSelected && fingerprint !== refreshedFingerprint ? (
    <p role="status" className="text-xs text-muted-foreground">
      {t("AiCoachPage.trainingVisualization.dataUpdated")}
      {observedAt && Number.isFinite(observedAt.getTime()) ? <> · <time dateTime={payload.observedAt}>
        {format.dateTime(observedAt, { dateStyle: "short", timeStyle: "short" })}
      </time></> : null}
    </p>
  ) : null;
  if (isCoachHealthVisualization(payload)) {
    return (
      <div className="space-y-2">
        {sourceSelect}
        {updated}
        <CoachHealthCard key={hrvSource} payload={payload} />
      </div>
    );
  }
  if (isTrainingVisualizationV2(payload)) {
    return (
      <div className="space-y-2">
        {updated}
        <TrainingVisualizationCard payload={payload} />
      </div>
    );
  }
  const series = selectedMeasure ? payload.series.filter((item) => item.key === selectedMeasure) : payload.series;
  return (
    <div className="space-y-2">
      {metricSourceSelect}
      {grouping}
      {updated}
      {payload.series.length > 1 ? (
        <div className="flex flex-wrap gap-1">
          {payload.series.map(({ key, label }) => (
            <Button key={key} size="sm" variant={key === selectedMeasure ? "secondary" : "ghost"}
              aria-pressed={key === selectedMeasure} onClick={() => setPickedMeasure({ initial: measure, key })}>
              {label ?? t(`AiCoachPage.trainingVisualization.measures.${key}`)}
            </Button>
          ))}
        </div>
      ) : null}
      <TrainingVisualizationCard payload={{ ...payload, series }} />
    </div>
  );
}
