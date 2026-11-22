"use client";

import { useContext, useState } from "react";
import { Activity } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import {
  isCoachHealthVisualization,
  type CoachHealthVisualization,
} from "@shared/ai-coach-schema";
import { formatHealthHrvLabel, getComparableHealthIntraday } from "@shared/health-overview";
import { useHealthIntraday } from "@/api/health-data";
import { Button } from "@/components/ui/button";
import { HealthMetricMiniChart } from "@/components/health/HealthMetricMiniChart";
import { CoachCard } from "./cards/CoachCard";
import { CoachChartPreviewContext, type CoachChartView } from "./coach-preview-panel";

function HealthChart({ result }: { result: CoachHealthVisualization & { chart: NonNullable<CoachHealthVisualization["chart"]> } }) {
  const locale = useLocale();
  const t = useTranslations("AiCoachPage.trainingVisualization");
  const chart = result.chart;
  const [day, setDay] = useState<string | null>(
    result.scope.from === result.scope.to ? result.scope.to
      : result.knownDays === 1 ? result.date : null,
  );
  const detailAvailable = result.scope.metric !== "sleepHeartRate";
  const intraday = useHealthIntraday(chart.key as "sleep" | "hrv" | "restingHeartRate",
    Boolean(day && detailAvailable), day ?? chart.latestDate, chart.hrvType);
  const comparison = day ? getComparableHealthIntraday(chart, intraday.data, day) : undefined;
  const samples = comparison?.current.filter((point) =>
    point.provider === chart.provider && !point.summaryOnly) ?? [];
  const timeline = comparison && samples.length > 0
    ? { ...comparison, current: samples, previous: [] } : undefined;
  return (
    <div className="space-y-2">
      {day && result.scope.from !== result.scope.to ? (
        <Button size="sm" variant="ghost" onClick={() => setDay(null)}>
          {t("showData")} · {result.scope.from} – {result.scope.to}
        </Button>
      ) : null}
      <div className="h-52 min-w-0">
        <HealthMetricMiniChart
          card={chart}
          locale={locale}
          rangeDays={day ? "latest" : "7"}
          currentPoints={day ? chart.points.filter((point) => point.date === day) : chart.points}
          previousPoints={day ? [] : result.comparison?.points ?? []}
          baseline={result.baseline}
          intraday={timeline}
        />
      </div>
      {day && intraday.isFetching ? (
        <p role="status" className="text-xs text-muted-foreground">{t("loadingDetails")}</p>
      ) : day && intraday.isError ? (
        <Button size="sm" variant="outline" onClick={() => void intraday.refetch()}>
          {t("retryDetails")}
        </Button>
      ) : day && !timeline ? (
        <p role="status" className="text-xs text-muted-foreground">{t("dailySummaryOnly")}</p>
      ) : null}
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">{t("showData")}</summary>
        <ul className="mt-1 space-y-1 text-sm">
          {chart.points.map((point) => (
            <li key={point.date} className="flex items-baseline justify-between gap-2">
              {point.value != null && detailAvailable
                ? <Button variant="link" size="auto" onClick={() => setDay(point.date)}>{point.date}</Button>
                : <span>{point.date}</span>}
              <span>{point.value == null ? "—" : chart.key === "sleep"
                ? `${Math.round(point.value / 60)} min`
                : `${point.value} ${chart.latestUnit}`}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function CoachHealthCard({ payload, chartRef }: {
  payload: unknown;
  chartRef?: Pick<CoachChartView, "messageId" | "deliveryId">;
}) {
  const t = useTranslations("AiCoachPage.trainingVisualization");
  const format = useFormatter();
  const openChart = useContext(CoachChartPreviewContext);
  if (!isCoachHealthVisualization(payload)) return null;
  const { scope, date, value, recent, chart } = payload;
  const title = scope.metric === "hrv" ? "HRV"
    : t(`health.${scope.metric === "sleep" && scope.sleepValueKind === "timeInBed" ? "timeInBed" : scope.metric}`);
  const source = scope.hrvType
    ? formatHealthHrvLabel({ hrvType: scope.hrvType, provider: scope.provider ?? null })
    : scope.provider;
  const unit = scope.metric === "hrv" ? "ms" : scope.metric === "sleep" ? "min" : "bpm";
  const formatValue = (input: number) => `${format.number(scope.metric === "sleep" ? input / 60 : input, { maximumFractionDigits: 1 })} ${unit}`;
  const open = (selectedDate?: string) => {
    if (chartRef && openChart) openChart({
      ...chartRef, date: selectedDate, fingerprint: payload.fingerprint,
    }, title);
  };
  const days = (Date.parse(scope.to) - Date.parse(scope.from)) / 86_400_000 + 1;
  const range = days === 1 ? scope.from : `${scope.from} – ${scope.to}`;
  return (
    <CoachCard tone="neutral" dense icon={<Activity className="size-4" />}
      title={title} subtitle={[range, source].filter(Boolean).join(" · ")}>
      <div className="space-y-2">
        {value !== null ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-semibold tabular-nums">{formatValue(value)}</span>
            <span className="text-xs text-muted-foreground">
              {scope.mode === "AVERAGE" || scope.mode === "TREND"
                ? t("observedDays", { known: payload.knownDays, total: days })
                : date}
            </span>
          </div>
        ) : <p role="status" className="text-sm text-muted-foreground">{t("exploration.notes.NO_DATA")}</p>}
        {payload.baseline ? (
          <p className="text-xs text-muted-foreground">
            {t("baselineRange", { low: formatValue(payload.baseline.lower), high: formatValue(payload.baseline.upper) })}
          </p>
        ) : payload.baseline === null ? (
          <p className="text-xs text-muted-foreground">{t("baselineUnavailable")}</p>
        ) : null}
        {payload.comparison && scope.compareFrom && scope.compareTo ? (
          <div className="text-xs text-muted-foreground">
            <span>{scope.compareFrom} – {scope.compareTo} · </span>
            {payload.comparison.value == null ? t("exploration.notes.NO_DATA") :
              <span>{formatValue(payload.comparison.value)} · {t("observedDays", {
                known: payload.comparison.knownDays,
                total: (Date.parse(scope.compareTo) - Date.parse(scope.compareFrom)) / 86_400_000 + 1,
              })}</span>}
          </div>
        ) : null}
        {chart ? <HealthChart result={{ ...payload, chart }} /> : null}
        {value !== null && !chart && chartRef && openChart ? (
          <Button variant="secondary" size="sm" onClick={() => open()}>{t("openChart")}</Button>
        ) : null}
        {recent && !chart && chartRef && openChart ? (
          <Button variant="ghost" size="sm" onClick={() => open(recent.date)}>
            {t("recentHealth", { date: recent.date })} · {formatValue(recent.value)}
          </Button>
        ) : null}
      </div>
    </CoachCard>
  );
}
