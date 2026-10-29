"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  getPlanGlobalSessionOrdinalDisplay,
  getWorkoutAt,
  usePlanStore,
} from "@/lib/plan-store";
import {
  WorkoutEditorSheet,
  type WorkoutEditorPayload,
} from "@/components/plan/WorkoutEditorSheet";

interface EditWorkoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekIndex: number;
  dayIndex: number;
  sessionIndex?: number;
  readOnly?: boolean;
  initialKind?: "ENDURANCE" | "STRENGTH";
  mobilePlanLayout?: boolean;
}

export const EditWorkoutDialog: React.FC<EditWorkoutDialogProps> = ({
  open,
  onOpenChange,
  weekIndex,
  dayIndex,
  sessionIndex = 1,
  readOnly = false,
  initialKind,
  mobilePlanLayout = false,
}) => {
  const t = useTranslations("WorkoutEditor");
  const tWd = useTranslations("PlanCreatePage.weekdays");
  const WEEKDAY_KEYS = [
    "sun",
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
  ] as const;
  const current = usePlanStore((s) => s.current);
  const setWorkout = usePlanStore((s) => s.setWorkout);
  const deleteWorkout = usePlanStore((s) => s.deleteWorkout);
  const workout = React.useMemo(
    () => getWorkoutAt(current, weekIndex, dayIndex, sessionIndex),
    [current, weekIndex, dayIndex, sessionIndex],
  );

  const weekdayLabel = tWd(WEEKDAY_KEYS[dayIndex] ?? "sun");
  const globalSessionOrdinal = React.useMemo(
    () =>
      getPlanGlobalSessionOrdinalDisplay(
        current,
        weekIndex,
        dayIndex,
        sessionIndex,
      ),
    [current, weekIndex, dayIndex, sessionIndex],
  );

  const title = `${readOnly ? t("title.view") : t("title.edit")} · ${t("title.weekLabel", { week: weekIndex + 1 })} · ${weekdayLabel} · ${t("title.sessionLabel", { session: globalSessionOrdinal })}`;
  const isNewWorkout = !workout.id && !workout.text.trim();
  const mobileTitle = readOnly
    ? t("title.view")
    : isNewWorkout
      ? t("mobile.addWorkout")
      : t("title.edit");
  const mobileScheduleLabel = `${t("title.weekLabel", { week: weekIndex + 1 })} · ${weekdayLabel} · ${t("title.sessionLabel", { session: sessionIndex })}`;

  const handleSave = async (payload: WorkoutEditorPayload) => {
    await setWorkout(
      weekIndex,
      dayIndex,
      {
        text: payload.text,
        notes: payload.notes,
        name: payload.name ?? "",
        sportType: payload.sportType,
        sportDefinitionCode: payload.sportDefinitionCode,
        blocks: payload.blocks,
        structureKind: payload.structureKind,
        structure: payload.structure,
        summary: payload.summary,
        definition: payload.definition,
      },
      sessionIndex,
    );
  };

  const handleDelete = async () => {
    await deleteWorkout(weekIndex, dayIndex, sessionIndex);
  };

  return (
    <WorkoutEditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      mobileTitle={mobileTitle}
      mobileScheduleLabel={mobileScheduleLabel}
      mobilePlanLayout={mobilePlanLayout}
      readOnly={readOnly}
      resetKey={`${weekIndex}-${dayIndex}-${sessionIndex}-${workout.text}`}
      initialValue={{
        text: workout.text || "",
        notes: workout.notes || "",
        name: workout.name || "",
        sportType:
          isNewWorkout && initialKind === "STRENGTH"
            ? "UNKNOWN"
            : workout.sportType || "RUN",
        sportDefinitionCode:
          isNewWorkout && initialKind === "STRENGTH"
            ? "STRENGTH_TRAINING"
            : workout.sportDefinitionCode,
        blocks: workout.blocks || null,
        structureKind:
          isNewWorkout && initialKind ? initialKind : workout.structureKind,
        structure: workout.structure,
        summary: workout.summary,
      }}
      onSave={handleSave}
      saveLabel={t("buttons.saveDraft")}
      showDelete
      canDelete={Boolean(workout.id || workout.text.trim())}
      onDelete={handleDelete}
    />
  );
};
