"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import dayjs from "dayjs";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Link2,
  MoreHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useSearchParams } from "next/navigation";
import { useActivePlan } from "@/api/usePlans";
import type { PlanWorkout, PlanWorkoutLink } from "@/api/plans";
import { ActivityUploadCard } from "@/components/activities/ActivityUploadCard";
import { LazyFileUploadDialog } from "@/components/activities/LazyFileUploadDialog";
import { Button } from "@/components/ui/button";
import { PlanWorkoutActivityLinkControl } from "@/components/plan/plan-workout-activity-link-control";
import { PlanWorkoutListRow } from "@/components/plan/plan-workout-list-row";
import { WorkoutMiniChart } from "@/components/plan/mobile-plan-workout-row";
import { getPlanWorkoutDisplayKind } from "@/components/plan/detail/plan-detail-utils";
import { PlanExecutionAdviceCard } from "@/components/plan/PlanExecutionAdviceCard";
import { usePlanWorkoutActions } from "@/hooks/usePlanWorkoutActions";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { queryKeys } from "@/lib/query-keys";
import { invalidateActivePlanAndPlanDetails } from "@/lib/query-invalidation";
import {
  estimateWorkoutDurationSeconds,
  formatWorkoutDuration,
} from "@/lib/workout-display-utils";
import {
  getCompetitionEvents,
  type CompetitionEvent,
} from "@/api/competition-events";
import { CompetitionEventDialog } from "@/components/competition/competition-event-dialog";
import { CalendarSelect } from "@/components/calendar-select";
import {
  getLocalizedActivityTitle,
  type ActivityTitleTranslator,
} from "@/lib/activity-title";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

const ViewWorkoutDialog = dynamic(
  () =>
    import("@/components/plan/view-workout-dialog").then(
      (module) => module.ViewWorkoutDialog,
    ),
  { ssr: false },
);

type TranslateFn = ReturnType<typeof useTranslations>;
type DayPlanData = {
  planId: string | null;
  date: string;
  dateLabel: string;
  weekday: string;
  cycle: string;
  description: string | null;
  weekLabel: string;
  intent: string;
  summary: {
    plannedLoad: number;
    completedLoad: number;
    plannedDuration: string;
    completedCount: number;
    totalCount: number;
  };
  coach: {
    title: string;
    body: string;
    tags: string[];
  };
  workouts: ReturnType<typeof mapWorkoutToDayItem>[];
  weekContext: Array<{ day: string; load: number; active: boolean }>;
};

function getWeekdayShortLabel(t: TranslateFn, dayIndex: number) {
  const key = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"][
    dayIndex - 1
  ] as "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  return t(`weekdayShort.${key}`);
}

function buildEmptyDayPlanData(
  t: TranslateFn,
  selectedDateKey?: string,
): DayPlanData {
  const selectedDate = selectedDateKey
    ? dayjs(selectedDateKey, "YYYY-MM-DD", true)
    : dayjs();
  const safeDate = selectedDate.isValid() ? selectedDate : dayjs();
  const dayIndex = ((safeDate.day() + 6) % 7) + 1;

  return {
    planId: null,
    date: safeDate.format("YYYY-MM-DD"),
    dateLabel: t("dynamic.dateLabel", {
      month: safeDate.month() + 1,
      day: safeDate.date(),
    }),
    weekday: getWeekdayShortLabel(t, dayIndex),
    cycle: t("header.notInPlanRange"),
    description: null,
    weekLabel: t("header.notActivated"),
    intent: t("header.noPlan"),
    summary: {
      plannedLoad: 0,
      completedLoad: 0,
      plannedDuration: "--",
      completedCount: 0,
      totalCount: 0,
    },
    coach: {
      title: t("coach.title"),
      body: "",
      tags: [],
    },
    workouts: [],
    weekContext: Array.from({ length: 7 }, (_, idx) => ({
      day: getWeekdayShortLabel(t, idx + 1),
      load: 0,
      active: idx + 1 === dayIndex,
    })),
  };
}

