"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { ParsedPlan } from "@/api/workout";
import {
  buildCoachDraftGlobalSessionOrdinalMap,
  draftWorkoutOrdinalKey,
  normalizeCoachDraftSportType,
  type CoachPlanDraft,
} from "@/lib/coach-plan-draft";
import { sanitizeHtmlForBrowser } from "@/lib/browser-sanitize-html";
import { cn } from "@/lib/utils";
import type { WorkoutExpressionSportType } from "@/components/plan/workout-expression-codec";
import { WorkoutPlanChart } from "@/components/workout/WorkoutPlanChart";
import { WorkoutRenderer } from "@/components/workout/WorkoutRenderer";
import { ChevronRight, Dumbbell } from "lucide-react";
import { MobileHorizontalSegmentedControl } from "@/components/mobile-app/components/MobileHorizontalSegmentedControl";

import { CoachPlanDraftWorkoutDialog } from "./coach-plan-draft-workout-dialog";

type WorkoutRow = CoachPlanDraft["workouts"][number];
type Cell = WorkoutRow[];
type StrengthPreviewTranslator = (
  key: "exerciseCount" | "workingSetCount",
  values?: { count: number },
) => string;

function buildGrid(draft: CoachPlanDraft): Cell[][] {
  const grid: Cell[][] = Array.from({ length: draft.periodWeeks }, () =>
    Array.from({ length: 7 }, () => []),
  );
  for (const w of draft.workouts) {
    const wi = w.weekIndex - 1;
    const di = w.dayIndex - 1;
    if (wi < 0 || wi >= draft.periodWeeks || di < 0 || di > 6) continue;
    const t = w.text?.trim();
    if (!t) continue;
    grid[wi]![di]!.push({
      ...w,
      text: t,
      notes: w.notes?.trim() || undefined,
      name: w.name?.trim() || undefined,
      sportType: w.sportType?.trim() || undefined,
      sessionIndex: Math.max(1, w.sessionIndex ?? 1),
    });
  }
  grid.forEach((week) =>
    week.forEach((day) =>
      day.sort((a, b) => (a.sessionIndex ?? 1) - (b.sessionIndex ?? 1)),
    ),
  );
  return grid;
}

function strengthCellSummary(
  workout: WorkoutRow,
  t: StrengthPreviewTranslator,
): string | null {
  const isStrength =
    workout.structureKind === "STRENGTH" ||
    workout.structure?.kind === "STRENGTH" ||
    workout.summary?.kind === "STRENGTH";
  if (!isStrength) return null;

  const structure =
    workout.structure?.kind === "STRENGTH" ? workout.structure : null;
  const summary = workout.summary?.kind === "STRENGTH" ? workout.summary : null;
  const exerciseCount = summary?.exerciseCount ?? structure?.exercises.length;
  const workingSetCount =
    summary?.workingSetCount ??
    structure?.exercises.reduce(
      (total, exercise) =>
        total +
        exercise.setGroups.reduce(
          (sets, group) =>
            sets + (group.setType === "WORK" ? group.setCount : 0),
          0,
        ),
      0,
    );
  if (exerciseCount == null || workingSetCount == null) return null;
  return `${t("exerciseCount", { count: exerciseCount })} · ${t("workingSetCount", { count: workingSetCount })}`;
}

/** 小格内力量课显示结构统计；其他训练优先显示 notes > name > DSL 摘要。 */
function summarizeCell(c: WorkoutRow, maxLen: number): string {
  const head =
    c.notes?.trim() || c.name?.trim() || c.text.replace(/\s+/g, " ").trim();
  if (head.length <= maxLen) return head;
  return `${head.slice(0, Math.max(0, maxLen - 1))}…`;
}

function blocksForChart(blocks: unknown): ParsedPlan | null {
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  return blocks as ParsedPlan;
}

function normalizeChartSportType(
  sportType: string | null | undefined,
): WorkoutExpressionSportType {
  return sportType === "CYCLING" || sportType === "SWIM" ? sportType : "RUN";
}

function workoutSportLabel(workout: WorkoutRow): string {
  if (
    workout.structureKind === "STRENGTH" ||
    workout.structure?.kind === "STRENGTH"
  ) {
    return "STRENGTH";
  }
  const sportType = workout.sportType?.trim().toUpperCase();
  return sportType && sportType !== "UNKNOWN" ? sportType : "RUN";
}

