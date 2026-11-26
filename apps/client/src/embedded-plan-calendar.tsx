"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, useTranslations, type AbstractIntlMessages } from "next-intl";
import { useState } from "react";
import type { CalendarIsoWeekday } from "@shared/plan-calendar";
import {
  CoachPlanDraftCalendarPreview,
  type PlanCalendarWorkoutSelection,
} from "./app/[locale]/(main)/ai-coach/coach-plan-draft-calendar-preview";
import type { CoachPlanDraft } from "./lib/coach-plan-draft";
import type { PlanWorkoutAdjustmentWorkout } from "@shared/ai-coach-schema";
import { normalizeAdjustmentSportType } from "./lib/plan-workout-adjustment-draft";
import { WorkoutRenderer, type WorkoutRendererValue } from "./components/workout/WorkoutRenderer";
import { PlanWorkoutAdjustmentComparison } from "./app/[locale]/(main)/ai-coach/plan-workout-adjustment-comparison";
import { ActivitySummaryCard } from "./components/activities/activity-summary-card";
import { getLocalizedActivityTitle } from "./lib/activity-title";
import { getSportDisplayName } from "./api/sports";
import { TrainingVisualizationContent } from "./app/[locale]/(main)/ai-coach/training-visualization-card";
import type { TrainingVisualizationV1 } from "@shared/training-visualization";
import { ActivityZoneTable } from "./app/[locale]/(main)/activities/[activityId]/components/activity-zone-table";
import { getPowerZoneColorByZone } from "./utils/util";

export { Button } from "./components/ui/button";
export { ActivitySummaryMetrics } from "./app/[locale]/(main)/activities/[activityId]/components/activity-summary-metrics";

export type EmbeddedPlanCalendarData = {
  draft: CoachPlanDraft;
  startDate?: string;
  calendarTimeZone: string;
  locale?: string;
  firstDayOfWeek?: CalendarIsoWeekday;
};

export type EmbeddedPlanCalendarMessages = AbstractIntlMessages;

type EmbeddedLocale = { locale: string; messages: EmbeddedPlanCalendarMessages };

export type EmbeddedWorkoutAdjustmentData = Record<"before" | "after", PlanWorkoutAdjustmentWorkout & {
  definition?: Pick<WorkoutRendererValue, "structureKind" | "structure" | "summary">;
}>;

function EmbeddedWorkoutPreview({ workout }: { workout: EmbeddedWorkoutAdjustmentData["before"] }) {
  const t = useTranslations("AiCoachPage.decision");
  return (
    <div className="mt-3 min-w-0 space-y-2">
      {workout.definition && <WorkoutRenderer workout={{
        ...workout.definition, text: workout.text, sportType: normalizeAdjustmentSportType(workout.sportType),
      }} density="COMPACT" chartHeight={80} className="overflow-hidden rounded-md" />}
      {workout.text && <details className="text-xs text-muted-foreground" open={workout.definition ? undefined : true}>
        <summary className="cursor-pointer py-1">{t("workoutText")}</summary>
        <pre className="mt-1 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 text-foreground">{workout.text}</pre>
      </details>}
    </div>
  );
}

export function EmbeddedWorkoutAdjustment({ draft, locale, messages }: EmbeddedLocale & { draft: EmbeddedWorkoutAdjustmentData }) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <PlanWorkoutAdjustmentComparison draft={draft} renderWorkout={(_, side) => <EmbeddedWorkoutPreview workout={draft[side]} />} />
    </NextIntlClientProvider>
  );
}

type ActivitySummary = {
  name?: string; sportType?: string; startTime?: string; timezone?: string;
  startLabel?: string; distanceMeters?: number; durationSeconds?: number; load?: number;
  onOpen?: () => void;
};

function TranslatedActivitySummary({ name, sportType = "UNKNOWN", startTime, timezone, ...props }: ActivitySummary) {
  const t = useTranslations("V2ActivitiesPage.common");
  const titles = useTranslations("ActivityTitle");
  const sports = useTranslations("SportCatalog");
  return <ActivitySummaryCard {...props} sportType={sportType}
    title={getLocalizedActivityTitle({ title: name, sportType, startTime, timezone }, titles, t("untitledActivity"))}
    sportLabel={getSportDisplayName([], { sportType }, sports)} loadLabel={t("load")} />;
}