function activePrimaryLink(links: PlanWorkoutLink[] | undefined) {
  return links?.find((link) => link.role === "PRIMARY" && !link.unlinkedAt);
}

function mapWorkoutToDayItem(
  t: TranslateFn,
  tActivityTitle: ActivityTitleTranslator,
  workout: PlanWorkout,
  fallbackPlanId: string,
) {
  const primary = activePrimaryLink(workout.links);
  return {
    id: workout.id,
    planId: workout.planId ?? fallbackPlanId,
    weekIndex: workout.weekIndex,
    dayIndex: workout.dayIndex,
    rawText: workout.text,
    rawNotes: workout.notes ?? null,
    rawName: workout.name ?? null,
    scheduledDateKey: workout.scheduledDate
      ? dayjs(workout.scheduledDate).format("YYYY-MM-DD")
      : null,
    sportType: workout.sportType,
    statusRaw: workout.status,
    sourceWorkout: workout,
    links: workout.links ?? [],
    title: workout.name?.trim() || workout.notes?.trim() || workout.text,
    duration: formatWorkoutDuration(
      estimateWorkoutDurationSeconds(workout.text),
    ),
    sessionCount: 1,
    completedLoad: workout.status === "DONE" ? 1 : 0,
    description:
      workout.name?.trim() && workout.notes?.trim() ? workout.notes.trim() : "",
    status:
      workout.status === "DONE"
        ? t("dynamic.status.done")
        : workout.status === "IN_PROGRESS"
          ? t("dynamic.status.inProgress")
          : workout.status === "SKIPPED"
            ? t("dynamic.status.skipped")
            : workout.status === "MOVED"
              ? t("dynamic.status.moved")
              : t("dynamic.status.planned"),
    estimatedLoad: workout.estimatedLoad ?? null,
    actual: primary?.activity
      ? getLocalizedActivityTitle(primary.activity, tActivityTitle)
      : primary?.activityId
        ? `#${primary.activityId}`
        : null,
    actualHashId: primary?.activity?.hashId ?? null,
  };
}

function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={className}>{children}</section>;
}

