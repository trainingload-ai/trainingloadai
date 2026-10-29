import { isWorkoutDone, type PlanWorkout } from "@/api/plans";
import { PlanWorkoutListRow } from "@/components/plan/plan-workout-list-row";
import { WorkoutRenderer } from "@/components/workout/WorkoutRenderer";
import {
  formatSportTypeLabel,
  getWeekdayCompactLabel,
  type DerivedWorkout,
  type TranslateFn,
  type WeekGroup,
} from "@/components/plan/detail/plan-detail-utils";
import {
  Panel,
  SectionTitle,
} from "@/components/plan/detail/plan-detail-panel";
import { formatWorkoutDuration } from "@/lib/workout-display-utils";

function WeekWorkoutChartPreview({ workout }: { workout: PlanWorkout }) {
  return (
    <div
      className="pointer-events-none h-12 w-[108px] shrink-0 overflow-hidden rounded-md"
      aria-hidden
    >
      <WorkoutRenderer
        className="h-full"
        workout={workout}
        density="COMPACT"
        chartHeight={48}
      />
    </div>
  );
}

function WeekWorkoutCard({
  workout,
  t,
  onOpenWorkout,
}: {
  workout: DerivedWorkout;
  t: TranslateFn;
  onOpenWorkout: (workout: DerivedWorkout) => void;
}) {
  const duration = formatWorkoutDuration(workout.summary.durationSeconds);
  const meta = [
    formatSportTypeLabel(t, workout.sportType),
    duration !== "--" ? duration : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <PlanWorkoutListRow
      displayKind={workout.displayKind}
      title={workout.title}
      subtitle={workout.description}
      meta={meta}
      statusLabel={workout.statusLabel}
      chart={<WeekWorkoutChartPreview workout={workout} />}
      onOpen={() => onOpenWorkout(workout)}
    />
  );
}

export function PlanDetailWeekBreakdown({
  weeks,
  t,
  onOpenWorkout,
}: {
  weeks: WeekGroup[];
  t: TranslateFn;
  onOpenWorkout: (workout: DerivedWorkout) => void;
}) {
  const hasWorkout = weeks.some((week) =>
    week.days.some((day) => day.workouts.length > 0),
  );

  return (
    <Panel className="flex min-h-0 flex-1 flex-col gap-3">
      <SectionTitle title={t("weekBreakdown.title")} />
      {!hasWorkout ? (
        <div className="rounded-md border border-dashed border-border/70 bg-neutral-100 p-4 dark:bg-muted/45">
          <div className="text-sm font-semibold">
            {t("weekBreakdown.emptyPlanTitle")}
          </div>
          <p className="mt-1 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
            {t("weekBreakdown.emptyPlanDescription")}
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pr-1 [-webkit-overflow-scrolling:touch]">
          <div className="space-y-3">
            {weeks.map((week) => {
              const weekWorkoutCount = week.days.reduce(
                (sum, day) => sum + day.workouts.length,
                0,
              );
              const weekCompletedCount = week.days.reduce(
                (sum, day) =>
                  sum +
                  day.workouts.filter((item) => isWorkoutDone(item.status))
                    .length,
                0,
              );

              return (
                <div
                  key={week.weekIndex}
                  id={`plan-detail-week-${week.weekIndex}`}
                  className="rounded-md bg-neutral-100 p-2.5 dark:bg-muted/45"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">
                        {t("weekBreakdown.weekLabel", { week: week.weekIndex })}
                      </div>
                      <div className="mt-0.5 text-mobile-caption pc:text-xs text-muted-foreground">
                        {t("weekBreakdown.completedMeta", {
                          done: weekCompletedCount,
                          total: weekWorkoutCount,
                        })}
                      </div>
                    </div>
                    <div className="rounded-md bg-background px-2 py-0.5 text-mobile-caption pc:text-[11px] text-muted-foreground dark:bg-black/20">
                      {t("weekBreakdown.sessionsCount", {
                        count: weekWorkoutCount,
                      })}
                    </div>
                  </div>

                  <div className="mt-2 space-y-1.5">
                    {week.days.map((day) => (
                      <div
                        key={`${week.weekIndex}-${day.dayIndex}`}
                        className="rounded-md bg-background px-2 py-1.5 dark:bg-black/20"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-mobile-caption pc:text-xs font-medium text-foreground">
                            {getWeekdayCompactLabel(day.dayIndex)}
                            {day.dateLabel ? (
                              <span className="ml-1.5 text-mobile-caption pc:text-[11px] font-normal text-muted-foreground">
                                {day.dateLabel}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-mobile-caption pc:text-[11px] text-muted-foreground">
                            {t("weekBreakdown.sessionsCount", {
                              count: day.workouts.length,
                            })}
                          </div>
                        </div>
                        {day.workouts.length === 0 ? (
                          <div className="mt-1 text-mobile-caption pc:text-xs text-muted-foreground">
                            {t("weekBreakdown.emptyDay")}
                          </div>
                        ) : (
                          <div className="mt-1.5 space-y-1">
                            {day.workouts.map((workout) => (
                              <WeekWorkoutCard
                                key={workout.id}
                                workout={workout}
                                t={t}
                                onOpenWorkout={onOpenWorkout}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Panel>
  );
}
