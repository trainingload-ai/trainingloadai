"use client";

import {
  FitnessAssessmentCard,
  FitnessTrackingCard,
} from "./fitness-assessment-card";
import type { UIMessage } from "ai";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Activity,
  BarChart3,
  Bike,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Footprints,
  Gauge,
  CircleCheck,
  CircleMinus,
  LayoutDashboard,
  Waves,
  Dumbbell,
  StretchHorizontal,
} from "lucide-react";
import { useContext, useId, useState } from "react";
import { getSportDisplayName } from "@/api/sports";
import { getActivityCards } from "@/api/v2-activities";
import { usePlanDetail } from "@/api/usePlans";
import { getPlanStatusLabel } from "@/components/plan/detail/plan-detail-utils";
import { ActivityCardFooter } from "@/components/activities/activity-card-footer";
import { ActivitySummaryCard } from "@/components/activities/activity-summary-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pagination } from "@/components/ui/Pagination";
import {
  WorkoutRenderer,
  type WorkoutRendererValue,
} from "@/components/workout/WorkoutRenderer";
import { cn } from "@/lib/utils";
import { clockIntlOptions } from "@/lib/time-format";
import { queryKeys } from "@/lib/query-keys";
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
import { isCoachActivitySection, readCoachActivityView, readCoachEntityView, type CoachActivitySection, type CoachActivityView, type CoachEntityView } from "@shared/ai-coach-schema";
import { CoachActivityPreviewContext, CoachLocalPreviewContext } from "./coach-preview-panel";
import { CoachHealthCard } from "./coach-health-card";
import { CoachNavigationCard } from "./cards/coach-navigation-card";
import { CoachPreviewCard, CoachPreviewMetrics } from "./cards/coach-preview-card";
import { isRollingPlan } from "@/lib/rolling-plan";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function getSportIcon(sportType?: string) {
  if (sportType === "CYCLING") return Bike;
  if (sportType === "SWIM") return Waves;
  return Footprints;
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
  chartRef,
}: {
  name: string;
  input: unknown;
  disabled?: boolean;
  chartRef?: { messageId: string; deliveryId: string };
  onAction?: (text: string, content: unknown) => void | Promise<void>;
}) {
  const expectedKind: Record<string, string> = {
    PlanDayView: "plan_day_view",
    ActivityRecent: "activity_recent",
    ActivityDayView: "activity_day_view",
    PmcRange: "pmc_range",
    TrainingVisualization: "training_visualization",
    CoachHealthVisualization: "coach_health_visualization",
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
      return <TrainingVisualizationCard payload={input} chartRef={chartRef} summary />;
    case "CoachHealthVisualization":
      return <CoachHealthCard payload={input} chartRef={chartRef} summary />;
    case "CoachDetailView":
      return <CoachDetailLink payload={input} />;
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

function CoachDetailLink({ payload }: { payload: unknown }) {
  const t = useTranslations();
  const open = useContext(CoachActivityPreviewContext);
  const view = readCoachActivityView(payload) ?? readCoachEntityView(payload);
  if (!view) return <CoachInvalidStructuredCard />;
  if (view.kind === "activity_detail") {
    return <ActivitySummaryList items={[{ hashId: view.hashId, title: t("ActivityDetail.title") }]} target={view} />;
  }
  if (view.kind === "plan_detail") return <CoachPlanDetailCard view={view} />;
  const title = t("sidebar.dashboard");
  const destination = open ? { onOpen: () => open(view, title) } : { href: "/dashboard" };
  return <CoachNavigationCard icon={LayoutDashboard} title={title} {...destination} />;
}

function CoachPlanDetailCard({ view }: { view: Extract<CoachEntityView, { kind: "plan_detail" }> }) {
  const t = useTranslations();
  const planText = useTranslations("V2PlanDetailPage");
  const open = useContext(CoachActivityPreviewContext);
  const { data: plan } = usePlanDetail(view.planId, true, { errorSurface: "inline" });
  const title = plan?.title || view.title;
  const dates = [plan?.startDate?.slice(0, 10), plan?.endDate?.slice(0, 10)].filter(Boolean).join(" – ");
  const subtitle = plan ? [getPlanStatusLabel(planText, plan.status), dates].filter(Boolean).join(" · ") : undefined;
  if (!open) return <CoachNavigationCard icon={ClipboardList} title={title} subtitle={subtitle} href={`/plans/${view.planId}`} />;
  const count = plan?.workouts?.length ?? 0;
  return (
    <CoachPreviewCard icon={ClipboardList} title={title} subtitle={subtitle} onOpen={() => open(view, title)}>
      {plan?.goal ? <p className="line-clamp-2 text-sm text-muted-foreground">{plan.goal}</p> : null}
      {plan ? (
        <CoachPreviewMetrics items={[
          { label: t("V2PlanDetailPage.mobile.currentWeek"), value: isRollingPlan(plan)
            ? plan.currentWeekIndex ?? "—"
            : [plan.currentWeekIndex, plan.periodWeeks].filter((week) => week != null).join(" / ") || "—" },
          { label: t("V2PlansPage.stats.completed"), value: plan.workouts?.filter(({ status }) => status === "DONE").length ?? "—" },
          { label: t("V2PlansPage.stats.plannedSessions"), value: count },
        ]} />
      ) : null}
    </CoachPreviewCard>
  );
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
  const workoutTitleId = useId();
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
              const titleId = `${workoutTitleId}-${idx}`;
              return (
                <Dialog key={String(row.id ?? idx)}>
                  <DialogTrigger asChild>
                    <button
                      type="button"
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
                            <ChevronRight aria-hidden className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
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
                  </DialogTrigger>
                  <DialogContent aria-labelledby={titleId} className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
                    <DialogHeader>
                      <DialogTitle id={titleId}>{label}</DialogTitle>
                      <DialogDescription>
                        {[meta, statusLabel(status)].filter(Boolean).join(" · ")}
                      </DialogDescription>
                    </DialogHeader>
                    {typeof row.notes === "string" && row.notes.trim() && row.notes !== label ? (
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{row.notes}</p>
                    ) : null}
                    <WorkoutRenderer workout={rendererWorkout} density="DETAIL" />
                    {rendererWorkout.text.trim() ? (
                      <details className="min-w-0 text-sm">
                        <summary className="cursor-pointer">{td("workoutText")}</summary>
                        <pre className="mt-2 whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">{rendererWorkout.text}</pre>
                      </details>
                    ) : null}
                  </DialogContent>
                </Dialog>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

const RECENT_ACTIVITY_PAGE_SIZE = 10;

function ActivityRecentCard({ payload }: { payload: unknown }) {
  const t = useTranslations("AiCoachPage.readCards.activityRecent");
  const tc = useTranslations("AiCoachPage.readCards");
  const [open, setOpen] = useState(true);
  const [page, setPage] = useState(1);
  const o = asRecord(payload);
  if (!o || o.kind !== "activity_recent") return null;
  const items = Array.isArray(o.items) ? o.items : [];
  const totalPages = Math.ceil(items.length / RECENT_ACTIVITY_PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(1, totalPages));
  const pageStart = (currentPage - 1) * RECENT_ACTIVITY_PAGE_SIZE;
  return (
    <CoachCard
      tone="neutral"
      icon={<Activity className="h-4 w-4" />}
      title={inlineTitle(t("title"), t("subtitle", { count: items.length }))}
      headerRight={open && totalPages > 1 ? (
        <Pagination
          variant="compact"
          currentPage={currentPage}
          totalItems={items.length}
          itemsPerPage={RECENT_ACTIVITY_PAGE_SIZE}
          onPageChange={setPage}
        />
      ) : null}
      contentClassName="ml-0 bg-transparent p-0 dark:bg-transparent"
      dense
      appearance="strip"
      collapsible
      open={open}
      onOpenChange={setOpen}
      toggleAriaLabel={tc("toggleDetails")}
    >
      {items.length === 0 ? (
        <p className="text-mobile-caption pc:text-xs text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ActivitySummaryList items={items.slice(pageStart, pageStart + RECENT_ACTIVITY_PAGE_SIZE)} />
      )}
    </CoachCard>
  );
}

function ActivityDayViewCard({ payload }: { payload: unknown }) {
  const requestedSection = asRecord(payload)?.section;
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
      defaultCollapsed={requestedSection == null && items.length > 1}
      toggleAriaLabel={tc("toggleDetails")}
    >
      {items.length === 0 ? (
        <p className="text-mobile-caption pc:text-xs text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ActivitySummaryList
          items={items}
          section={isCoachActivitySection(requestedSection) ? requestedSection : undefined}
        />
      )}
    </CoachCard>
  );
}

function ActivitySummaryList({
  items, section = "overview", target,
}: { items: unknown[]; section?: CoachActivitySection; target?: CoachActivityView }) {
  const openPreview = useContext(CoachActivityPreviewContext);
  const tActivityCommon = useTranslations("V2ActivitiesPage.common");
  const tActivityTitle = useTranslations("ActivityTitle");
  const tSports = useTranslations("SportCatalog");
  const { timeFormat } = useStore();
  const activities = items.flatMap((raw) => {
    const item = asRecord(raw);
    if (!item) return [];
    const activityView = target ?? readCoachActivityView({
      kind: "activity_detail", hashId: item.hashId, section,
    });
    return [{ item, activityView }];
  });
  const hashIds = [...new Set(activities.flatMap(({ activityView }) =>
    activityView ? [activityView.hashId] : [],
  ))].sort().slice(0, 20);
  const { data: cardsByHashId } = useQuery({
    queryKey: queryKeys.activity.cards(hashIds),
    queryFn: () => getActivityCards(hashIds),
    enabled: hashIds.length > 0,
    staleTime: 30_000,
    retry: false,
  });

  return (
    <div className="space-y-2">
      {activities.map(({ item, activityView }, idx) => {
        const card = activityView ? cardsByHashId?.get(activityView.hashId) : undefined;
        const sportType = typeof item.sportType === "string" ? item.sportType : card?.sportType ?? "UNKNOWN";
        const subSportType = card?.subSportType ?? (
          typeof item.subSportType === "string" ? item.subSportType
            : typeof item.sportDefinitionCode === "string" ? item.sportDefinitionCode : undefined
        );
        const title = getLocalizedActivityTitle(
          {
            title: card?.title || String(item.title ?? ""),
            sportType,
            startTime: card?.startTime,
            timezone: card?.timezone,
          },
          tActivityTitle,
          tActivityCommon("untitledActivity"),
        );
        const destination = !activityView ? {}
          : openPreview ? { onOpen: () => openPreview(activityView, title) }
            : { href: `/activities/${encodeURIComponent(activityView.hashId)}` };

        return (
          <ActivitySummaryCard
            key={String(item.hashId ?? idx)}
            title={title}
            sportType={sportType}
            subSportType={subSportType}
            sportLabel={getSportDisplayName([], { sportType, subSportType }, tSports)}
            startLabel={formatActivityStart(item.startTime ?? card?.startTime, timeFormat)}
            distanceMeters={typeof item.distanceKm === "number" ? item.distanceKm * 1000 : card?.distance}
            durationSeconds={typeof item.durationMin === "number" ? item.durationMin * 60 : card?.duration}
            load={resolveCoachActivityLoad(item) ?? card?.load}
            note={target ? card?.note : undefined}
            loadLabel={tActivityCommon("load")}
            mapThumbnailUrl={
              card?.mapThumbnailUrl ??
              (typeof item.mapThumbnailUrl === "string" ? item.mapThumbnailUrl : null)
            }
            mapThumbnailDarkUrl={
              card?.mapThumbnailDarkUrl ??
              (typeof item.mapThumbnailDarkUrl === "string" ? item.mapThumbnailDarkUrl : null)
            }
            {...destination}
            footer={card ? <ActivityCardFooter activity={card} /> : null}
          />
        );
      })}
    </div>
  );
}

function PmcRangeCard({ payload }: { payload: unknown }) {
  const t = useTranslations("AiCoachPage.readCards.pmc");
  const openPreview = useContext(CoachLocalPreviewContext);
  const id = useId();
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
  const summaryItems = [
    { label: t("stats.activeDays"), value: String(summary?.activeDays ?? "—") },
    { label: t("stats.restDays"), value: String(summary?.restDays ?? "—") },
    { label: t("stats.totalLoad"), value: String(summary?.totalLoad ?? "—") },
    { label: t("stats.avgDaily"), value: String(summary?.avgDailyLoad ?? "—") },
  ];
  const trend = chartValue.rows.some(({ values }) =>
    [values.ATL, values.CTL, values.TSB].some((value) => value != null));
  const subtitle = `${chartValue.provenance.from} – ${chartValue.provenance.to}`;
  const detail = trend ? <TrainingVisualizationContent value={chartValue} /> : null;
  return (
    <CoachPreviewCard icon={BarChart3} title={t("title")} subtitle={subtitle}
      onOpen={trend && openPreview ? () => openPreview(id, t("title"), (
        <div className="space-y-3">
          <CoachPreviewMetrics items={[
            { label: `${tPmc("fatigue.title")} (ATL)`, value: String(chartValue.summary.ATL ?? "—") },
            { label: `${tPmc("fitness.title")} (CTL)`, value: String(chartValue.summary.CTL ?? "—") },
            { label: `${tPmc("form.title")} (TSB)`, value: String(chartValue.summary.TSB ?? "—") },
          ]} />
          {detail}
        </div>
      )) : undefined}>
      <CoachPreviewMetrics items={summaryItems} />
      {!openPreview ? detail : null}
    </CoachPreviewCard>
  );
}

function ProfileZonesCard({ payload }: { payload: unknown }) {
  const t = useTranslations("AiCoachPage.readCards.profileZones");
  const o = asRecord(payload);
  if (!o || o.kind !== "profile_zones") return null;
  const za = asRecord(o.zoneAvailability);
  const status = asRecord(o.zoneStatus);
  const available = [
    { label: t("zonesHr"), enabled: za?.hasHeartRateZones === true || asRecord(status?.heartRate)?.configured === true },
    { label: t("zonesPace"), enabled: za?.hasPaceZones === true || asRecord(status?.pace)?.configured === true },
    { label: t("zonesPower"), enabled: za?.hasPowerZones === true || asRecord(status?.power)?.configured === true },
  ];
  return (
    <CoachPreviewCard
      icon={Gauge} title={t("title")}
      subtitle={[o.timezone, o.heartRateZoneModel]
        .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
        .join(" · ")}
    >
      <CoachPreviewMetrics items={[
        { label: "FTP", value: String(o.ftp ?? "—") },
        { label: "LTHR", value: String(o.lthr ?? "—") },
        { label: t("maxHr"), value: String(o.maxHeartRate ?? "—") },
        ...(o.cp != null ? [{ label: "CP", value: String(o.cp) }] : []),
      ]} />
      <ul className="flex flex-wrap gap-2">
        {available.map(({ label, enabled }) => {
          const Icon = enabled ? CircleCheck : CircleMinus;
          return (
            <li key={label} className={cn("inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-xs",
              enabled ? "bg-success/10 text-success" : "bg-background/65 text-muted-foreground")}>
              <Icon size={13} role="img" aria-label={enabled ? "✓" : "—"} />
              {label}
            </li>
          );
        })}
      </ul>
    </CoachPreviewCard>
  );
}
