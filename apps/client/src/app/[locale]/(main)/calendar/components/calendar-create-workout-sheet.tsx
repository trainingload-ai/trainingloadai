"use client";

import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  createIndependentWorkout,
  createPlanWorkout,
  type CreateScheduledWorkoutDto,
} from "@/api/plans";
import {
  WorkoutEditorSheet,
  type WorkoutEditorPayload,
} from "@/components/plan/WorkoutEditorSheet";
import { queryKeys } from "@/lib/query-keys";
import { invalidateActivePlanAndPlanDetails } from "@/lib/query-invalidation";
import { cn } from "@/lib/utils";

type CreateScope = "inPlan" | "independent";

export function CalendarCreateWorkoutSheet({
  open,
  onOpenChange,
  scheduledDate,
  activePlanId,
  defaultScope = "inPlan",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduledDate: string;
  activePlanId?: string | null;
  defaultScope?: CreateScope;
}) {
  const t = useTranslations("CalendarExperience.createWorkout");
  const queryClient = useQueryClient();
  const [scope, setScope] = React.useState<CreateScope>(defaultScope);

  React.useEffect(() => {
    if (!open) return;
    setScope(defaultScope);
  }, [defaultScope, open]);

  const mutation = useMutation({
    mutationFn: async (dto: CreateScheduledWorkoutDto) => {
      if (scope === "inPlan") {
        if (!activePlanId) {
          throw new Error(t("missingActivePlan"));
        }
        return createPlanWorkout(activePlanId, dto);
      }
      return createIndependentWorkout(dto);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.plans.active() }),
        queryClient.invalidateQueries({
          queryKey: ["scheduled-workouts"],
        }),
        invalidateActivePlanAndPlanDetails(queryClient),
      ]);
      toast.success(t("success"));
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || t("failed"));
    },
  });

  const canCreateInPlan = Boolean(activePlanId);

  const handleSave = async (payload: WorkoutEditorPayload) => {
    await mutation.mutateAsync({
      scheduledDate,
      sportType: payload.sportType,
      sportDefinitionCode: payload.sportDefinitionCode,
      text: payload.text,
      notes: payload.notes || null,
      name: payload.name ?? null,
      blocks: payload.blocks,
      definition: payload.definition,
    });
  };

  const scopeToggle = (
    <div className="grid gap-2 pc:grid-cols-[minmax(200px,260px)_minmax(0,1fr)] pc:items-center">
      <div
        className="grid grid-cols-2 rounded-lg bg-muted/70 p-1"
        role="group"
        aria-label={t("title")}
      >
        {(
          [
            {
              value: "inPlan",
              label: t("scopeInPlan"),
              disabled: !canCreateInPlan,
            },
            {
              value: "independent",
              label: t("scopeIndependent"),
              disabled: false,
            },
          ] as const
        ).map((option) => {
          const selected = scope === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              disabled={option.disabled}
              onClick={() => setScope(option.value)}
              className={cn(
                "h-9 min-w-0 rounded-md px-3 text-mobile-caption font-medium transition-colors pc:h-8 pc:px-2.5 pc:text-xs",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                selected
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
                option.disabled && "cursor-not-allowed opacity-45",
              )}
            >
              <span className="block truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
      <span className="truncate text-mobile-caption text-muted-foreground pc:text-right pc:text-xs">
        {t("dateLabel", { date: scheduledDate })}
      </span>
    </div>
  );

  return (
    <WorkoutEditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      resetKey={`${scheduledDate}-${scope}-${defaultScope}`}
      initialValue={{
        text: "work 45m",
        notes: "",
        sportType: "RUN",
        sportDefinitionCode: "ROAD_RUNNING",
        blocks: null,
        name: "",
      }}
      headerExtra={scopeToggle}
      showNameField
      onSave={handleSave}
      saveLabel={mutation.isPending ? t("creating") : t("create")}
    />
  );
}
