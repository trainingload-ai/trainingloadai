"use client";

import type { Dayjs } from "dayjs";
import { ChevronLeft } from "lucide-react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import React from "react";
import type { Activity, SportType } from "@/api/activities";
import type { CompetitionEvent } from "@/api/competition-events";
import type { PlanWorkout } from "@/api/plans";
import { CompetitionEventDetails } from "@/components/competition/competition-event-dialog";
import { MobileSheet } from "@/components/mobile-app/components/MobileSheet";
import { MobileTopBarAction } from "@/components/mobile-app/components/MobileTopBar";
import {
  buildWorkoutListTitle,
  formatSportTypeLabel,
} from "@/components/plan/detail/plan-detail-utils";
import { formatWorkoutDuration } from "@/lib/workout-display-utils";
import { MobileActivityDetailSheetContent } from "./MobileActivityDetailSheetContent";
import { MobileCalendarDayContent } from "./MobileCalendarSessionCards";

export type MobileCalendarSheetPage =
  | { kind: "day" }
  | { kind: "activity"; activity: Activity }
  | { kind: "workout"; workout: PlanWorkout }
  | { kind: "competition"; event: CompetitionEvent };

const ViewWorkoutDialog = dynamic(
  () =>
    import("@/components/plan/view-workout-dialog").then(
      (module) => module.ViewWorkoutDialog,
    ),
  { ssr: false },
);

export function MobileCalendarDaySheet({
  activities,
  date,
  events,
  onOpenChange,
  onPageChange,
  open,
  page,
  workouts,
}: {
  activities: Activity[];
  date: Dayjs;
  events: CompetitionEvent[];
  onOpenChange: (open: boolean) => void;
  onPageChange: (page: MobileCalendarSheetPage) => void;
  open: boolean;
  page: MobileCalendarSheetPage;
  workouts: PlanWorkout[];
}) {
  const locale = useLocale();
  const t = useTranslations("MobileCalendarTimeline");
  const detailT = useTranslations("V2PlanDetailPage");
  const isDetail = page.kind !== "day";
  const dayLabel = React.useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        weekday: "short",
      }).format(date.toDate()),
    [date, locale],
  );
  const dayTitle = React.useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(date.toDate()),
    [date, locale],
  );
  const weekdayLabel = React.useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { weekday: "long" }).format(
        date.toDate(),
      ),
    [date, locale],
  );
  const workoutHeader =
    page.kind === "workout"
      ? {
          title: buildWorkoutListTitle(detailT, page.workout),
          subtitle: [
            formatSportTypeLabel(detailT, page.workout.sportType),
            formatWorkoutDuration(page.workout.summary.durationSeconds),
          ]
            .filter((value) => value && value !== "--")
            .join(" · "),
        }
      : null;
  const title =
    page.kind === "activity"
      ? t("activityDetail")
      : page.kind === "workout"
        ? workoutHeader?.title
        : page.kind === "competition"
          ? t("competitionDetail")
          : dayTitle;
  const description =
    page.kind === "day"
      ? weekdayLabel
      : page.kind === "workout"
        ? workoutHeader?.subtitle
        : dayLabel;

  return (
    <MobileSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      fullScreen
      viewportScope="below-pc"
      backgroundVariant="grouped"
      contentClassName={
        page.kind === "workout"
          ? "flex flex-col overflow-hidden p-0"
          : page.kind === "activity"
            ? "p-0"
            : undefined
      }
      leading={
        isDetail ? (
          <MobileTopBarAction
            data-vaul-no-drag
            onClick={() => onPageChange({ kind: "day" })}
            aria-label={t("backToDay")}
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </MobileTopBarAction>
        ) : null
      }
    >
      {page.kind === "day" ? (
        <div className="space-y-2">
          <MobileCalendarDayContent
            activities={activities}
            events={events}
            workouts={workouts}
            variant="sheet"
            onActivityPress={(activity) =>
              onPageChange({ kind: "activity", activity })
            }
            onEventPress={(event) =>
              onPageChange({ kind: "competition", event })
            }
            onWorkoutPress={(workout) =>
              onPageChange({ kind: "workout", workout })
            }
          />
        </div>
      ) : page.kind === "activity" ? (
        <MobileActivityDetailSheetContent previewActivity={page.activity} />
      ) : page.kind === "workout" ? (
        <ViewWorkoutDialog
          open
          mobile
          mobileEmbedded
          onOpenChange={onOpenChange}
          planId={page.workout.planId ?? undefined}
          workoutId={page.workout.id}
          weekIndex={Math.max(0, (page.workout.weekIndex ?? 1) - 1)}
          dayIndex={Math.max(0, (page.workout.dayIndex ?? 1) - 1)}
          notes={page.workout.notes}
          text={page.workout.text}
          sportType={page.workout.sportType as SportType}
          workout={page.workout}
        />
      ) : (
        <div className="px-4 pb-safe-or-8 pt-4">
          <CompetitionEventDetails event={page.event} impactEnabled={false} />
        </div>
      )}
    </MobileSheet>
  );
}
