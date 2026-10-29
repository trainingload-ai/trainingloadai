"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  parseWorkoutDefinition,
  type ResolvedWorkoutDefinition,
} from "@/api/workout";
import type { PlanSportType } from "@/api/plans";
import { WorkoutRenderer } from "@/components/workout/WorkoutRenderer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { CoachPlanDraft } from "@/lib/coach-plan-draft";
import {
  buildCoachDraftGlobalSessionOrdinalMap,
  draftWorkoutOrdinalKey,
  normalizeCoachDraftSportType,
} from "@/lib/coach-plan-draft";
import { resolveWorkoutSportLabelKind } from "@/lib/workout-sport-label";
import { useUserZones } from "@/hooks/useUserZones";
import { workoutZoneColorsFromSettings } from "@/components/workout/workout-zone-colors";

type WorkoutRow = CoachPlanDraft["workouts"][number];
type ParsedWorkoutState = {
  key: string;
  workout: WorkoutRow;
  definition: ResolvedWorkoutDefinition | null;
  parseError: string | null;
};

type Props = {
  draft: CoachPlanDraft;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workouts: WorkoutRow[];
  /** 与草案一致：1-based 周次、1-based 周几（1=周一 … 7=周日） */
  weekIndex1: number;
  dayIndex1: number;
};

