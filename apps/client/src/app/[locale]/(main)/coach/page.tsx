"use client";

import {
  ArrowRight,
  CalendarDays,
  CircleGauge,
  Footprints,
  MessageCircle,
  Send,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { AccessGuardedLink } from "@deployment/managed-ui";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useActivePlan } from "@/api/usePlans";
import { getV2ActivitiesFeed } from "@/api/v2-activities";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { queryKeys } from "@/lib/query-keys";
import { getLocalizedActivityTitle } from "@/lib/activity-title";

type TranslateFn = ReturnType<typeof useTranslations>;

function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-md border border-border/70 bg-background/95 ${className}`}
    >
      {children}
    </section>
  );
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
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export default function V2CoachPage() {
  const t = useTranslations("V2CoachPage");
  const tActivityTitle = useTranslations("ActivityTitle");
  useSetPageTitle(t("header.title"));
  const { active } = useActivePlan(true);
  const activePlan = active?.plan ?? null;
  const currentWeekIndex =
    active?.currentWeekIndex ?? activePlan?.currentWeekIndex ?? 1;
  const currentDayIndex =
    active?.currentDayIndex ?? activePlan?.currentDayIndex ?? 1;
  const { data: recentFeed } = useQuery({
    queryKey: queryKeys.coach.recentActivities(),
    queryFn: () => getV2ActivitiesFeed({ page: 1, perPage: 3 }),
    staleTime: 60_000,
  });

  const currentWeekWorkouts = useMemo(
    () =>
      activePlan?.workouts.filter(
        (item) => item.weekIndex === currentWeekIndex,
      ) ?? [],
    [activePlan, currentWeekIndex],
  );
  const currentDayWorkout = useMemo(
    () =>
      activePlan?.workouts
        .filter(
          (item) =>
            item.weekIndex === currentWeekIndex &&
            item.dayIndex === currentDayIndex,
        )
        .sort((a, b) => (a.sessionIndex ?? 1) - (b.sessionIndex ?? 1))[0] ??
      null,
    [activePlan, currentDayIndex, currentWeekIndex],
  );
  const weekDone = useMemo(
    () => currentWeekWorkouts.filter((item) => item.status === "DONE").length,
    [currentWeekWorkouts],
  );
  const weekTotal = currentWeekWorkouts.length;
  const stateHint = weekTotal
    ? weekDone / weekTotal >= 0.7
      ? t("dynamic.stateHintGood")
      : t("dynamic.stateHintWatch")
    : t("dynamic.stateHintDefault");
  const stateValue = t("dynamic.stateValue", {
    done: weekDone,
    total: weekTotal,
  });

  const prompts = useMemo(
    () =>
      currentDayWorkout
        ? [
            t("dynamicPrompts.p1", {
              workout: currentDayWorkout.name || currentDayWorkout.text,
            }),
            t("dynamicPrompts.p2", { week: currentWeekIndex }),
            t("dynamicPrompts.p3"),
            t("dynamicPrompts.p4"),
          ]
        : [t("prompts.p1"), t("prompts.p2"), t("prompts.p3"), t("prompts.p4")],
    [currentDayWorkout, currentWeekIndex, t],
  );
  const threads = useMemo(
    () =>
      recentFeed?.items?.length
        ? recentFeed.items.slice(0, 3).map((item) => ({
            title: getLocalizedActivityTitle(
              item,
              tActivityTitle,
              t("threads.untitledActivity"),
            ),
            scope: t("dynamic.activityScope", {
              distanceKm: ((item.distance ?? 0) / 1000).toFixed(1),
            }),
            time: item.startTime
              ? dayjs(item.startTime).format("MM-DD")
              : t("dynamic.unknownTime"),
          }))
        : [],
    [recentFeed?.items, t, tActivityTitle],
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 pb-3 md:gap-4">
      <header className="rounded-md border border-border/70 bg-background/95 px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-mobile-caption pc:text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              {t("header.badge")}
            </div>
            <h1 className="mt-1 text-xl font-semibold md:text-2xl">
              {t("header.title")}
            </h1>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              {t("header.description")}
            </p>
          </div>
          <AccessGuardedLink
            href="/ai-coach"
            className="shrink-0 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            {t("header.newChat")}
          </AccessGuardedLink>
        </div>
      </header>

      <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_320px] md:items-start md:gap-4">
        <div className="order-1 min-w-0 md:col-start-2 md:row-start-1 md:order-none">
          <Panel className="p-4">
            <SectionTitle
              title={t("threads.title")}
              action={t("threads.all")}
              t={t}
            />
            <div className="space-y-2">
              {threads.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/70 bg-muted/25 p-4">
                  <div className="text-sm font-semibold">
                    {t("threads.emptyTitle")}
                  </div>
                  <p className="mt-1 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
                    {t("threads.emptyDescription")}
                  </p>
                </div>
              ) : (
                threads.map((thread) => (
                  <button
                    key={thread.title}
                    type="button"
                    onClick={() =>
                      toast.message(
                        t("threads.unavailable", { title: thread.title }),
                      )
                    }
                    className="w-full rounded-md border border-border/70 bg-background p-3 text-left transition-colors hover:bg-neutral-200 dark:hover:bg-muted"
                  >
                    <div className="text-sm font-semibold">{thread.title}</div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-mobile-caption pc:text-xs text-muted-foreground">
                      <span>{thread.scope}</span>
                      <span>{thread.time}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </Panel>
        </div>

        <div className="order-2 min-w-0 md:col-start-2 md:row-start-2 md:order-none">
          <Panel className="p-4">
            <SectionTitle title={t("context.title")} t={t} />
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 rounded-md bg-muted/35 px-3 py-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                {t("context.currentCycle")}
              </div>
              <div className="flex items-center gap-2 rounded-md bg-muted/35 px-3 py-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                {t("context.thisWeek")}
              </div>
              <div className="flex items-center gap-2 rounded-md bg-muted/35 px-3 py-2">
                <Footprints className="h-4 w-4 text-muted-foreground" />
                {t("context.recentActivities")}
              </div>
            </div>
          </Panel>
        </div>

        <div className="order-3 min-w-0 md:col-start-2 md:row-start-3 md:order-none">
          <Panel className="p-4">
            <div className="text-sm font-semibold">
              {t("constraints.title")}
            </div>
            <p className="mt-2 text-sm leading-5 text-muted-foreground">
              {t("constraints.description")}
            </p>
          </Panel>
        </div>

        <main className="order-4 flex min-w-0 flex-col gap-3 md:gap-4 md:col-start-1 md:row-span-3 md:row-start-1 md:order-none">
          <Panel className="p-4">
            <SectionTitle
              title={t("currentContext.title")}
              action={t("currentContext.switch")}
              t={t}
            />
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-md bg-neutral-100 dark:bg-muted/45 p-3">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <div className="mt-2 text-sm font-semibold">
                  {activePlan
                    ? t("dynamic.week", {
                        current: currentWeekIndex,
                        total: activePlan.periodWeeks,
                      })
                    : t("currentContext.week")}
                </div>
                <div className="mt-1 text-mobile-caption pc:text-xs text-muted-foreground">
                  {activePlan?.title ?? t("currentContext.cycle")}
                </div>
              </div>
              <div className="rounded-md bg-neutral-100 dark:bg-muted/45 p-3">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <div className="mt-2 text-sm font-semibold">
                  {weekDone} / {weekTotal || "--"}
                </div>
                <div className="mt-1 text-mobile-caption pc:text-xs text-muted-foreground">
                  {t("currentContext.load")}
                </div>
              </div>
              <div className="rounded-md bg-neutral-100 dark:bg-muted/45 p-3">
                <CircleGauge className="h-4 w-4 text-muted-foreground" />
                <div className="mt-2 text-sm font-semibold">{stateValue}</div>
                <div className="mt-1 text-mobile-caption pc:text-xs text-muted-foreground">
                  {stateHint}
                </div>
              </div>
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionTitle title={t("recommended.title")} t={t} />
            <div className="grid gap-2 sm:grid-cols-2">
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() =>
                    toast.message(t("recommended.filled", { prompt }))
                  }
                  className="rounded-md border border-border/70 bg-background p-3 text-left text-sm transition-colors hover:bg-neutral-200 dark:hover:bg-muted"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionTitle title={t("entry.title")} t={t} />
            <div className="rounded-md border border-border/70 bg-neutral-100 dark:bg-muted/45 p-3">
              <div className="mb-3 rounded-md bg-background p-3 text-sm leading-6 text-muted-foreground">
                {t("entry.intro")}
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border/70 bg-background px-3 py-2">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 text-sm text-muted-foreground">
                  {t("entry.placeholder")}
                </span>
                <AccessGuardedLink
                  href="/ai-coach"
                  className="rounded-md bg-foreground p-2 text-background transition-opacity hover:opacity-90"
                >
                  <Send className="h-3.5 w-3.5" />
                </AccessGuardedLink>
              </div>
            </div>
          </Panel>
        </main>
      </div>
    </div>
  );
}
