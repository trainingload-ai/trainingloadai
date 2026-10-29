"use client";

import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Dumbbell,
  ListOrdered,
  Plus,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStrengthExerciseKey } from "@/lib/strength-catalog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  StrengthExerciseIrV1,
  StrengthLoadV1,
  StrengthSetGroupIrV1,
  StrengthWorkoutIrV1,
} from "@shared/strength-workout-ir";

type Props = {
  value: StrengthWorkoutIrV1;
  onChange: (value: StrengthWorkoutIrV1) => void;
  readOnly?: boolean;
};

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <div className="flex h-7 items-end" title={label}>
        <span className="line-clamp-2 min-w-0 break-words text-mobile-caption pc:text-[11px] font-medium leading-[1.15] text-muted-foreground">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

function OptionText({ children }: { children: ReactNode }) {
  return (
    <span className="block min-w-0 whitespace-normal break-words leading-snug">
      {children}
    </span>
  );
}

const MOBILE_FIELD_CLASS_NAME =
  "border-0 bg-neutral-100 shadow-none focus-visible:ring-0 dark:bg-muted/45 pc:border pc:bg-transparent pc:dark:bg-transparent";
const SET_GROUP_FIELD_CLASS_NAME =
  "border-0 bg-background shadow-none focus-visible:ring-0 pc:border pc:bg-transparent pc:dark:bg-transparent";
const SELECT_TRIGGER_CLASS_NAME =
  "min-w-0 border-0 bg-background shadow-none focus-visible:ring-0 pc:border [&>span]:min-w-0 [&>span]:truncate";
const SELECT_CONTENT_CLASS_NAME = "max-w-[min(20rem,calc(100vw-2rem))]";

function setGroupSummary(group: StrengthSetGroupIrV1) {
  const prescription =
    group.prescription.kind === "REPS"
      ? group.prescription.repsMin === group.prescription.repsMax
        ? `${group.prescription.repsMin}`
        : `${group.prescription.repsMin}–${group.prescription.repsMax}`
      : `${group.prescription.durationSeconds}s`;
  const rest = group.restSeconds ? ` · ${group.restSeconds}s` : "";
  return `${group.setCount} × ${prescription}${rest}`;
}

const defaultGroup = (): StrengthSetGroupIrV1 => ({
  setType: "WORK",
  setCount: 3,
  prescription: { kind: "REPS", repsMin: 8, repsMax: 8, amrap: false },
  load: { kind: "OPEN" },
  restSeconds: 90,
});

const defaultExercise = (): StrengthExerciseIrV1 => ({
  name: "",
  setGroups: [defaultGroup()],
});

export function createDefaultStrengthWorkout(): StrengthWorkoutIrV1 {
  return {
    kind: "STRENGTH",
    version: 1,
    durationSeconds: 45 * 60,
    plannedSessionRpe: 6,
    exercises: [defaultExercise()],
  };
}

function positiveNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function optionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function defaultLoad(kind: StrengthLoadV1["kind"]): StrengthLoadV1 {
  switch (kind) {
    case "ABSOLUTE":
      return { kind, value: 20, unit: "KG" };
    case "PERCENT_1RM":
      return { kind, value: 70 };
    case "BODYWEIGHT":
      return { kind };
    case "BODYWEIGHT_OFFSET":
      return { kind, direction: "ADDED", value: 5, unit: "KG" };
    default:
      return { kind: "OPEN" };
  }
}

