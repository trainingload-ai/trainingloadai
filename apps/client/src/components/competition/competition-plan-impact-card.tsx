"use client";

import { useQuery } from "@tanstack/react-query";
import { Sparkles, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { getCurrentCompetitionImpact } from "@/api/competition-events";
import { queryKeys } from "@/lib/query-keys";

export function CompetitionPlanImpactCard({
  anchorDate,
  endDate,
  locale,
  startDate,
}: {
  anchorDate: string;
  endDate: string;
  locale: string;
  startDate: string;
}) {
  const t = useTranslations("CompetitionEvents");
  const importanceLabel = (value?: string) => {
    if (!value || !["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(value))
      return "—";
    return t(`importance.${value}.label`);
  };
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.competitionImpact.current(
      "PLAN_EXECUTION",
      startDate,
      endDate,
      anchorDate,
      locale,
    ),
    queryFn: () =>
      getCurrentCompetitionImpact({
        scopeType: "PLAN_EXECUTION",
        scopeStartDate: startDate,
        scopeEndDate: endDate,
        anchorDate,
        locale,
      }),
    enabled: Boolean(startDate && endDate && anchorDate),
    staleTime: 60_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <section className="rounded-md bg-neutral-100 p-3 text-mobile-caption pc:text-xs text-muted-foreground dark:bg-muted/45">
        {t("planImpact.loading")}
      </section>
    );
  }
  if (!data) return null;

  const assessments = data.result.eventAssessments.filter(
    (item) => item.relevant,
  );
  const conflicts = data.result.combinedImpact.conflicts ?? [];
  if (assessments.length === 0 && conflicts.length === 0) return null;

  return (
    <section className="rounded-md border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900/60 dark:bg-violet-950/20">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-violet-600" />
        {t("planImpact.title")}
      </div>
      <div className="mt-2 space-y-2">
        {assessments.map((assessment) => (
          <div
            key={assessment.eventId}
            className="rounded-md bg-background/80 px-2.5 py-2 text-mobile-caption pc:text-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">
                {data.events.find((event) => event.id === assessment.eventId)
                  ?.title ?? t("planImpact.relevantEvent")}
              </span>
              <span className="text-muted-foreground">
                {Math.round(assessment.confidence * 100)}%
              </span>
            </div>
            {assessment.influenceWindow ? (
              <p className="mt-1 text-muted-foreground">
                {assessment.influenceWindow.startDate} –{" "}
                {assessment.influenceWindow.endDate}
              </p>
            ) : null}
            <p className="mt-1 text-muted-foreground">
              {t("planImpact.athleteImportance")}:{" "}
              {importanceLabel(
                data.events.find((event) => event.id === assessment.eventId)
                  ?.importance,
              )}
              {` · ${t("planImpact.currentImpact")}: ${importanceLabel(assessment.currentImpactLevel)}`}
            </p>
            <p className="mt-1 leading-5">{assessment.reasoningSummary}</p>
          </div>
        ))}
        {conflicts.map((conflict) => (
          <div
            key={`${conflict.type}-${conflict.eventIds.join("-")}`}
            className="flex gap-2 rounded-md bg-amber-50 px-2.5 py-2 text-mobile-caption pc:text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
          >
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{conflict.summary}</span>
          </div>
        ))}
        <p className="text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
          {data.result.combinedImpact.strategySummary}
        </p>
        {data.status === "FALLBACK" ? (
          <p className="text-mobile-caption pc:text-[11px] text-amber-700 dark:text-amber-300">
            {t("planImpact.fallback")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