export function EmbeddedActivitySummary({ locale, messages, ...props }: EmbeddedLocale & ActivitySummary) {
  return <NextIntlClientProvider locale={locale} messages={messages} timeZone={props.timezone ?? "UTC"}>
    <TranslatedActivitySummary {...props} />
  </NextIntlClientProvider>;
}

function ActivityZones({ points }: { points: Array<{ order: number; name?: string; percent: number | null; durationMinutes: number | null }> }) {
  const t = useTranslations("ActivityDetail.zoneTable");
  return <ActivityZoneTable
    rows={points.map((point, index) => ({
      id: String(point.order), label: point.name ?? `Z${index + 1}`,
      percent: point.percent, duration: point.durationMinutes === null ? null : point.durationMinutes * 60,
      color: getPowerZoneColorByZone(undefined, index + 1) ?? getPowerZoneColorByZone(),
    }))} zoneLabel={t("zone")} distributionLabel={t("distribution")} durationLabel={t("duration")} emptyLabel={t("noData")} />;
}

export function EmbeddedActivityZones({ locale, messages, ...props }: EmbeddedLocale & Parameters<typeof ActivityZones>[0]) {
  return <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><ActivityZones {...props} /></NextIntlClientProvider>;
}

export function EmbeddedTrainingLoad({ title, points, from, to, timezone, locale, messages }: EmbeddedLocale & {
  title: string;
  from: string;
  to: string;
  timezone: string;
  points: Array<{ date: string; atl: number | null; ctl: number | null; tsb: number | null }>;
}) {
  const keys = ["ATL", "CTL", "TSB"] as const;
  const last = points.at(-1);
  const value: TrainingVisualizationV1 = {
    kind: "training_visualization", schemaVersion: 1, title, intent: "TREND", view: "LINE",
    x: { key: "label", type: "TIME" },
    series: keys.map((key) => ({ key, unit: "load" })),
    rows: points.map(({ date, atl, ctl, tsb }) => ({
      key: date, label: date, start: date, end: date, values: { ATL: atl, CTL: ctl, TSB: tsb },
    })),
    summary: { ATL: last?.atl ?? null, CTL: last?.ctl ?? null, TSB: last?.tsb ?? null },
    provenance: {
      source: "PMC", from, to, timezone, groupBy: "DAY", sportTypes: [], complete: true, truncated: false,
      coverage: {}, fingerprint: `mcp:${from}:${to}`,
    },
  };
  return <NextIntlClientProvider locale={locale} messages={messages} timeZone={timezone}>
    <TrainingVisualizationContent value={value} />
  </NextIntlClientProvider>;
}

export function EmbeddedPlanCalendar({
  draft,
  startDate,
  calendarTimeZone,
  className,
  firstDayOfWeek,
  fillHeight,
  workoutDetailsInPanel = false,
  workoutSelection,
  weekOffset = 0,
  locale,
  messages,
}: EmbeddedPlanCalendarData & {
  className?: string;
  fillHeight?: boolean;
  workoutDetailsInPanel?: boolean;
  workoutSelection?: PlanCalendarWorkoutSelection;
  weekOffset?: number;
  locale: string;
  messages: EmbeddedPlanCalendarMessages;
}) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone={calendarTimeZone}
    >
      <QueryClientProvider client={queryClient}>
        <CoachPlanDraftCalendarPreview
          className={className}
          draft={draft}
          startDate={startDate}
          calendarTimeZone={calendarTimeZone}
          firstDayOfWeek={firstDayOfWeek}
          weekOffset={weekOffset}
          scheduleConstraints={draft.scheduleConstraints}
          variant={fillHeight ? "embedded" : "default"}
          workoutSelection={workoutSelection}
          workoutDetailsPresentation={workoutDetailsInPanel ? "panel" : "embedded-dialog"}
          responsiveToContainer
          allowRemoteWorkoutDetails={false}
        />
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}
