"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";
import type { PlanWorkout } from "@/api/plans";
import { MobilePlanWorkoutRow } from "@/components/plan/mobile-plan-workout-row";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CalendarWorkoutPreview } from "./CalendarWorkoutPreview";
import { canMoveCalendarWorkout, type CalendarProposalMark } from "./calendar-move-model";
import { calendarProposalStyle } from "./calendar-proposal-appearance";
import { MobileCalendarDraggableWorkout } from "./mobile-calendar-workout-drag";

export function MobileCalendarWorkoutList({
  selectedDate,
  workoutsByDate,
  marks,
  onSelect,
  onRequestMove,
  getMoveWorkout,
}: {
  selectedDate: string;
  workoutsByDate: Record<string, PlanWorkout[]>;
  marks?: ReadonlyMap<string, CalendarProposalMark>;
  onSelect: (workout: PlanWorkout) => void;
  onRequestMove?: (workout: PlanWorkout, trigger: HTMLElement) => void;
  getMoveWorkout?: (workout: PlanWorkout) => PlanWorkout | undefined;
}) {
  const t = useTranslations("CalendarMove");
  const tc = useTranslations("MobileCalendarTimeline");
  const selected = workoutsByDate[selectedDate] ?? [];
  const numbers = new Set(selected.flatMap(({ id }) => {
    const mark = marks?.get(id);
    return mark ? [mark.number] : [];
  }));
  const comparisons = new Map<number, Partial<Record<CalendarProposalMark["side"], PlanWorkout>>>();
  if (numbers.size) {
    for (const day of Object.values(workoutsByDate)) {
      for (const workout of day) {
        const mark = marks?.get(workout.id);
        if (!mark || !numbers.has(mark.number)) continue;
        const pair = comparisons.get(mark.number) ?? {};
        pair[mark.side] = workout;
        comparisons.set(mark.number, pair);
      }
    }
  }

  const draggable = (workout: PlanWorkout, renderCard: (canDrag: boolean) => ReactNode) => {
    const source = getMoveWorkout ? getMoveWorkout(workout) : workout;
    const canDrag = Boolean(onRequestMove) && canMoveCalendarWorkout(source);
    const content = renderCard(canDrag);
    return canDrag ? (
      <MobileCalendarDraggableWorkout cardId={workout.id} workout={source} onRequestMove={onRequestMove}>
        {content}
      </MobileCalendarDraggableWorkout>
    ) : content;
  };
  const changeCard = (workout: PlanWorkout, side: CalendarProposalMark["side"], number: number) => {
    const status = `${t(side)} · ${number}`;
    const date = workout.scheduledDate?.slice(5);
    const title = workout.name || tc("plannedWorkout");
    return (
      <article
        data-calendar-change-side={side}
        className="min-w-0 rounded-md"
        style={calendarProposalStyle({ side, number }, "card")}
      >
        {draggable(workout, (canDrag) => (
          <Button
            type="button"
            variant="ghost"
            size="auto"
            aria-label={[title, status, date].filter(Boolean).join(" · ")}
            onClick={() => onSelect(workout)}
            className={cn(
              "h-auto w-full min-w-0 flex-col items-stretch justify-start gap-1 rounded-md p-1.5 text-start hover:bg-transparent hover:brightness-95 dark:hover:brightness-110",
              canDrag && "[&>span]:pe-7",
            )}
          >
            <CalendarWorkoutPreview
              workout={workout}
              title={title}
              caption={date ? `${status} · ${date}` : status}
            />
          </Button>
        ))}
      </article>
    );
  };

  return (
    <>
      {Array.from(comparisons, ([number, { before, after }]) => {
        const afterFirst = after?.scheduledDate === selectedDate && before?.scheduledDate !== selectedDate;
        if (!before || !after) return (
          <Fragment key={number}>
            {before ? changeCard(before, "before", number) : after ? changeCard(after, "after", number) : null}
          </Fragment>
        );
        const Arrow = afterFirst ? ArrowLeft : ArrowRight;
        return (
          <div
            key={number}
            data-calendar-comparison={afterFirst ? "after" : "before"}
            className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1"
          >
            {afterFirst ? changeCard(after, "after", number) : changeCard(before, "before", number)}
            <Arrow className="size-4 text-muted-foreground" aria-hidden />
            {afterFirst ? changeCard(before, "before", number) : changeCard(after, "after", number)}
          </div>
        );
      })}
      {selected.filter(({ id }) => !marks?.has(id)).map((workout) => (
        <Fragment key={workout.id}>
          {draggable(workout, (canDrag) => (
            <MobilePlanWorkoutRow
              workout={workout}
              emptyTitle={tc("plannedWorkout")}
              emptyDetail={tc("restHint")}
              onClick={onSelect}
              showDateBlock={false}
              headerClassName={canDrag ? "pe-6" : undefined}
            />
          ))}
        </Fragment>
      ))}
    </>
  );
}