export function CoachPlanDraftWorkoutDialog({
  draft,
  open,
  onOpenChange,
  workouts,
  weekIndex1,
  dayIndex1,
}: Props) {
  const t = useTranslations("AiCoachPage.planDraft");
  const tWe = useTranslations("WorkoutEditor");
  const tSports = useTranslations("SportCatalog");
  const { data: userZones } = useUserZones(open);
  const zoneColorsBySport = useMemo(
    () =>
      new Map<string, ReturnType<typeof workoutZoneColorsFromSettings>>(
        (["RUN", "CYCLING", "SWIM"] as const).map((sport) => [
          sport,
          workoutZoneColorsFromSettings(userZones, sport),
        ]),
      ),
    [userZones],
  );
  const globalOrdinalMap = useMemo(
    () => buildCoachDraftGlobalSessionOrdinalMap(draft),
    [draft],
  );
  const [parsedWorkouts, setParsedWorkouts] = useState<ParsedWorkoutState[]>(
    [],
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || workouts.length === 0) {
      setParsedWorkouts([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setParsedWorkouts([]);
    void Promise.all(
      workouts.map(async (workout) => {
        const text = workout.text?.trim() ?? "";
        if (!text) {
          return {
            key: `${workout.weekIndex}-${workout.dayIndex}-${workout.sessionIndex ?? 1}`,
            workout,
            definition: null,
            parseError: null,
          } satisfies ParsedWorkoutState;
        }
        try {
          const definition =
            workout.structure && workout.summary
              ? {
                  kind: workout.structureKind ?? workout.structure.kind,
                  version: workout.dslVersion ?? 1,
                  text,
                  structure: workout.structure,
                  summary: workout.summary,
                  warnings: [],
                }
              : await parseWorkoutDefinition({
                  kind: workout.structureKind ?? "ENDURANCE",
                  version: 1,
                  source: "TEXT",
                  text,
                });
          return {
            key: `${workout.weekIndex}-${workout.dayIndex}-${workout.sessionIndex ?? 1}`,
            workout,
            definition,
            parseError: null,
          } satisfies ParsedWorkoutState;
        } catch (e: unknown) {
          return {
            key: `${workout.weekIndex}-${workout.dayIndex}-${workout.sessionIndex ?? 1}`,
            workout,
            definition: null,
            parseError: e instanceof Error ? e.message : String(e),
          } satisfies ParsedWorkoutState;
        }
      }),
    )
      .then((items) => {
        if (!cancelled) setParsedWorkouts(items);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, workouts]);

  const weekdayKey = String(Math.min(6, Math.max(0, dayIndex1 - 1))) as
    | "0"
    | "1"
    | "2"
    | "3"
    | "4"
    | "5"
    | "6";
  const weekdayShort = t(`weekdayShort.${weekdayKey}`);

  const sessionMultiple = workouts.length > 1;
  const firstWorkout = workouts[0];
  const headerOrdinal = firstWorkout
    ? (globalOrdinalMap.get(draftWorkoutOrdinalKey(firstWorkout)) ??
      firstWorkout.sessionIndex ??
      1)
    : 1;
  const headerSport = firstWorkout
    ? normalizeCoachDraftSportType(firstWorkout.sportType)
    : "RUN";

  const sportLabel = (
    st: PlanSportType,
    structureKind?: string,
    sportDefinitionCode?: string,
  ) => {
    const kind = resolveWorkoutSportLabelKind({
      sportType: st,
      structureKind,
      sportDefinitionCode,
    });
    if (kind === "strength") return tSports("sports.STRENGTH_TRAINING");
    if (kind === "stretching") return tSports("sports.STRETCHING");
    if (kind === "cycling") return tWe("fields.sportType.options.cycling");
    if (kind === "swim") return tWe("fields.sportType.options.swim");
    if (kind === "run") return tWe("fields.sportType.options.run");
    return tSports("families.UNKNOWN");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[100vw] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none md:w-[min(92vw,900px)]">
        <div className="shrink-0 space-y-3 border-b border-border/60 p-3">
          <DialogHeader className="space-y-0 text-left">
            <DialogTitle className="text-base leading-snug">
              {sessionMultiple
                ? `${tWe("title.view")} · ${tWe("title.weekLabel", { week: weekIndex1 })} · ${weekdayShort} · ${t("workoutDialogSessionCount", { count: workouts.length })}`
                : `${tWe("title.view")} · ${tWe("title.weekLabel", { week: weekIndex1 })} · ${weekdayShort} · ${tWe("title.sessionLabel", { session: headerOrdinal })}`}
            </DialogTitle>
          </DialogHeader>
          {!sessionMultiple ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-sm font-medium">
                  {tWe("fields.sportType.label")}
                </div>
                <div className="text-sm text-muted-foreground">
                  {sportLabel(
                    headerSport,
                    firstWorkout?.structureKind,
                    firstWorkout?.sportDefinitionCode,
                  )}
                </div>
              </div>
              {firstWorkout?.name?.trim() ? (
                <p className="text-sm text-muted-foreground">
                  {firstWorkout.name.trim()}
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="min-h-0 overflow-y-auto overflow-x-hidden max-h-[calc(90vh-13rem)]">
          {loading && parsedWorkouts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("workoutDialogLoading")}
            </p>
          ) : (
            <div className="flex flex-col gap-4 p-3">
              {parsedWorkouts.map(
                ({ key, workout, definition, parseError }) => {
                  const text = workout.text?.trim() ?? "";
                  const sport = normalizeCoachDraftSportType(
                    workout?.sportType,
                  );
                  const globalOrdinal =
                    globalOrdinalMap.get(draftWorkoutOrdinalKey(workout)) ??
                    workout.sessionIndex ??
                    1;
                  return (
                    <div
                      key={key}
                      className="overflow-hidden bg-background"
                    >
                      {sessionMultiple ? (
                        <div className="border-b border-border/50 px-5 pb-3 pt-4">
                          {workout.name?.trim() ? (
                            <div className="text-sm font-semibold leading-snug text-foreground">
                              {workout.name.trim()}
                            </div>
                          ) : null}
                          <div
                            className={
                              workout.name?.trim()
                                ? "mt-1 text-sm text-muted-foreground"
                                : "text-sm font-medium text-foreground"
                            }
                          >
                            {tWe("title.sessionLabel", {
                              session: globalOrdinal,
                            })}{" "}
                            · {sportLabel(
                              sport,
                              workout.structureKind,
                              workout.sportDefinitionCode,
                            )}
                          </div>
                        </div>
                      ) : null}

                      <div className="grid min-h-0 grid-cols-1 gap-3 md:grid-cols-5 md:items-stretch">
                        <div className="flex min-h-0 flex-col gap-3 border-border/60 md:col-span-2 md:border-r md:border-border/60">
                          <div className="text-sm font-medium">
                            {t("workoutDialogNotes")}
                          </div>
                          <div className="h-[200px] overflow-hidden rounded-md border border-border/60 bg-background md:h-[240px]">
                            <Textarea
                              value={workout.notes?.trim() || ""}
                              readOnly
                              disabled
                              placeholder={t("workoutDialogNotesEmpty")}
                              className="h-full min-h-0 w-full resize-none overflow-y-auto border-0 bg-transparent p-3 text-sm focus-visible:ring-0"
                            />
                          </div>
                        </div>

                        <div className="flex min-h-0 min-w-0 flex-col gap-3 md:col-span-3">
                          <div className="flex min-h-0 flex-col gap-3">
                            <div className="text-sm font-medium">
                              {t("workoutDialogDsl")}
                            </div>
                            <div className="overflow-hidden rounded-md bg-neutral-100 dark:bg-muted/45">
                              <Textarea
                                value={text}
                                readOnly
                                disabled
                                className="min-h-[180px] w-full resize-none border-0 bg-transparent p-3 font-mono text-mobile-caption pc:text-xs leading-relaxed focus-visible:ring-0 md:min-h-[140px] md:text-sm"
                              />
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div className="text-sm font-medium">
                              {t("workoutDialogIntensity")}
                            </div>
                            <div className="min-h-0 overflow-hidden bg-muted/45 dark:bg-muted/40">
                              {parseError ? (
                                <p className="p-3 text-sm text-destructive">
                                  {parseError}
                                </p>
                              ) : definition ? (
                                <WorkoutRenderer
                                  workout={{
                                    structureKind: definition.kind,
                                    structure: definition.structure,
                                    summary: definition.summary,
                                    blocks:
                                      definition.structure.kind === "ENDURANCE"
                                        ? definition.structure.blocks
                                        : null,
                                    text: definition.text,
                                    sportType: sport,
                                  }}
                                  density="DETAIL"
                                  zoneColors={zoneColorsBySport.get(sport)}
                                />
                              ) : (
                                <p className="p-3 text-sm text-muted-foreground">
                                  {t("workoutDialogNoChart")}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          )}

          {!loading && parsedWorkouts.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 px-5 py-10 text-center text-sm text-muted-foreground">
              {t("workoutDialogNoChart")}
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/60 px-5 py-4 sm:justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("workoutDialogClose")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
