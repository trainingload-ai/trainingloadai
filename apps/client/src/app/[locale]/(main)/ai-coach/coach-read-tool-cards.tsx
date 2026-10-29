"use client";

import {
  FitnessAssessmentCard,
  FitnessTrackingCard,
} from "./fitness-assessment-card";
import type { UIMessage } from "ai";
import { useTranslations } from "next-intl";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bike,
  CalendarDays,
  Footprints,
  Gauge,
  HeartPulse,
  Waves,
  Zap,
  Dumbbell,
  StretchHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import type { SportType } from "@/api/activities";
import { ActivitySummaryCard } from "@/components/activities/activity-summary-card";
import { ViewWorkoutDialog } from "@/components/plan/view-workout-dialog";
import {
  WorkoutRenderer,
  type WorkoutRendererValue,
} from "@/components/workout/WorkoutRenderer";
import { cn } from "@/lib/utils";
import { clockIntlOptions } from "@/lib/time-format";
import { useStore } from "@/lib/store";
import {
  COACH_READ_TOOL_CARD_NAMES,
  getCoachAssistantToolItemsByName,
} from "./coach-conversation-items";
import { CoachCard } from "./cards/CoachCard";
import { CoachInvalidStructuredCard } from "./coach-invalid-structured-card";
import { ProfileZoneRangesCard } from "./profile-zone-ranges-card";
import { getLocalizedActivityTitle } from "@/lib/activity-title";
import {
  TrainingVisualizationCard,
  TrainingVisualizationContent,
} from "./training-visualization-card";
import type { TrainingVisualizationV1 } from "@shared/training-visualization";
import { resolveCoachActivityLoad } from "./coach-activity-load";
import { parseCoachCompetitionEvents } from "@shared/coach-competition-events";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function getSportIcon(sportType?: string) {
  if (sportType === "CYCLING") return Bike;
  if (sportType === "SWIM") return Waves;
  return Footprints;
}

function getSportLabel(sportType?: string) {
  if (sportType === "CYCLING") return "Ride";
  if (sportType === "SWIM") return "Swim";
  if (sportType === "RUN") return "Run";
  return "Other";
}

function formatActivityDuration(durationMin: unknown) {
  if (typeof durationMin !== "number" || !Number.isFinite(durationMin)) {
    return "--";
  }
  const totalSeconds = Math.round(durationMin * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0
    ? `${h}:${`${m}`.padStart(2, "0")}:${`${s}`.padStart(2, "0")}`
    : `${m}:${`${s}`.padStart(2, "0")}`;
}

function formatActivityDistance(distanceKm: unknown) {
  if (typeof distanceKm !== "number" || !Number.isFinite(distanceKm)) {
    return "--";
  }
  return `${distanceKm.toFixed(distanceKm >= 10 ? 1 : 2)} km`;
}

function formatActivityStart(startTime: unknown, timeFormat: string) {
  if (typeof startTime !== "string" || !startTime) return "";
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...clockIntlOptions(timeFormat),
  }).format(date);
}

function inlineTitle(title: string, subtitle?: string | null) {
  const cleanSubtitle = String(subtitle ?? "").trim();
  return cleanSubtitle ? `${title} ｜ ${cleanSubtitle}` : title;
}

/** 落库助手消息 metadata 内的 read 工具卡片（每条助手气泡下渲染） */
export function CoachAssistantReadToolCards({
  message,
}: {
  message: UIMessage;
}) {
  if (message.role !== "assistant") return null;
  const blocks = getCoachAssistantToolItemsByName(
    message,
    COACH_READ_TOOL_CARD_NAMES,
  );
  if (!blocks.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {blocks.map((b) => (
        <CoachReadToolCard key={b.id} name={b.name ?? ""} input={b.payload} />
      ))}
    </div>
  );
}