type Props = {
  draft: CoachPlanDraft;
  className?: string;
  /** default：固定最大高度日历区；dialog / embedded：占满父级剩余高度（embedded 用于手动创建第三步等） */
  variant?: "default" | "dialog" | "embedded";
};

export function CoachPlanDraftCalendarPreview({
  draft,
  className,
  variant = "default",
}: Props) {
  const t = useTranslations("AiCoachPage.planDraft");
  const tStrength = useTranslations("WorkoutEditor.strength.preview");
  const [picked, setPicked] = useState<{
    week: number;
    day: number;
    workoutIndex: number;
  } | null>(null);
  const [activeWeek, setActiveWeek] = useState(0);
  const [safeDescriptionHtml, setSafeDescriptionHtml] = useState("");

  useEffect(() => {
    setActiveWeek((current) =>
      Math.min(Math.max(0, current), Math.max(0, draft.periodWeeks - 1)),
    );
  }, [draft.periodWeeks]);

  useEffect(() => {
    const raw = draft.description?.trim();
    if (!raw) {
      setSafeDescriptionHtml("");
      return;
    }

    let alive = true;
    void sanitizeHtmlForBrowser(raw).then((safe) => {
      if (alive) setSafeDescriptionHtml(safe);
    });
    return () => {
      alive = false;
    };
  }, [draft.description]);

  const weekdayLabels = useMemo(() => {
    const keys = ["0", "1", "2", "3", "4", "5", "6"] as const;
    return keys.map((k) => t(`weekdayShort.${k}`));
  }, [t]);

  const grid = useMemo(() => buildGrid(draft), [draft]);

  const draftGlobalSessionOrdinal = useMemo(
    () => buildCoachDraftGlobalSessionOrdinalMap(draft),
    [draft],
  );

  const selectedWorkouts = useMemo(() => {
    if (!picked) return null;
    const workout = grid[picked.week]?.[picked.day]?.[picked.workoutIndex];
    return workout ? [workout] : null;
  }, [grid, picked]);

  const fillHeight = variant === "dialog" || variant === "embedded";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl bg-neutral-100 shadow-none dark:bg-muted/45",
        fillHeight && "flex min-h-0 flex-1 flex-col",
        className,
      )}
    >
      <div className={cn("px-3 py-2.5 sm:px-4", fillHeight && "shrink-0")}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          <div className="min-w-0 flex-1 text-sm font-semibold leading-snug tracking-tight text-foreground sm:text-[15px]">
            {draft.title}
          </div>
          <p className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-neutral-200/80 px-2 py-0.5 text-mobile-caption pc:text-[11px] font-medium text-muted-foreground dark:bg-muted/55">
            {t("summary", {
              weeks: draft.periodWeeks,
              sessions: draft.workouts.filter((w) => w.text?.trim()).length,
            })}
          </p>
        </div>
        <div className="mt-1.5 min-h-[2lh] text-sm leading-snug">
          {safeDescriptionHtml ? (
            <div
              className={cn(
                "plan-draft-desc-preview text-muted-foreground",
                "break-words [&_li]:my-0 [&_ol]:my-0 [&_p]:my-0 [&_ul]:my-0",
              )}
              dangerouslySetInnerHTML={{ __html: safeDescriptionHtml }}
            />
          ) : null}
        </div>
      </div>
      <div
        data-testid="coach-plan-draft-mobile-calendar"
        className={cn(
          "min-h-0 overscroll-contain pc:hidden",
          fillHeight && "flex flex-1 flex-col",
        )}
      >
        <div className="shrink-0 px-2 py-2">
          <MobileHorizontalSegmentedControl
            ariaLabel={t("weekColumn")}
            value={activeWeek}
            options={grid.map((_, week) => ({
              value: week,
              label: t("weekLabel", { week: week + 1 }),
            }))}
            itemClassName="w-auto min-w-[68px] px-3"
            onValueChange={setActiveWeek}
          />
        </div>
        <div
          className={cn(
            "min-h-0 flex-1 px-2 py-2",
            fillHeight && "overflow-y-auto",
          )}
        >
          <div className="space-y-1.5">
            {(grid[activeWeek] ?? []).map((cell, day) => {
              const filled = cell.length > 0;
              return (
                <div
                  key={`${activeWeek}-${day}`}
                  className="rounded-md bg-background/80 px-3 py-2.5 dark:bg-background/45"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="w-12 shrink-0 text-sm font-semibold text-muted-foreground">
                      {weekdayLabels[day]}
                    </div>
                    {filled ? (
                      <div className="min-w-0 flex-1 space-y-1">
                        {cell.map((workout, workoutIndex) => {
                          const selected =
                            picked?.week === activeWeek &&
                            picked.day === day &&
                            picked.workoutIndex === workoutIndex;
                          const ordinal =
                            draftGlobalSessionOrdinal.get(
                              draftWorkoutOrdinalKey(workout),
                            ) ??
                            workout.sessionIndex ??
                            1;
                          const strengthSummary = strengthCellSummary(
                            workout,
                            tStrength,
                          );
                          return (
                            <button
                              key={`${activeWeek}-${day}-${workout.sessionIndex ?? 1}-${workoutIndex}`}
                              type="button"
                              aria-pressed={selected}
                              aria-label={`${workout.name?.trim() || workout.sportType?.trim() || "—"} · S${ordinal}`}
                              onClick={() =>
                                setPicked({
                                  week: activeWeek,
                                  day,
                                  workoutIndex,
                                })
                              }
                              className={cn(
                                "min-h-11 w-full touch-manipulation select-none rounded-lg bg-muted/55 px-2.5 py-2 text-left outline-none ring-offset-background transition-[background-color,box-shadow,transform] duration-100 hover:bg-neutral-200/75 active:scale-[0.985] active:bg-neutral-200 focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-muted/75 dark:active:bg-muted/90",
                                selected &&
                                  "bg-primary/10 ring-2 ring-primary/35 dark:bg-primary/15",
                              )}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                                  {workout.name?.trim() ||
                                    workout.sportType?.trim() ||
                                    "—"}
                                </span>
                                <span className="shrink-0 text-mobile-caption tabular-nums text-muted-foreground">
                                  S{ordinal}
                                </span>
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                              </div>
                              {strengthSummary ? (
                                <div className="mt-1 flex min-w-0 items-center gap-1 text-[11px] leading-4 text-muted-foreground">
                                  <Dumbbell
                                    className="h-3 w-3 shrink-0"
                                    aria-hidden
                                  />
                                  <span className="truncate">
                                    {strengthSummary}
                                  </span>
                                </div>
                              ) : (
                                <p className="mt-0.5 line-clamp-2 break-words text-mobile-caption leading-5 text-muted-foreground">
                                  {summarizeCell(workout, 96)}
                                </p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="min-h-11 flex-1 content-center text-sm text-muted-foreground/70">
                        {t("rest")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div
        className={cn(
          "hidden overflow-auto pc:block",
          fillHeight ? "min-h-0 flex-1" : "max-h-[min(64vh,560px)]",
        )}
      >
        <div className="w-full min-w-0 px-3 pb-2">
          <div className="flex w-full min-w-0 flex-col gap-1">
            <div
              className={cn(
                "sticky top-0 z-10 grid min-w-0 grid-cols-8 gap-1 bg-neutral-100 text-mobile-caption dark:bg-muted pc:text-xs",
              )}
            >
              <div className="min-w-0 p-1.5 font-medium text-muted-foreground sm:p-2">
                {t("weekColumn")}
              </div>
              {weekdayLabels.map((label) => (
                <div
                  key={label}
                  className="min-w-0 p-1.5 text-center font-medium text-muted-foreground sm:p-2"
                >
                  {label}
                </div>
              ))}
            </div>
            {grid.map((weekRow, week) => (
              <div key={week} className="grid min-w-0 grid-cols-8 gap-1">
                <div className="min-w-0 p-1.5 text-mobile-caption pc:text-xs font-medium text-muted-foreground sm:p-2">
                  {t("weekLabel", { week: week + 1 })}
                </div>
                {weekRow.map((cell, day) => {
                  const filled = cell.length > 0;
                  return (
                    <div
                      key={`${week}-${day}`}
                      className={cn(
                        "flex min-h-[72px] min-w-0 flex-col rounded-sm p-1.5 text-left sm:min-h-[88px] sm:p-2",
                        filled
                          ? "bg-background/80 transition-colors hover:bg-background dark:bg-background/45 dark:hover:bg-background/65"
                          : "bg-background/35 dark:bg-background/20",
                      )}
                    >
                      {filled ? (
                        <div className="flex min-h-0 flex-1 flex-col gap-1">
                          {cell.map((workout, workoutIndex) => {
                            const chartPlan = blocksForChart(workout.blocks);
                            const strengthSummary = strengthCellSummary(
                              workout,
                              tStrength,
                            );
                            const selected =
                              picked?.week === week &&
                              picked.day === day &&
                              picked.workoutIndex === workoutIndex;
                            const ordinal =
                              draftGlobalSessionOrdinal.get(
                                draftWorkoutOrdinalKey(workout),
                              ) ??
                              workout.sessionIndex ??
                              1;
                            return (
                              <button
                                key={`${week}-${day}-${workout.sessionIndex ?? 1}-${workoutIndex}`}
                                type="button"
                                aria-pressed={selected}
                                aria-label={`${workout.name?.trim() || workout.sportType?.trim() || "—"} · S${ordinal}`}
                                onClick={() =>
                                  setPicked({ week, day, workoutIndex })
                                }
                                className={cn(
                                  "touch-manipulation select-none rounded-md bg-neutral-200/70 px-1.5 py-1 text-left outline-none ring-offset-background transition-[background-color,box-shadow,transform] duration-100 hover:bg-neutral-300/70 active:scale-[0.985] active:bg-neutral-300 focus-visible:ring-2 focus-visible:ring-ring dark:bg-muted/50 dark:hover:bg-muted/70 dark:active:bg-muted/90",
                                  selected &&
                                    "bg-primary/10 ring-2 ring-primary/35 dark:bg-primary/15",
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate text-mobile-unit pc:text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                    {workoutSportLabel(workout)}
                                  </span>
                                  <span className="inline-flex items-center gap-0.5 tabular-nums text-mobile-unit pc:text-[10px] text-muted-foreground">
                                    S{ordinal}
                                    <ChevronRight className="h-3 w-3" />
                                  </span>
                                </div>
                                {strengthSummary ? (
                                  <div className="mt-1 flex min-w-0 items-center gap-1 text-mobile-unit pc:text-[10px] font-medium leading-tight text-foreground">
                                    <Dumbbell
                                      className="h-3 w-3 shrink-0"
                                      aria-hidden
                                    />
                                    <span className="line-clamp-2 break-words">
                                      {strengthSummary}
                                    </span>
                                  </div>
                                ) : workout.structure ? (
                                  <div className="mt-0.5 w-full min-w-0">
                                    <WorkoutRenderer
                                      workout={{
                                        structureKind:
                                          workout.structureKind ??
                                          workout.structure.kind,
                                        structure: workout.structure,
                                        summary: workout.summary,
                                        blocks: Array.isArray(workout.blocks)
                                          ? workout.blocks
                                          : null,
                                        text: workout.text,
                                        sportType: normalizeCoachDraftSportType(
                                          workout.sportType,
                                        ),
                                      }}
                                      density="COMPACT"
                                    />
                                  </div>
                                ) : chartPlan ? (
                                  <div className="mt-0.5 w-full min-w-0">
                                    <WorkoutPlanChart
                                      plan={chartPlan}
                                      sportType={normalizeChartSportType(
                                        workout.sportType,
                                      )}
                                      hideAxes
                                      hideTooltip
                                      height={36}
                                    />
                                  </div>
                                ) : (
                                  <p className="mt-0.5 line-clamp-2 break-words text-mobile-caption pc:text-xs leading-snug text-foreground">
                                    {summarizeCell(
                                      workout,
                                      variant === "dialog" ? 56 : 84,
                                    )}
                                  </p>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-mobile-caption pc:text-[11px] text-muted-foreground/70">
                          {t("rest")}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <CoachPlanDraftWorkoutDialog
        draft={draft}
        open={picked !== null && selectedWorkouts !== null}
        onOpenChange={(open) => {
          if (!open) setPicked(null);
        }}
        workouts={selectedWorkouts ?? []}
        weekIndex1={picked ? picked.week + 1 : 1}
        dayIndex1={picked ? picked.day + 1 : 1}
      />
    </div>
  );
}
