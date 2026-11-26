"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { calendarIsoWeekday } from "@shared/plan-calendar";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  parseWorkoutDefinition,
  type ResolvedWorkoutDefinition,
} from "@/api/workout";
import type { PlanSportType } from "@/api/plans";
import { WorkoutRenderer } from "@/components/workout/WorkoutRenderer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  /** Original 1-based plan position, independent of the calendar weekday. */
  weekIndex1: number;
  dayIndex1: number;
  calendarDate?: string;
  allowRemoteWorkoutDetails?: boolean;
  presentation?: "dialog" | "embedded-dialog" | "panel";
  onCloseAutoFocus?: (event: Event) => void;
};

export function CoachPlanDraftWorkoutDialog({
  draft,
  open,
  onOpenChange,
  workouts,
  weekIndex1,
  dayIndex1,
  calendarDate,
  allowRemoteWorkoutDetails = true,
  presentation = "dialog",
  onCloseAutoFocus,
}: Props) {
  const titleId = useId();
  const t = useTranslations("AiCoachPage.planDraft");
  const tWe = useTranslations("WorkoutEditor");
  const tSports = useTranslations("SportCatalog");
  const { data: userZones } = useUserZones(open && allowRemoteWorkoutDetails);
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
              : allowRemoteWorkoutDetails
                ? await parseWorkoutDefinition({
                    kind: workout.structureKind ?? "ENDURANCE",
                    version: 1,
                    source: "TEXT",
                    text,
                  })
                : null;
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
  }, [open, workouts, allowRemoteWorkoutDetails]);

  const weekdayKey = String(
    Math.min(
      6,
      Math.max(
        0,
        (calendarDate ? calendarIsoWeekday(calendarDate) : dayIndex1) - 1,
      ),
    ),
  ) as "0" | "1" | "2" | "3" | "4" | "5" | "6";
  const weekdayShort = `${calendarDate ? `${calendarDate} · ` : ""}${t(`weekdayShort.${weekdayKey}`)}`;

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

  const sessionLabel = sessionMultiple
    ? t("workoutDialogSessionCount", { count: workouts.length })
    : tWe("title.sessionLabel", { session: headerOrdinal });
  const sessionPosition = `${tWe("title.weekLabel", { week: weekIndex1 })} · ${weekdayShort} · ${sessionLabel}`;
  const title = `${tWe("title.view")} · ${sessionPosition}`;

  function renderWorkout({ definition, parseError }: ParsedWorkoutState, sport: PlanSportType) {
    if (parseError) {
      return <p className="p-3 text-sm text-destructive">{parseError}</p>;
    }
    if (!definition) {
      return <p className="p-3 text-sm text-muted-foreground">{t("workoutDialogNoChart")}</p>;
    }
    return (
      <WorkoutRenderer
        workout={{
          structureKind: definition.kind,
          structure: definition.structure,
          summary: definition.summary,
          blocks: definition.structure.kind === "ENDURANCE" ? definition.structure.blocks : null,
          text: definition.text,
          sportType: sport,
        }}
        density="DETAIL"
        zoneColors={zoneColorsBySport.get(sport)}
      />
    );
  }

  if (presentation !== "dialog") {
    if (!open) return null;

    const heading = firstWorkout?.name?.trim() || tWe("title.view");
    const metadata = `${sessionPosition} · ${sportLabel(headerSport, firstWorkout?.structureKind, firstWorkout?.sportDefinitionCode)}`;
    const content = (
      <CardContent className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-4 pb-4 pt-2 sm:px-5">
        {parsedWorkouts.length === 0 ? (
          <p role="status" className="py-4 text-sm text-muted-foreground">
            {loading ? t("workoutDialogLoading") : t("workoutDialogNoChart")}
          </p>
        ) : (
          parsedWorkouts.map((item) => {
            const sport = normalizeCoachDraftSportType(item.workout.sportType);
            const notes = item.workout.notes?.trim();
            const text = item.workout.text?.trim();
            return (
              <div key={item.key} className="min-w-0 space-y-4">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">{t("workoutDialogIntensity")}</h3>
                  <div className="min-w-0 rounded-md bg-muted/45">
                    {renderWorkout(item, sport)}
                  </div>
                </div>
                {notes ? (
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium">{t("workoutDialogNotes")}</h3>
                    <p className="whitespace-pre-wrap wrap-anywhere text-sm leading-relaxed text-muted-foreground">
                      {notes}
                    </p>
                  </div>
                ) : null}
                {text ? (
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="group -ms-2 gap-1.5 px-2 text-muted-foreground"
                      >
                        <ChevronDown aria-hidden="true" className="group-data-[state=open]:rotate-180" />
                        {t("workoutDialogDsl")}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <pre className="mt-1 whitespace-pre-wrap wrap-anywhere rounded-md bg-muted/45 p-3 font-mono text-xs leading-relaxed">
                        {text}
                      </pre>
                    </CollapsibleContent>
                  </Collapsible>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>
    );

    if (presentation === "panel") {
      return (
        <section aria-labelledby={titleId} className="flex min-h-0 flex-col">
          <Card className="flex min-h-0 flex-col bg-muted/45">
            <CardHeader className="shrink-0 space-y-2 px-4 pb-2 pt-3 sm:px-5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="-ms-2 w-fit gap-1.5 px-2 text-muted-foreground"
                autoFocus
                onClick={() => onOpenChange(false)}
              >
                <ArrowLeft aria-hidden="true" />
                {t("workoutDialogBackToCalendar")}
              </Button>
              <h2 id={titleId} className="wrap-anywhere text-base font-semibold leading-snug">{heading}</h2>
              <p className="text-sm text-muted-foreground">{metadata}</p>
            </CardHeader>
            {content}
          </Card>
        </section>
      );
    }

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          aria-labelledby={titleId}
          aria-describedby={`${titleId}-context`}
          onCloseAutoFocus={onCloseAutoFocus}
          className="flex max-h-[calc(100dvh-0.5rem)] w-full flex-col gap-0 overflow-hidden border-0 p-0 pc:max-h-[calc(100dvh-1.5rem)] pc:max-w-[42rem] pc:p-0"
        >
          <DialogHeader className="shrink-0 space-y-1 px-4 pb-2 pt-4 pe-16 text-start sm:px-5 sm:pe-16">
            <DialogTitle id={titleId} className="wrap-anywhere text-base leading-snug">{heading}</DialogTitle>
            <p id={`${titleId}-context`} className="text-sm text-muted-foreground">{metadata}</p>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-labelledby={titleId}
        onCloseAutoFocus={onCloseAutoFocus}
        className="flex max-h-[90vh] w-[100vw] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none md:w-[min(92vw,900px)]"
      >
        <div className="shrink-0 space-y-3 border-b border-border/60 p-3">
          <DialogHeader className="space-y-0 text-left">
            <DialogTitle id={titleId} className="text-base leading-snug">
              {title}
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
                (item) => {
                  const { key, workout } = item;
                  const text = workout.text?.trim() ?? "";
                  const sport = normalizeCoachDraftSportType(
                    workout?.sportType,
                  );
                  const globalOrdinal =
                    globalOrdinalMap.get(draftWorkoutOrdinalKey(workout)) ??
                    workout.sessionIndex ??
                    1;
                  return (
                    <div key={key} className="overflow-hidden bg-background">
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
                            ·{" "}
                            {sportLabel(
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
                              {renderWorkout(item, sport)}
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