/** 流式阶段 SSE 下发的卡片（尚无落库 metadata 时） */
export function CoachVolatileReadToolCards({
  cards,
}: {
  cards: Array<{ name: string; input: unknown }>;
}) {
  if (!cards.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {cards.map((c, i) => (
        <CoachReadToolCard
          key={`${c.name}-${i}`}
          name={c.name}
          input={c.input}
        />
      ))}
    </div>
  );
}

export function CoachReadToolCard({
  name,
  input,
  onAction,
  disabled,
}: {
  name: string;
  input: unknown;
  disabled?: boolean;
  onAction?: (text: string, content: unknown) => void | Promise<void>;
}) {
  const expectedKind: Record<string, string> = {
    PlanDayView: "plan_day_view",
    ActivityRecent: "activity_recent",
    ActivityDayView: "activity_day_view",
    PmcRange: "pmc_range",
    TrainingVisualization: "training_visualization",
    ProfileZones: "profile_zones",
    ProfileZoneRanges: "profile_zone_ranges",
    CompetitionEvents: "competition_events",
  };
  const payloadKind = asRecord(input)?.kind;
  if (expectedKind[name] && payloadKind !== expectedKind[name]) {
    return <CoachInvalidStructuredCard />;
  }
  switch (name) {
    case "FitnessTracking":
      return (
        <FitnessTrackingCard
          input={input}
          onAction={onAction}
          disabled={disabled}
        />
      );
    case "FitnessAssessment":
      return (
        <FitnessAssessmentCard
          input={input}
          onAction={onAction}
          disabled={disabled}
        />
      );
    case "PlanDayView":
      return <PlanDayViewCard payload={input} />;
    case "ActivityRecent":
      return <ActivityRecentCard payload={input} />;
    case "ActivityDayView":
      return <ActivityDayViewCard payload={input} />;
    case "PmcRange":
      return <PmcRangeCard payload={input} />;
    case "TrainingVisualization":
      return <TrainingVisualizationCard payload={input} />;
    case "ProfileZones":
      return <ProfileZonesCard payload={input} />;
    case "ProfileZoneRanges":
      return <ProfileZoneRangesCard payload={input} />;
    case "CompetitionEvents":
      return <CompetitionEventsCard payload={input} />;
    default:
      return null;
  }
}