export function StrengthWorkoutBuilder({ value, onChange, readOnly }: Props) {
  const t = useTranslations("WorkoutEditor.strength");
  const tCatalog = useTranslations("StrengthCatalog.exercise");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleGroup = (key: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const updateExercise = (
    exerciseIndex: number,
    update: (exercise: StrengthExerciseIrV1) => StrengthExerciseIrV1,
  ) => {
    onChange({
      ...value,
      exercises: value.exercises.map((exercise, index) =>
        index === exerciseIndex ? update(exercise) : exercise,
      ),
    });
  };

  const updateGroup = (
    exerciseIndex: number,
    groupIndex: number,
    update: (group: StrengthSetGroupIrV1) => StrengthSetGroupIrV1,
  ) => {
    updateExercise(exerciseIndex, (exercise) => ({
      ...exercise,
      setGroups: exercise.setGroups.map((group, index) =>
        index === groupIndex ? update(group) : group,
      ),
    }));
  };

  return (
    <div className="space-y-3 pc:p-1">
      <section className="rounded-surface bg-background p-3 pc:border pc:border-border/70">
        <h3 className="mb-3 text-mobile-caption pc:text-xs font-semibold text-foreground">
          {t("session.title")}
        </h3>
        <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2">
          <Field label={t("session.durationMinutes")}>
            <Input
              aria-label={t("session.durationMinutes")}
              className={cn(MOBILE_FIELD_CLASS_NAME, "tabular-nums")}
              size="default"
              name="strength.durationMinutes"
              type="number"
              min={1}
              autoComplete="off"
              value={Math.round((value.durationSeconds ?? 0) / 60) || ""}
              disabled={readOnly}
              onChange={(event) =>
                onChange({
                  ...value,
                  durationSeconds: positiveNumber(event.target.value, 45) * 60,
                })
              }
            />
          </Field>
          <Field label={t("session.plannedSessionRpe")}>
            <Input
              aria-label={t("session.plannedSessionRpe")}
              className={cn(MOBILE_FIELD_CLASS_NAME, "tabular-nums")}
              size="default"
              name="strength.plannedSessionRpe"
              type="number"
              min={1}
              max={10}
              step={0.5}
              autoComplete="off"
              value={value.plannedSessionRpe ?? ""}
              disabled={readOnly}
              onChange={(event) =>
                onChange({
                  ...value,
                  plannedSessionRpe: optionalNumber(event.target.value),
                })
              }
            />
          </Field>
        </div>
      </section>

      {value.exercises.map((exercise, exerciseIndex) => {
        const exerciseKey = getStrengthExerciseKey(exercise);
        const displayName = exerciseKey
          ? tCatalog(exerciseKey)
          : exercise.name.trim();
        return (
          <section
            key={exercise.id ?? exerciseIndex}
            className="space-y-3 rounded-surface bg-background p-3 pc:border pc:border-border/70"
          >
            <div className="flex min-h-[60px] min-w-0 items-center gap-3 border-b border-border/60 pc:hidden">
              <span className="grid size-9 shrink-0 place-items-center rounded-compact bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                <Dumbbell className="size-[17px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-semibold">
                  {displayName ||
                    t("exercise.title", { number: exerciseIndex + 1 })}
                </span>
                <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                  {t("setGroup.title", {
                    number: exercise.setGroups.length,
                  })}
                </span>
              </span>
              {!readOnly ? (
                <Button
                  type="button"
                  size="icon-lg"
                  variant="ghost"
                  className="shrink-0 rounded-full text-red-600"
                  title={t("exercise.remove", {
                    number: exerciseIndex + 1,
                  })}
                  aria-label={t("exercise.remove", {
                    number: exerciseIndex + 1,
                  })}
                  onClick={() =>
                    onChange({
                      ...value,
                      exercises: value.exercises.filter(
                        (_, index) => index !== exerciseIndex,
                      ),
                    })
                  }
                >
                  <Trash2 aria-hidden="true" className="size-[17px]" />
                </Button>
              ) : null}
            </div>

            <div className="hidden min-w-0 items-center justify-between gap-2 border-b border-border/60 pb-2 pc:flex">
              <h3 className="min-w-0 truncate text-mobile-caption pc:text-xs font-semibold text-foreground">
                {t("exercise.title", { number: exerciseIndex + 1 })}
              </h3>
              {!readOnly && value.exercises.length > 1 ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  title={t("exercise.remove", {
                    number: exerciseIndex + 1,
                  })}
                  aria-label={t("exercise.remove", {
                    number: exerciseIndex + 1,
                  })}
                  onClick={() =>
                    onChange({
                      ...value,
                      exercises: value.exercises.filter(
                        (_, index) => index !== exerciseIndex,
                      ),
                    })
                  }
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </Button>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <Field label={t("exercise.name")}>
                <Input
                  aria-label={t("exercise.name")}
                  className={MOBILE_FIELD_CLASS_NAME}
                  size="default"
                  name={`strength.exercises.${exerciseIndex}.name`}
                  value={exercise.name}
                  placeholder={t("exercise.namePlaceholder")}
                  autoComplete="off"
                  disabled={readOnly}
                  onChange={(event) =>
                    updateExercise(exerciseIndex, (current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label={t("exercise.equipment")}>
                <Input
                  aria-label={t("exercise.equipment")}
                  className={MOBILE_FIELD_CLASS_NAME}
                  size="default"
                  name={`strength.exercises.${exerciseIndex}.equipmentCode`}
                  value={exercise.equipmentCode ?? ""}
                  placeholder={t("exercise.equipmentPlaceholder")}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateExercise(exerciseIndex, (current) => ({
                      ...current,
                      equipmentCode: event.target.value || undefined,
                    }))
                  }
                />
              </Field>
            </div>

            <div className="space-y-2.5">
              {exercise.setGroups.map((group, groupIndex) => {
                const groupKey = `${exercise.id ?? exerciseIndex}:${group.id ?? groupIndex}`;
                const mobileExpanded = expandedGroups.has(groupKey);
                return (
                  <div
                    key={group.id ?? groupIndex}
                    data-slot="strength-set-group"
                    className="rounded-lg bg-neutral-100 p-2.5 dark:bg-muted/45 pc:border pc:border-border/60 pc:bg-muted/30"
                  >
                    <div className="flex min-h-[52px] min-w-0 items-center pc:mb-2.5 pc:min-h-0 pc:justify-between pc:gap-2">
                      <button
                        type="button"
                        data-testid={`mobile-strength-group-${exerciseIndex}-${groupIndex}`}
                        aria-expanded={mobileExpanded}
                        onClick={() => toggleGroup(groupKey)}
                        className="flex min-w-0 flex-1 items-center text-left pc:pointer-events-none"
                      >
                        <span className="mr-3 grid size-9 shrink-0 place-items-center rounded-compact bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 pc:hidden">
                          <ListOrdered className="size-[17px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[17px] font-semibold pc:text-[11px]">
                            {t("setGroup.title", { number: groupIndex + 1 })}
                          </span>
                          <span className="mt-0.5 block truncate text-[13px] text-muted-foreground pc:hidden">
                            {setGroupSummary(group)}
                          </span>
                        </span>
                        {mobileExpanded ? (
                          <ChevronDown className="ml-2 size-4 shrink-0 text-muted-foreground pc:hidden" />
                        ) : (
                          <ChevronRight className="ml-2 size-4 shrink-0 text-muted-foreground pc:hidden" />
                        )}
                      </button>
                      {!readOnly ? (
                        <Button
                          type="button"
                          size="icon-touch"
                          variant="ghost"
                          className="shrink-0 text-red-600 pc:text-muted-foreground pc:hover:text-destructive"
                          title={t("setGroup.remove", {
                            number: groupIndex + 1,
                          })}
                          aria-label={t("setGroup.remove", {
                            number: groupIndex + 1,
                          })}
                          onClick={() =>
                            updateExercise(exerciseIndex, (current) => ({
                              ...current,
                              setGroups: current.setGroups.filter(
                                (_, index) => index !== groupIndex,
                              ),
                            }))
                          }
                        >
                          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </div>

                    <div
                      className={cn(
                        "grid-cols-1 gap-x-2.5 gap-y-3 border-t border-border/60 pt-3 min-[440px]:grid-cols-2 pc:grid pc:border-0 pc:pt-0",
                        mobileExpanded ? "grid" : "hidden",
                      )}
                    >
                      <Field label={t("setGroup.setType")}>
                        <Select
                          value={group.setType}
                          disabled={readOnly}
                          onValueChange={(setType: "WARMUP" | "WORK") =>
                            updateGroup(
                              exerciseIndex,
                              groupIndex,
                              (current) => ({
                                ...current,
                                setType,
                              }),
                            )
                          }
                        >
                          <SelectTrigger
                            size="default"
                            className={SELECT_TRIGGER_CLASS_NAME}
                            aria-label={t("setGroup.setType")}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className={SELECT_CONTENT_CLASS_NAME}>
                            <SelectItem value="WARMUP">
                              <OptionText>
                                {t("setGroup.setTypes.warmup")}
                              </OptionText>
                            </SelectItem>
                            <SelectItem value="WORK">
                              <OptionText>
                                {t("setGroup.setTypes.work")}
                              </OptionText>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>

                      <Field label={t("setGroup.sets")}>
                        <Input
                          aria-label={t("setGroup.sets")}
                          className={cn(
                            SET_GROUP_FIELD_CLASS_NAME,
                            "tabular-nums",
                          )}
                          size="default"
                          name={`strength.exercises.${exerciseIndex}.groups.${groupIndex}.setCount`}
                          type="number"
                          min={1}
                          autoComplete="off"
                          value={group.setCount}
                          disabled={readOnly}
                          onChange={(event) =>
                            updateGroup(
                              exerciseIndex,
                              groupIndex,
                              (current) => ({
                                ...current,
                                setCount: positiveNumber(event.target.value, 1),
                              }),
                            )
                          }
                        />
                      </Field>

                      <Field label={t("setGroup.prescription")}>
                        <Select
                          value={group.prescription.kind}
                          disabled={readOnly}
                          onValueChange={(kind: "REPS" | "TIME") =>
                            updateGroup(
                              exerciseIndex,
                              groupIndex,
                              (current) => ({
                                ...current,
                                prescription:
                                  kind === "TIME"
                                    ? { kind, durationSeconds: 30 }
                                    : {
                                        kind,
                                        repsMin: 8,
                                        repsMax: 8,
                                        amrap: false,
                                      },
                              }),
                            )
                          }
                        >
                          <SelectTrigger
                            size="default"
                            className={SELECT_TRIGGER_CLASS_NAME}
                            aria-label={t("setGroup.prescription")}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className={SELECT_CONTENT_CLASS_NAME}>
                            <SelectItem value="REPS">
                              <OptionText>
                                {t("setGroup.prescriptions.reps")}
                              </OptionText>
                            </SelectItem>
                            <SelectItem value="TIME">
                              <OptionText>
                                {t("setGroup.prescriptions.time")}
                              </OptionText>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>

                      {group.prescription.kind === "TIME" ? (
                        <Field label={t("setGroup.seconds")}>
                          <Input
                            aria-label={t("setGroup.seconds")}
                            className={cn(
                              SET_GROUP_FIELD_CLASS_NAME,
                              "tabular-nums",
                            )}
                            size="default"
                            name={`strength.exercises.${exerciseIndex}.groups.${groupIndex}.durationSeconds`}
                            type="number"
                            min={1}
                            autoComplete="off"
                            value={group.prescription.durationSeconds}
                            disabled={readOnly}
                            onChange={(event) =>
                              updateGroup(
                                exerciseIndex,
                                groupIndex,
                                (current) => ({
                                  ...current,
                                  prescription: {
                                    kind: "TIME",
                                    durationSeconds: positiveNumber(
                                      event.target.value,
                                      1,
                                    ),
                                  },
                                }),
                              )
                            }
                          />
                        </Field>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <Field label={t("setGroup.minReps")}>
                            <Input
                              aria-label={t("setGroup.minReps")}
                              className={cn(
                                SET_GROUP_FIELD_CLASS_NAME,
                                "tabular-nums",
                              )}
                              size="default"
                              name={`strength.exercises.${exerciseIndex}.groups.${groupIndex}.repsMin`}
                              type="number"
                              min={1}
                              autoComplete="off"
                              value={group.prescription.repsMin}
                              disabled={readOnly}
                              onChange={(event) =>
                                updateGroup(
                                  exerciseIndex,
                                  groupIndex,
                                  (current) => ({
                                    ...current,
                                    prescription: {
                                      kind: "REPS",
                                      repsMin: positiveNumber(
                                        event.target.value,
                                        1,
                                      ),
                                      repsMax:
                                        current.prescription.kind === "REPS"
                                          ? current.prescription.repsMax
                                          : 1,
                                      amrap:
                                        current.prescription.kind === "REPS"
                                          ? current.prescription.amrap
                                          : false,
                                    },
                                  }),
                                )
                              }
                            />
                          </Field>
                          <Field label={t("setGroup.maxReps")}>
                            <Input
                              aria-label={t("setGroup.maxReps")}
                              className={cn(
                                SET_GROUP_FIELD_CLASS_NAME,
                                "tabular-nums",
                              )}
                              size="default"
                              name={`strength.exercises.${exerciseIndex}.groups.${groupIndex}.repsMax`}
                              type="number"
                              min={1}
                              autoComplete="off"
                              value={group.prescription.repsMax}
                              disabled={readOnly}
                              onChange={(event) =>
                                updateGroup(
                                  exerciseIndex,
                                  groupIndex,
                                  (current) => ({
                                    ...current,
                                    prescription: {
                                      kind: "REPS",
                                      repsMin:
                                        current.prescription.kind === "REPS"
                                          ? current.prescription.repsMin
                                          : 1,
                                      repsMax: positiveNumber(
                                        event.target.value,
                                        1,
                                      ),
                                      amrap:
                                        current.prescription.kind === "REPS"
                                          ? current.prescription.amrap
                                          : false,
                                    },
                                  }),
                                )
                              }
                            />
                          </Field>
                        </div>
                      )}

                      <Field label={t("setGroup.load")}>
                        <Select
                          value={group.load.kind}
                          disabled={readOnly}
                          onValueChange={(kind: StrengthLoadV1["kind"]) =>
                            updateGroup(
                              exerciseIndex,
                              groupIndex,
                              (current) => ({
                                ...current,
                                load: defaultLoad(kind),
                              }),
                            )
                          }
                        >
                          <SelectTrigger
                            size="default"
                            className={SELECT_TRIGGER_CLASS_NAME}
                            aria-label={t("setGroup.load")}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className={SELECT_CONTENT_CLASS_NAME}>
                            <SelectItem value="OPEN">
                              <OptionText>
                                {t("setGroup.loads.open")}
                              </OptionText>
                            </SelectItem>
                            <SelectItem value="ABSOLUTE">
                              <OptionText>
                                {t("setGroup.loads.absolute")}
                              </OptionText>
                            </SelectItem>
                            <SelectItem value="PERCENT_1RM">
                              <OptionText>
                                {t("setGroup.loads.percent1rm")}
                              </OptionText>
                            </SelectItem>
                            <SelectItem value="BODYWEIGHT">
                              <OptionText>
                                {t("setGroup.loads.bodyweight")}
                              </OptionText>
                            </SelectItem>
                            <SelectItem value="BODYWEIGHT_OFFSET">
                              <OptionText>
                                {t("setGroup.loads.bodyweightOffset")}
                              </OptionText>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>

                      {group.load.kind === "ABSOLUTE" ||
                      group.load.kind === "BODYWEIGHT_OFFSET" ? (
                        <Field label={t("setGroup.loadValue")}>
                          <div className="flex gap-1.5">
                            <Input
                              aria-label={t("setGroup.loadValue")}
                              className={cn(
                                SET_GROUP_FIELD_CLASS_NAME,
                                "min-w-0 tabular-nums",
                              )}
                              size="default"
                              name={`strength.exercises.${exerciseIndex}.groups.${groupIndex}.loadValue`}
                              type="number"
                              min={0}
                              autoComplete="off"
                              value={group.load.value}
                              disabled={readOnly}
                              onChange={(event) =>
                                updateGroup(
                                  exerciseIndex,
                                  groupIndex,
                                  (current) => ({
                                    ...current,
                                    load:
                                      current.load.kind === "ABSOLUTE" ||
                                      current.load.kind === "BODYWEIGHT_OFFSET"
                                        ? {
                                            ...current.load,
                                            value: positiveNumber(
                                              event.target.value,
                                              0,
                                            ),
                                          }
                                        : current.load,
                                  }),
                                )
                              }
                            />
                            <Select
                              value={group.load.unit}
                              disabled={readOnly}
                              onValueChange={(unit: "KG" | "LB") =>
                                updateGroup(
                                  exerciseIndex,
                                  groupIndex,
                                  (current) => ({
                                    ...current,
                                    load:
                                      current.load.kind === "ABSOLUTE" ||
                                      current.load.kind === "BODYWEIGHT_OFFSET"
                                        ? { ...current.load, unit }
                                        : current.load,
                                  }),
                                )
                              }
                            >
                              <SelectTrigger
                                size="default"
                                className={cn(
                                  SELECT_TRIGGER_CLASS_NAME,
                                  "w-[4.75rem] shrink-0",
                                )}
                                aria-label={t("setGroup.loadUnit")}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="KG">kg</SelectItem>
                                <SelectItem value="LB">lb</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </Field>
                      ) : group.load.kind === "PERCENT_1RM" ? (
                        <Field label={t("setGroup.percent1rm")}>
                          <Input
                            aria-label={t("setGroup.percent1rm")}
                            className={cn(
                              SET_GROUP_FIELD_CLASS_NAME,
                              "tabular-nums",
                            )}
                            size="default"
                            name={`strength.exercises.${exerciseIndex}.groups.${groupIndex}.percent1rm`}
                            type="number"
                            min={1}
                            max={100}
                            autoComplete="off"
                            value={group.load.value}
                            disabled={readOnly}
                            onChange={(event) =>
                              updateGroup(
                                exerciseIndex,
                                groupIndex,
                                (current) => ({
                                  ...current,
                                  load: {
                                    kind: "PERCENT_1RM",
                                    value: positiveNumber(
                                      event.target.value,
                                      1,
                                    ),
                                  },
                                }),
                              )
                            }
                          />
                        </Field>
                      ) : null}

                      <Field label={t("setGroup.effort")}>
                        <Select
                          value={group.effort?.kind ?? "NONE"}
                          disabled={readOnly}
                          onValueChange={(kind: "NONE" | "RPE" | "RIR") =>
                            updateGroup(
                              exerciseIndex,
                              groupIndex,
                              (current) => ({
                                ...current,
                                effort:
                                  kind === "NONE"
                                    ? undefined
                                    : { kind, value: 7 },
                              }),
                            )
                          }
                        >
                          <SelectTrigger
                            size="default"
                            className={SELECT_TRIGGER_CLASS_NAME}
                            aria-label={t("setGroup.effort")}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className={SELECT_CONTENT_CLASS_NAME}>
                            <SelectItem value="NONE">
                              <OptionText>
                                {t("setGroup.efforts.none")}
                              </OptionText>
                            </SelectItem>
                            <SelectItem value="RPE">
                              <OptionText>
                                {t("setGroup.efforts.rpe")}
                              </OptionText>
                            </SelectItem>
                            <SelectItem value="RIR">
                              <OptionText>
                                {t("setGroup.efforts.rir")}
                              </OptionText>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>

                      {group.effort ? (
                        <Field label={t("setGroup.effortValue")}>
                          <Input
                            aria-label={t("setGroup.effortValue")}
                            className={cn(
                              SET_GROUP_FIELD_CLASS_NAME,
                              "tabular-nums",
                            )}
                            size="default"
                            name={`strength.exercises.${exerciseIndex}.groups.${groupIndex}.effortValue`}
                            type="number"
                            min={group.effort.kind === "RPE" ? 1 : 0}
                            max={10}
                            step={0.5}
                            autoComplete="off"
                            value={group.effort.value}
                            disabled={readOnly}
                            onChange={(event) =>
                              updateGroup(
                                exerciseIndex,
                                groupIndex,
                                (current) => ({
                                  ...current,
                                  effort: current.effort
                                    ? {
                                        ...current.effort,
                                        value: positiveNumber(
                                          event.target.value,
                                          current.effort.kind === "RPE" ? 1 : 0,
                                        ),
                                      }
                                    : undefined,
                                }),
                              )
                            }
                          />
                        </Field>
                      ) : null}

                      <Field label={t("setGroup.restSeconds")}>
                        <Input
                          aria-label={t("setGroup.restSeconds")}
                          className={cn(
                            SET_GROUP_FIELD_CLASS_NAME,
                            "tabular-nums",
                          )}
                          size="default"
                          name={`strength.exercises.${exerciseIndex}.groups.${groupIndex}.restSeconds`}
                          type="number"
                          min={1}
                          autoComplete="off"
                          value={group.restSeconds ?? ""}
                          disabled={readOnly}
                          onChange={(event) =>
                            updateGroup(
                              exerciseIndex,
                              groupIndex,
                              (current) => ({
                                ...current,
                                restSeconds: optionalNumber(event.target.value),
                              }),
                            )
                          }
                        />
                      </Field>
                    </div>
                  </div>
                );
              })}
            </div>

            {!readOnly ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full border-0 bg-neutral-100 dark:bg-muted/45 pc:border pc:border-dashed pc:bg-background"
                onClick={() =>
                  updateExercise(exerciseIndex, (current) => ({
                    ...current,
                    setGroups: [...current.setGroups, defaultGroup()],
                  }))
                }
              >
                <Plus aria-hidden="true" className="mr-1 h-4 w-4" />
                {t("buttons.addSetGroup")}
              </Button>
            ) : null}
          </section>
        );
      })}

      {!readOnly ? (
        <Button
          type="button"
          variant="outline"
          className="w-full border-0 bg-background pc:border pc:border-dashed"
          onClick={() =>
            onChange({
              ...value,
              exercises: [...value.exercises, defaultExercise()],
            })
          }
        >
          <Plus aria-hidden="true" className="mr-1 h-4 w-4" />
          {t("buttons.addExercise")}
        </Button>
      ) : null}
    </div>
  );
}