function SectionTitle({
  title,
  action,
  t,
}: {
  title: string;
  action?: string;
  t: TranslateFn;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {action ? (
        <button
          type="button"
          onClick={() => toast.message(t("toast.inProgress"))}
          className="flex items-center gap-1 text-mobile-caption pc:text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {action}
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function DayHeader({
  dayPlanData,
  t,
}: {
  dayPlanData: DayPlanData;
  t: TranslateFn;
}) {
  const router = useRouter();
  const currentDate = dayjs(dayPlanData.date, "YYYY-MM-DD", true);
  const safeDate = currentDate.isValid() ? currentDate : dayjs();
  const previousDateHref = `/day/${safeDate.subtract(1, "day").format("YYYY-MM-DD")}`;
  const nextDateHref = `/day/${safeDate.add(1, "day").format("YYYY-MM-DD")}`;

  return (
    <header className="px-1 py-1">
      <div className="mb-2 flex items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex shrink-0 items-center gap-1 text-mobile-caption pc:text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {t("header.backHome")}
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          <Button
            asChild
            variant="ghost"
            size="icon-compact"
            className="shrink-0 bg-neutral-100 text-muted-foreground dark:bg-muted/45"
          >
            <Link href={previousDateHref} aria-label={t("header.previousDay")}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <CalendarSelect
            date={safeDate.toDate()}
            size="compact"
            dateLabel={safeDate.format("YYYY-MM-DD")}
            title={t("header.selectDate")}
            placeholder={t("header.selectDate")}
            fromYear={safeDate.year() - 50}
            toYear={safeDate.year() + 50}
            className="w-[128px] max-w-none border-0 bg-neutral-100 px-2 hover:bg-neutral-200 dark:bg-muted/45 dark:hover:bg-muted"
            onSelect={(date) => {
              if (!date) return;
              router.push(`/day/${dayjs(date).format("YYYY-MM-DD")}`);
            }}
          />
          <Button
            asChild
            variant="ghost"
            size="icon-compact"
            className="shrink-0 bg-neutral-100 text-muted-foreground dark:bg-muted/45"
          >
            <Link href={nextDateHref} aria-label={t("header.nextDay")}>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
      <section className="rounded-md bg-neutral-100 p-2.5 dark:bg-muted/45">
        <div className="flex items-center gap-2 text-mobile-caption pc:text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          <span className="truncate">
            {t("header.todayPlanMeta", {
              cycle: dayPlanData.cycle,
              week: dayPlanData.weekLabel,
              date: dayPlanData.dateLabel,
              weekday: dayPlanData.weekday,
            })}
          </span>
        </div>
        <h1 className="mt-1 truncate text-base font-semibold tracking-normal text-foreground">
          {dayPlanData.cycle}
        </h1>
        {dayPlanData.description ? (
          <p className="mt-1 line-clamp-2 max-w-4xl text-sm leading-5 text-muted-foreground">
            {dayPlanData.description}
          </p>
        ) : null}
        <div className="mt-1 flex items-center gap-2 text-mobile-caption pc:text-xs text-muted-foreground">
          <span className="whitespace-nowrap rounded-xs bg-white/88 px-1.5 py-0.5 dark:bg-black/28">
            {dayPlanData.weekLabel}
          </span>
          {dayPlanData.intent ? (
            <span className="truncate">{dayPlanData.intent}</span>
          ) : null}
        </div>
      </section>
    </header>
  );
}

function DayOverview({
  dayPlanData,
  completedPercent,
  t,
}: {
  dayPlanData: DayPlanData;
  completedPercent: number;
  t: TranslateFn;
}) {
  return (
    <Panel className="space-y-3">
      <SectionTitle title={t("overview.title")} t={t} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-md bg-neutral-100 px-3 py-2.5 dark:bg-muted/45">
          <div className="text-mobile-caption pc:text-xs text-muted-foreground">
            {t("overview.plannedLoad")}
          </div>
          <div className="mt-1 text-xl font-semibold">
            {dayPlanData.summary.plannedLoad}
          </div>
        </div>
        <div className="rounded-md bg-neutral-100 px-3 py-2.5 dark:bg-muted/45">
          <div className="text-mobile-caption pc:text-xs text-muted-foreground">
            {t("overview.completed")}
          </div>
          <div className="mt-1 text-xl font-semibold">
            {dayPlanData.summary.completedLoad}
          </div>
        </div>
        <div className="rounded-md bg-neutral-100 px-3 py-2.5 dark:bg-muted/45">
          <div className="text-mobile-caption pc:text-xs text-muted-foreground">
            {t("overview.plannedDuration")}
          </div>
          <div className="mt-1 text-xl font-semibold">
            {dayPlanData.summary.plannedDuration}
          </div>
        </div>
        <div className="rounded-md bg-neutral-100 px-3 py-2.5 dark:bg-muted/45">
          <div className="text-mobile-caption pc:text-xs text-muted-foreground">
            {t("overview.progress")}
          </div>
          <div className="mt-1 text-xl font-semibold">
            {dayPlanData.summary.completedCount}/
            {dayPlanData.summary.totalCount}
          </div>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-emerald-500"
          style={{ width: `${completedPercent}%` }}
        />
      </div>
    </Panel>
  );
}

function WorkoutTimeline({
  dayPlanData,
  t,
}: {
  dayPlanData: DayPlanData;
  t: TranslateFn;
}) {
  const publicDemo = usePublicDemo();
  const demoText = useGuestAccessText();
  const tActivities = useTranslations("activities");
  const tLoad = useTranslations("V2PlanDetailPage.mobile.loadChart");
  const queryClient = useQueryClient();
  const {
    pendingWorkoutId,
    postponeWorkout: runPostponeWorkout,
    skipWorkout: runSkipWorkout,
  } = usePlanWorkoutActions();

  const handlePostpone = async (workout: DayPlanData["workouts"][number]) => {
    if (workout.statusRaw === "DONE" || workout.statusRaw === "SKIPPED") return;
    if (Boolean(workout.actual)) {
      toast.message(t("timeline.linkedBlockedTip"));
      return;
    }
    const sourceDayOffset =
      (workout.weekIndex - 1) * 7 + (workout.dayIndex - 1);
    try {
      await runPostponeWorkout({
        planId: workout.planId,
        workoutId: workout.id,
        status: workout.statusRaw,
        sourceDayOffset,
        text: workout.rawText,
        notes: workout.rawNotes ?? null,
        name: workout.rawName ?? null,
        sportType: workout.sportType,
      });
      await invalidateActivePlanAndPlanDetails(queryClient);
      toast.success(t("timeline.postponeSuccess"));
    } catch {
      toast.error(t("timeline.postponeFailed"));
    }
  };

  const handleSkip = async (workout: DayPlanData["workouts"][number]) => {
    if (workout.statusRaw === "DONE" || workout.statusRaw === "SKIPPED") return;
    if (Boolean(workout.actual)) {
      toast.message(t("timeline.linkedBlockedTip"));
      return;
    }
    try {
      await runSkipWorkout({
        planId: workout.planId,
        workoutId: workout.id,
        status: workout.statusRaw,
      });
      await invalidateActivePlanAndPlanDetails(queryClient);
      toast.success(t("timeline.skipSuccess"));
    } catch {
      toast.error(t("timeline.skipFailed"));
    }
  };

  return (
    <Panel className="space-y-3">
      <SectionTitle title={t("timeline.title")} t={t} />
      <div className="space-y-2">
        {dayPlanData.workouts.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/70 bg-neutral-100 px-4 py-6 dark:bg-muted/45">
            <div className="text-sm font-semibold text-foreground">
              {t("timeline.empty.title")}
            </div>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              {t("timeline.empty.description")}
            </p>
          </div>
        ) : null}
        {dayPlanData.workouts.map((workout) => {
          const hasLinkedActivity = Boolean(workout.actual);
          const displayKind = getPlanWorkoutDisplayKind({
            status: workout.statusRaw,
            scheduledDate: workout.scheduledDateKey ?? dayPlanData.date,
          });

          return (
            <PlanWorkoutListRow
              key={workout.id}
              displayKind={displayKind}
              title={workout.title}
              subtitle={workout.description}
              meta={t("timeline.meta", {
                duration: workout.duration,
                sessionCount: workout.sessionCount,
              })}
              statusLabel={workout.status}
              chart={<WorkoutMiniChart workout={workout.sourceWorkout} />}
              metrics={[
                { label: tActivities("distance"), value: "—" },
                { label: tActivities("duration"), value: workout.duration },
                {
                  label: tLoad("plannedLoad"),
                  value:
                    workout.estimatedLoad != null
                      ? String(Math.round(workout.estimatedLoad))
                      : "—",
                },
              ]}
              footerLeading={
                <div className="pointer-events-auto flex min-w-0 flex-wrap gap-1.5">
                  {hasLinkedActivity ? (
                    workout.actualHashId ? (
                      <Link
                        href={`/activities/${workout.actualHashId}`}
                        className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-md bg-background px-2 text-mobile-caption pc:text-[11px] font-normal text-muted-foreground transition-colors hover:bg-neutral-200 hover:text-foreground dark:bg-black/20 dark:hover:bg-muted"
                      >
                        <Link2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {t("timeline.linkedActivity", {
                            activity: workout.actual ?? "",
                          })}
                        </span>
                      </Link>
                    ) : (
                      <div className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-md bg-background px-2 text-mobile-caption pc:text-[11px] text-muted-foreground dark:bg-black/20">
                        <Link2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {t("timeline.linkedActivity", {
                            activity: workout.actual ?? "",
                          })}
                        </span>
                      </div>
                    )
                  ) : (
                    <PlanWorkoutActivityLinkControl
                      workoutId={workout.id}
                      sportType={workout.sportType}
                      scheduledDateKey={
                        workout.scheduledDateKey ?? dayPlanData.date
                      }
                      links={workout.links}
                      compact
                    />
                  )}
                </div>
              }
              footerActions={
                <>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    disabled={
                      publicDemo.active ||
                      pendingWorkoutId === workout.id ||
                      hasLinkedActivity ||
                      workout.statusRaw === "DONE" ||
                      workout.statusRaw === "SKIPPED"
                    }
                    title={
                      publicDemo.active
                        ? demoText("readOnlyAction")
                        : hasLinkedActivity
                          ? t("timeline.linkedBlockedTip")
                          : undefined
                    }
                    onClick={() => void handlePostpone(workout)}
                    className="pointer-events-auto bg-background px-2 text-muted-foreground dark:bg-black/20"
                  >
                    {pendingWorkoutId === workout.id
                      ? t("timeline.actionPending")
                      : t("timeline.actionPostpone")}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    disabled={
                      publicDemo.active ||
                      pendingWorkoutId === workout.id ||
                      hasLinkedActivity ||
                      workout.statusRaw === "DONE" ||
                      workout.statusRaw === "SKIPPED"
                    }
                    title={
                      publicDemo.active
                        ? demoText("readOnlyAction")
                        : hasLinkedActivity
                          ? t("timeline.linkedBlockedTip")
                          : undefined
                    }
                    onClick={() => void handleSkip(workout)}
                    className="pointer-events-auto bg-background px-2 text-muted-foreground dark:bg-black/20"
                  >
                    {t("timeline.actionSkip")}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    disabled
                    title={t("timeline.deleteDisabledTip")}
                    className="pointer-events-auto bg-background px-2 text-muted-foreground/60 dark:bg-black/20"
                  >
                    {t("timeline.actionDelete")}
                  </Button>
                </>
              }
            />
          );
        })}
      </div>
    </Panel>
  );
}

/**
 * 教练卡片
 * @returns
 */
function CoachCard({
  dayPlanData,
  t,
}: {
  dayPlanData: DayPlanData;
  t: TranslateFn;
}) {
  const firstWorkoutId = dayPlanData.workouts[0]?.id;
  const coachParams = new URLSearchParams({
    intent: "plan-day-review",
    source: "day",
    date: dayPlanData.date,
    prompt: t("coach.branchPrompt"),
  });
  if (dayPlanData.planId) coachParams.set("planId", dayPlanData.planId);
  if (firstWorkoutId) coachParams.set("workoutId", firstWorkoutId);
  const coachHref = `/ai-coach?${coachParams.toString()}`;
  const fallbackSummary =
    dayPlanData.coach.body ||
    (dayPlanData.workouts.length > 0
      ? t("coach.branchPrompt")
      : dayPlanData.intent);

  return (
    <PlanExecutionAdviceCard
      title={dayPlanData.coach.title}
      askLabel={t("coach.askCoach")}
      askHref={coachHref}
      surface="DAY"
      anchorDate={dayPlanData.date}
      planId={dayPlanData.planId}
      planWorkoutId={firstWorkoutId}
      fallbackSummary={fallbackSummary}
      fallbackTags={dayPlanData.coach.tags}
    />
  );
}

/**
 * 本周上下文
 * @returns
 */
function WeekContextCard({
  dayPlanData,
  t,
}: {
  dayPlanData: DayPlanData;
  t: TranslateFn;
}) {
  const maxLoad = Math.max(
    1,
    ...dayPlanData.weekContext.map((item) => item.load),
  );
  const hasWeekContext = dayPlanData.weekContext.some((item) => item.load > 0);

  return (
    <Panel className="space-y-3">
      <SectionTitle title={t("weekContext.title")} t={t} />
      {!hasWeekContext ? (
        <div className="rounded-md border border-dashed border-border/70 bg-neutral-100 p-4 dark:bg-muted/45">
          <div className="text-sm font-semibold">
            {t("weekContext.empty.title")}
          </div>
          <p className="mt-1 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
            {t("weekContext.empty.description")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {dayPlanData.weekContext.map((item) => {
            const height =
              item.load > 0 ? Math.round((item.load / maxLoad) * 72) : 0;

            return (
              <div key={item.day} className="text-center">
                <div className="flex h-20 items-end justify-center rounded-md bg-neutral-100 px-1.5 py-1.5 dark:bg-muted/45">
                  {height > 0 ? (
                    <div
                      className={`w-full rounded-sm ${
                        item.active
                          ? "bg-emerald-500"
                          : "bg-muted-foreground/30"
                      }`}
                      style={{ height: `${height}px` }}
                    />
                  ) : null}
                </div>
                <div className="mt-1 text-mobile-unit pc:text-[10px] text-muted-foreground">
                  {item.day}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/**
 * 上传文件
 * @param param0
 * @returns
 */
function UploadWorkoutFileMobile({ t }: { t: TranslateFn }) {
  const queryClient = useQueryClient();
  const publicDemo = usePublicDemo();
  const demoText = useGuestAccessText();
  return (
    <div className="md:hidden">
      <LazyFileUploadDialog
        disabled={publicDemo.active}
        onUploaded={() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.home.v2() });
          void queryClient.invalidateQueries({
            queryKey: queryKeys.plans.list(),
          });
        }}
        trigger={
          <Button
            type="button"
            size="xl"
            disabled={publicDemo.active}
            title={publicDemo.active ? demoText("readOnlyAction") : undefined}
            className="w-full gap-2 bg-foreground text-background hover:bg-foreground/90"
          >
            <FileUp className="h-4 w-4 shrink-0" />
            {t("upload.selectFile")}
          </Button>
        }
      />
    </div>
  );
}

function UploadWorkoutFileDesktop({ t }: { t: TranslateFn }) {
  const queryClient = useQueryClient();
  return (
    <Panel className="hidden space-y-3 md:block">
      <SectionTitle title={t("upload.title")} t={t} />
      <ActivityUploadCard
        cardTitle={t("upload.cardTitle")}
        description={t("upload.description")}
        buttonLabel={t("upload.selectFile")}
        onUploaded={() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.home.v2() });
          void queryClient.invalidateQueries({
            queryKey: queryKeys.plans.list(),
          });
        }}
      />
    </Panel>
  );
}

export default function V2DayPage() {
  const locale = useLocale();
  const t = useTranslations("V2DayPage");
  const tActivityTitle = useTranslations("ActivityTitle");
  const tCompetition = useTranslations("CompetitionEvents");
  const demoText = useGuestAccessText();
  const publicDemo = usePublicDemo();
  const router = useRouter();
  const params = useParams<{ date: string }>();
  const searchParams = useSearchParams();
  const selectedDateKey =
    typeof params?.date === "string" ? params.date : undefined;
  const openedWorkoutId = searchParams.get("workout")?.trim() || null;
  const openedWorkoutPlanId = searchParams.get("planId")?.trim() || undefined;
  useSetPageTitle(
    `${t("overview.title")} · ${selectedDateKey ?? dayjs().format("YYYY-MM-DD")}`,
  );
  const { active, startDate } = useActivePlan(true);
  const activePlan = active?.plan ?? null;
  const [competitionDialogOpen, setCompetitionDialogOpen] = useState(false);
  const [selectedCompetitionEvent, setSelectedCompetitionEvent] =
    useState<CompetitionEvent | null>(null);
  const { data: activeCompetitionEvents = [] } = useQuery({
    queryKey: queryKeys.competitionEvents.range(
      selectedDateKey,
      selectedDateKey,
    ),
    queryFn: () => getCompetitionEvents(selectedDateKey!, selectedDateKey!),
    enabled: Boolean(selectedDateKey),
  });
  const { data: cancelledCompetitionEvents = [] } = useQuery({
    queryKey: queryKeys.competitionEvents.range(
      selectedDateKey,
      selectedDateKey,
      "CANCELLED",
    ),
    queryFn: () =>
      getCompetitionEvents(selectedDateKey!, selectedDateKey!, "CANCELLED"),
    enabled: Boolean(selectedDateKey),
  });
  const competitionEvents = useMemo(
    () => [...activeCompetitionEvents, ...cancelledCompetitionEvents],
    [activeCompetitionEvents, cancelledCompetitionEvents],
  );
  const dayPlanData = useMemo(() => {
    const emptyData = buildEmptyDayPlanData(t, selectedDateKey);
    if (!selectedDateKey || !activePlan || !startDate) return emptyData;

    const selectedDate = dayjs(selectedDateKey, "YYYY-MM-DD", true);
    if (!selectedDate.isValid()) return emptyData;

    const start = dayjs(startDate).startOf("day");
    const diffDays = selectedDate.startOf("day").diff(start, "day");
    if (diffDays < 0) return emptyData;

    const weekIndex = Math.floor(diffDays / 7) + 1;
    if (weekIndex > activePlan.periodWeeks) return emptyData;

    const dayIndex = (diffDays % 7) + 1;
    const weekWorkouts = activePlan.workouts.filter(
      (item) => item.weekIndex === weekIndex,
    );
    const dayWorkouts = weekWorkouts
      .filter((item) => item.dayIndex === dayIndex)
      .sort((a, b) => (a.sessionIndex ?? 1) - (b.sessionIndex ?? 1));
    const doneCount = dayWorkouts.filter(
      (item) => item.status === "DONE",
    ).length;
    const plannedDurationSeconds = dayWorkouts.reduce(
      (total, item) => total + (estimateWorkoutDurationSeconds(item.text) ?? 0),
      0,
    );

    const weekContext = Array.from({ length: 7 }, (_, idx) => {
      const currentDayIndex = idx + 1;
      const count = weekWorkouts.filter(
        (item) => item.dayIndex === currentDayIndex,
      ).length;
      return {
        day: getWeekdayShortLabel(t, currentDayIndex),
        load: Math.max(0, count),
        active: currentDayIndex === dayIndex,
      };
    });

    return {
      ...emptyData,
      planId: activePlan.id,
      date: selectedDateKey,
      dateLabel: t("dynamic.dateLabel", {
        month: selectedDate.month() + 1,
        day: selectedDate.date(),
      }),
      weekday: getWeekdayShortLabel(t, dayIndex),
      cycle: activePlan.title,
      description: activePlan.description?.trim() || null,
      weekLabel: t("dynamic.weekLabel", {
        current: weekIndex,
        total: activePlan.periodWeeks,
      }),
      intent: activePlan.goal?.trim() || "",
      summary: {
        ...emptyData.summary,
        plannedLoad: dayWorkouts.length,
        completedLoad: doneCount,
        plannedDuration: formatWorkoutDuration(plannedDurationSeconds),
        completedCount: doneCount,
        totalCount: dayWorkouts.length,
      },
      workouts:
        dayWorkouts.length > 0
          ? dayWorkouts.map((item) =>
              mapWorkoutToDayItem(t, tActivityTitle, item, activePlan.id),
            )
          : [],
      weekContext,
    };
  }, [activePlan, selectedDateKey, startDate, t, tActivityTitle]);
  const completedPercent = dayPlanData.summary.plannedLoad
    ? Math.round(
        (dayPlanData.summary.completedLoad / dayPlanData.summary.plannedLoad) *
          100,
      )
    : 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 pb-2 md:gap-3">
      <DayHeader dayPlanData={dayPlanData} t={t} />

      <div className="flex flex-col gap-2 md:grid md:grid-cols-[minmax(0,1fr)_320px] md:items-start md:gap-3">
        <div className="order-1 min-w-0 md:col-start-2 md:row-start-1 md:order-none">
          <CoachCard dayPlanData={dayPlanData} t={t} />
        </div>
        <div className="order-2 min-w-0 md:col-start-2 md:row-start-2 md:order-none">
          <WeekContextCard dayPlanData={dayPlanData} t={t} />
        </div>
        <div className="order-3 md:hidden">
          <UploadWorkoutFileMobile t={t} />
        </div>
        <main className="order-4 flex min-w-0 flex-col gap-2 md:gap-3 md:col-start-1 md:row-span-3 md:row-start-1 md:order-none">
          <DayOverview
            dayPlanData={dayPlanData}
            completedPercent={completedPercent}
            t={t}
          />
          <Panel>
            <div className="flex items-center justify-between gap-3">
              <SectionTitle title={tCompetition("calendar.title")} t={t} />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={publicDemo.active}
                title={
                  publicDemo.active ? demoText("readOnlyAction") : undefined
                }
                onClick={() => {
                  setSelectedCompetitionEvent(null);
                  setCompetitionDialogOpen(true);
                }}
              >
                {tCompetition("calendar.add")}
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {competitionEvents.length ? (
                competitionEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    disabled={publicDemo.active}
                    title={
                      publicDemo.active ? demoText("readOnlyAction") : undefined
                    }
                    className="block w-full rounded-lg border border-[hsl(var(--blue-200))] bg-[hsl(var(--blue-50)/0.6)] p-3 text-left dark:border-[hsl(var(--blue-900)/0.6)] dark:bg-[hsl(var(--blue-950)/0.2)]"
                    onClick={() => {
                      setSelectedCompetitionEvent(event);
                      setCompetitionDialogOpen(true);
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {event.title}
                      </span>
                      <span className="mt-1 block text-mobile-caption pc:text-xs text-muted-foreground">
                        {tCompetition(`status.${event.status}`)} ·{" "}
                        {tCompetition(`importance.${event.importance}.label`)} ·{" "}
                        {tCompetition(`sports.${event.sportType}`)}
                        {event.distanceMeters
                          ? ` · ${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(event.distanceMeters / 1000)} km`
                          : ""}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="flex min-h-16 items-center gap-3 rounded-surface border border-dashed border-border/70 bg-neutral-100 px-4 py-3 dark:bg-muted/45">
                  <CalendarDays
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-muted-foreground">
                    {tCompetition("calendar.empty")}
                  </p>
                </div>
              )}
            </div>
          </Panel>
          <WorkoutTimeline dayPlanData={dayPlanData} t={t} />
        </main>
        <div className="order-5 min-w-0 md:col-start-2 md:row-start-3 md:order-none">
          <UploadWorkoutFileDesktop t={t} />
        </div>
      </div>
      <CompetitionEventDialog
        defaultDate={selectedDateKey ?? dayjs().format("YYYY-MM-DD")}
        event={selectedCompetitionEvent}
        open={competitionDialogOpen}
        onOpenChange={setCompetitionDialogOpen}
      />
      {openedWorkoutId ? (
        <ViewWorkoutDialog
          open
          onOpenChange={(next) => {
            if (!next) {
              router.replace(
                `/day/${encodeURIComponent(selectedDateKey ?? dayjs().format("YYYY-MM-DD"))}`,
              );
            }
          }}
          workoutId={openedWorkoutId}
          planId={openedWorkoutPlanId}
        />
      ) : null}
    </div>
  );
}