function CompetitionEventsCard({ payload }: { payload: unknown }) {
  const t = useTranslations("AiCoachPage.readCards.competitionEvents");
  const data = parseCoachCompetitionEvents(payload);
  if (!data) return <CoachInvalidStructuredCard />;
  return (
    <CoachCard
      title={t("title")}
      subtitle={`${data.startDate} — ${data.endDate}`}
      icon={<CalendarDays />}
      collapsible
    >
      {data.events.length ? (
        <ul className="space-y-2">
          {data.events.map((event, index) => (
            <li
              key={`${event.startDate}:${index}`}
              className="rounded-sm bg-background/70 px-3 py-2"
            >
              <p className="text-sm font-medium">{event.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {event.startDate}
                {event.endDate && event.endDate !== event.startDate
                  ? ` — ${event.endDate}`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      )}
      {data.total > data.events.length ? (
        <p className="text-xs text-muted-foreground">
          {t("limited", { count: data.events.length, total: data.total })}
        </p>
      ) : null}
    </CoachCard>
  );
}

function PlanDayViewCard({ payload }: { payload: unknown }) {
  const t = useTranslations("AiCoachPage.readCards.planDay");
  const td = useTranslations("AiCoachPage.decision");
  const tw = useTranslations("WorkoutEditor.fields.sportType.options");
  const [selectedWorkout, setSelectedWorkout] = useState<Record<
    string,
    unknown
  > | null>(null);
  const o = asRecord(payload);
  const date = o?.kind === "plan_day_view" ? String(o.date ?? "") : "";
  const plan =
    o?.kind === "plan_day_view"
      ? (o.plan as { id?: string; title?: string | null } | null)
      : null;
  const workouts =
    o?.kind === "plan_day_view" && Array.isArray(o.workouts) ? o.workouts : [];
  const outside = o?.kind === "plan_day_view" && o.outsidePlanRange === true;
  const wk =
    o?.kind === "plan_day_view" && o.weekIndex != null
      ? Number(o.weekIndex)
      : null;
  const dk =
    o?.kind === "plan_day_view" && o.dayIndex != null
      ? Number(o.dayIndex)
      : null;
  const sportLabel = (sportType: string) => {
    if (sportType === "CYCLING") return tw("cycling");
    if (sportType === "SWIM") return tw("swim");
    if (sportType === "RUN") return tw("run");
    return sportType || "—";
  };
  const statusLabel = (status: string) => {
    if (status === "PLANNED") return td("statusValue.PLANNED");
    if (status === "IN_PROGRESS") return td("statusValue.IN_PROGRESS");
    if (status === "DONE") return td("statusValue.DONE");
    if (status === "SKIPPED") return td("statusValue.SKIPPED");
    if (status === "MOVED") return td("statusValue.MOVED");
    return status;
  };
  const selectedPlanWorkout = useMemo(() => {
    if (!selectedWorkout) return null;
    const sportType = String(selectedWorkout.sportType ?? "RUN") as SportType;
    return {
      id: String(selectedWorkout.id ?? ""),
      sportType,
      name:
        typeof selectedWorkout.name === "string" ? selectedWorkout.name : null,
      notes:
        typeof selectedWorkout.notes === "string"
          ? selectedWorkout.notes
          : null,
      text:
        typeof selectedWorkout.text === "string" ? selectedWorkout.text : "",
      weekIndex:
        typeof selectedWorkout.weekIndex === "number"
          ? selectedWorkout.weekIndex
          : wk,
      dayIndex:
        typeof selectedWorkout.dayIndex === "number"
          ? selectedWorkout.dayIndex
          : dk,
    };
  }, [dk, selectedWorkout, wk]);
  if (!o || o.kind !== "plan_day_view") return null;

  return (
    <>
      <div className="space-y-2">
        {outside && plan ? (
          <p className="rounded-md bg-neutral-100 px-3 py-2 text-mobile-caption text-muted-foreground dark:bg-muted/45 pc:text-xs">
            {t("outsideRange")}
          </p>
        ) : null}
        {workouts.length === 0 ? (
          <div className="flex items-start gap-3 rounded-md bg-neutral-100 px-3 py-3 dark:bg-muted/45">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{date}</p>
              <p className="mt-0.5 text-mobile-caption text-muted-foreground pc:text-xs">
                {t("emptyDay")}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {workouts.map((w: unknown, idx: number) => {
              const row = asRecord(w);
              if (!row) return null;
              const sportType = String(row.sportType ?? "RUN");
              const SportIcon =
                row.structureKind === "STRENGTH"
                  ? Dumbbell
                  : sportType === "STRETCHING"
                    ? StretchHorizontal
                    : getSportIcon(sportType);
              const label =
                String(row.name ?? "").trim() ||
                String(row.notes ?? "").trim() ||
                sportLabel(sportType);
              const status = String(row.status ?? "");
              const sessionIndex =
                typeof row.sessionIndex === "number" ? row.sessionIndex : null;
              const workoutWeek =
                typeof row.weekIndex === "number" ? row.weekIndex : wk;
              const workoutDay =
                typeof row.dayIndex === "number" ? row.dayIndex : dk;
              const meta = [
                date,
                workoutWeek != null && workoutDay != null
                  ? t("weekDay", { week: workoutWeek, day: workoutDay })
                  : null,
                sessionIndex != null
                  ? t("session", { index: sessionIndex })
                  : sportLabel(sportType),
              ]
                .filter(Boolean)
                .join(" · ");
              const rendererWorkout = {
                sportType,
                text: String(row.text ?? ""),
                structureKind: row.structureKind,
                structure: row.structure,
                summary: row.summary,
                blocks: row.blocks,
              } as WorkoutRendererValue;
              return (
                <button
                  key={String(row.id ?? idx)}
                  type="button"
                  onClick={() => setSelectedWorkout(row)}
                  className={cn(
                    "w-full min-w-0 rounded-md bg-neutral-100 p-3 text-left transition-colors hover:bg-neutral-200/70 dark:bg-muted/45 dark:hover:bg-muted/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0 text-muted-foreground">
                      <SportIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <div className="break-words text-sm font-medium">
                              {label}
                            </div>
                            {status ? (
                              <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-mobile-caption pc:text-[11px] font-medium text-muted-foreground">
                                {statusLabel(status)}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 text-mobile-caption text-muted-foreground pc:text-xs">
                            {meta}
                          </div>
                        </div>
                        <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
                      </div>
                    </div>
                  </div>
                  <WorkoutRenderer
                    workout={rendererWorkout}
                    density="COMPACT"
                    chartHeight={72}
                    className="mt-3 overflow-hidden rounded-md"
                  />
                  {typeof row.notes === "string" &&
                  row.notes.trim() &&
                  row.notes !== label ? (
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {row.notes}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedPlanWorkout ? (
        <ViewWorkoutDialog
          open={selectedWorkout != null}
          onOpenChange={(open) => {
            if (!open) setSelectedWorkout(null);
          }}
          planId={String(plan?.id ?? "") || undefined}
          workoutId={selectedPlanWorkout.id || undefined}
          weekIndex={
            typeof selectedPlanWorkout.weekIndex === "number"
              ? selectedPlanWorkout.weekIndex - 1
              : undefined
          }
          dayIndex={
            typeof selectedPlanWorkout.dayIndex === "number"
              ? selectedPlanWorkout.dayIndex - 1
              : undefined
          }
          notes={selectedPlanWorkout.notes}
          text={selectedPlanWorkout.text}
          sportType={selectedPlanWorkout.sportType}
        />
      ) : null}
    </>
  );
}

function ActivityRecentCard({ payload }: { payload: unknown }) {
  const t = useTranslations("AiCoachPage.readCards.activityRecent");
  const tc = useTranslations("AiCoachPage.readCards");
  const o = asRecord(payload);
  if (!o || o.kind !== "activity_recent") return null;
  const items = Array.isArray(o.items) ? o.items : [];
  return (
    <CoachCard
      tone="neutral"
      icon={<Activity className="h-4 w-4" />}
      title={inlineTitle(t("title"), t("subtitle", { count: items.length }))}
      contentClassName="bg-transparent p-0 dark:bg-transparent"
      dense
      appearance="strip"
      collapsible
      defaultCollapsed={false}
      toggleAriaLabel={tc("toggleDetails")}
    >
      {items.length === 0 ? (
        <p className="text-mobile-caption pc:text-xs text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ActivitySummaryList items={items} />
      )}
    </CoachCard>
  );
}

function ActivityDayViewCard({ payload }: { payload: unknown }) {
  const t = useTranslations("AiCoachPage.readCards.activityDay");
  const tc = useTranslations("AiCoachPage.readCards");
  const o = asRecord(payload);
  if (!o || o.kind !== "activity_day_view") return null;
  const date = String(o.date ?? "");
  const items = Array.isArray(o.items) ? o.items : [];
  return (
    <CoachCard
      tone="neutral"
      icon={<CalendarDays className="h-4 w-4" />}
      title={inlineTitle(
        t("title", { date }),
        t("subtitle", { count: items.length }),
      )}
      contentClassName="bg-transparent p-0 dark:bg-transparent"
      dense
      appearance="strip"
      collapsible
      defaultCollapsed
      toggleAriaLabel={tc("toggleDetails")}
    >
      {items.length === 0 ? (
        <p className="text-mobile-caption pc:text-xs text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ActivitySummaryList items={items} />
      )}
    </CoachCard>
  );
}

function ActivitySummaryList({ items }: { items: unknown[] }) {
  const router = useRouter();
  const tActivityCommon = useTranslations("V2ActivitiesPage.common");
  const tActivityTitle = useTranslations("ActivityTitle");
  const { timeFormat } = useStore();

  return (
    <div className="space-y-2">
      {items.map((raw: unknown, idx: number) => {
        const item = asRecord(raw);
        if (!item) return null;
        const sportType = String(item.sportType ?? "RUN");
        const hashId = String(item.hashId ?? "");
        const load = resolveCoachActivityLoad(item);
        const title = getLocalizedActivityTitle(
          { title: String(item.title ?? ""), sportType },
          tActivityTitle,
          getSportLabel(sportType),
        );
        const hasFooter =
          typeof item.avgHr === "number" ||
          typeof item.avgPower === "number" ||
          typeof item.vo2max === "number";

        return (
          <ActivitySummaryCard
            key={String(item.hashId ?? idx)}
            title={title}
            sportType={sportType}
            startLabel={formatActivityStart(item.startTime, timeFormat)}
            distanceLabel={formatActivityDistance(item.distanceKm)}
            durationLabel={formatActivityDuration(item.durationMin)}
            load={load}
            loadLabel={tActivityCommon("load")}
            mapThumbnailUrl={
              typeof item.mapThumbnailUrl === "string"
                ? item.mapThumbnailUrl
                : null
            }
            onOpen={
              hashId ? () => router.push(`/activities/${hashId}`) : undefined
            }
            footer={
              hasFooter ? (
                <div className="flex flex-wrap gap-2 text-mobile-caption pc:text-xs text-muted-foreground">
                  {typeof item.avgHr === "number" ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-background/70 px-2 py-1 dark:bg-background/35">
                      <HeartPulse className="h-3.5 w-3.5" />
                      {item.avgHr} bpm
                    </span>
                  ) : null}
                  {typeof item.avgPower === "number" ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-background/70 px-2 py-1 dark:bg-background/35">
                      <Zap className="h-3.5 w-3.5" />
                      {item.avgPower} W
                    </span>
                  ) : null}
                  {typeof item.vo2max === "number" ? (
                    <span className="rounded-md bg-background/70 px-2 py-1 tabular-nums dark:bg-background/35">
                      VO2 {item.vo2max}
                    </span>
                  ) : null}
                </div>
              ) : null
            }
          />
        );
      })}
    </div>
  );
}

function PmcRangeCard({ payload }: { payload: unknown }) {
  const t = useTranslations("AiCoachPage.readCards.pmc");
  const tc = useTranslations("AiCoachPage.readCards");
  const tPmc = useTranslations("PMC");
  const o = asRecord(payload);
  if (!o || o.kind !== "pmc_range") return null;
  const summary = asRecord(o.summary);
  const points = Array.isArray(o.points) ? o.points : [];
  const last = points.length > 0 ? asRecord(points[points.length - 1]) : null;
  const chartValue: TrainingVisualizationV1 = {
    kind: "training_visualization",
    schemaVersion: 1,
    title: t("title"),
    intent: "TREND",
    view: "LINE",
    x: { key: "label", type: "TIME" },
    series: [
      { key: "ATL", unit: "load" },
      { key: "CTL", unit: "load" },
      { key: "TSB", unit: "load" },
    ],
    rows: points.flatMap((point, index) => {
      const row = asRecord(point);
      if (!row) return [];
      return [
        {
          key: String(row.date ?? index),
          label: String(row.date ?? ""),
          start: String(row.date ?? ""),
          end: String(row.date ?? ""),
          values: {
            ATL: typeof row.ATL === "number" ? row.ATL : null,
            CTL: typeof row.CTL === "number" ? row.CTL : null,
            TSB: typeof row.TSB === "number" ? row.TSB : null,
          },
        },
      ];
    }),
    summary: {
      ATL: typeof last?.ATL === "number" ? last.ATL : null,
      CTL: typeof last?.CTL === "number" ? last.CTL : null,
      TSB: typeof last?.TSB === "number" ? last.TSB : null,
    },
    provenance: {
      source: "PMC",
      from: String(o.from ?? ""),
      to: String(o.to ?? ""),
      timezone: "",
      groupBy: String(o.granularity) === "week" ? "WEEK" : "DAY",
      sportTypes: [],
      complete: true,
      truncated: false,
      coverage: { ATL: 1, CTL: 1, TSB: 1 },
      fingerprint: `legacy-pmc:${String(o.from ?? "")}:${String(o.to ?? "")}`,
    },
  };
  return (
    <CoachCard
      tone="info"
      icon={<BarChart3 className="h-4 w-4" />}
      title={inlineTitle(
        t("title"),
        `${String(o.from ?? "")} → ${String(o.to ?? "")}`,
      )}
      dense
      appearance="strip"
      collapsible
      defaultCollapsed
      toggleAriaLabel={tc("toggleDetails")}
    >
      <CoachCard.StatGrid
        items={[
          {
            label: t("stats.activeDays"),
            value: summary ? String(summary.activeDays ?? "—") : "—",
          },
          {
            label: t("stats.restDays"),
            value: summary ? String(summary.restDays ?? "—") : "—",
          },
          {
            label: t("stats.totalLoad"),
            value: summary ? String(summary.totalLoad ?? "—") : "—",
          },
          {
            label: t("stats.avgDaily"),
            value: summary ? String(summary.avgDailyLoad ?? "—") : "—",
          },
          ...(last
            ? [
                {
                  label: `${tPmc("fatigue.title")} (${tPmc("abbr.fatigue")})`,
                  value: last.ATL != null ? String(last.ATL) : "—",
                },
                {
                  label: `${tPmc("fitness.title")} (${tPmc("abbr.fitness")})`,
                  value: last.CTL != null ? String(last.CTL) : "—",
                },
                {
                  label: `${tPmc("form.title")} (${tPmc("abbr.form")})`,
                  value: last.TSB != null ? String(last.TSB) : "—",
                },
              ]
            : []),
        ]}
      />
      {chartValue.rows.length > 1 ? (
        <div className="mt-3">
          <TrainingVisualizationContent value={chartValue} />
        </div>
      ) : null}
    </CoachCard>
  );
}

function ProfileZonesCard({ payload }: { payload: unknown }) {
  const t = useTranslations("AiCoachPage.readCards.profileZones");
  const tc = useTranslations("AiCoachPage.readCards");
  const o = asRecord(payload);
  if (!o || o.kind !== "profile_zones") return null;
  const za = asRecord(o.zoneAvailability);
  return (
    <CoachCard
      tone="neutral"
      icon={<Gauge className="h-4 w-4" />}
      title={inlineTitle(t("title"), String(o.timezone ?? "") || undefined)}
      dense
      appearance="strip"
      collapsible
      defaultCollapsed
      toggleAriaLabel={tc("toggleDetails")}
    >
      <CoachCard.StatGrid
        items={[
          {
            label: "FTP",
            value: o.ftp != null ? String(o.ftp) : "—",
          },
          {
            label: "LTHR",
            value: o.lthr != null ? String(o.lthr) : "—",
          },
          {
            label: t("maxHr"),
            value: o.maxHeartRate != null ? String(o.maxHeartRate) : "—",
          },
          {
            label: t("zonesHr"),
            value: za?.hasHeartRateZones ? "✓" : "—",
          },
          {
            label: t("zonesPower"),
            value: za?.hasPowerZones ? "✓" : "—",
          },
          {
            label: t("zonesPace"),
            value: za?.hasPaceZones ? "✓" : "—",
          },
        ]}
      />
    </CoachCard>
  );
}
