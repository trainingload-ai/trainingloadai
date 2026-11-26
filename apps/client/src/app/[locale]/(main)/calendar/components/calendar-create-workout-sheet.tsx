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
import { invalidateAfterPlanMutation } from "@/lib/query-invalidation";
import { cn } from "@/lib/utils";

type CreateScope = "inPlan" | "independent";

function newCreationKey() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

export function CalendarCreateWorkoutSheet({
  open,
  inline = false,
  onOpenChange,
  scheduledDate,
  activePlanId,
  defaultScope = "inPlan",
}: {
  open: boolean;
  inline?: boolean;
  onOpenChange: (open: boolean) => void;
  scheduledDate: string;
  activePlanId?: string | null;
  defaultScope?: CreateScope;
}) {
  const t = useTranslations("CalendarExperience.createWorkout");
  const queryClient = useQueryClient();
  const [scope, setScope] = React.useState<CreateScope>(defaultScope);
  const creationKey = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    if (!open) return;
    creationKey.current = undefined;
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
      creationKey.current ??= newCreationKey();
      return createIndependentWorkout({ ...dto, idempotencyKey: creationKey.current });
    },
    onSuccess: async () => {
      await invalidateAfterPlanMutation(queryClient, { planId: activePlanId ?? undefined });
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
      inline={inline}
      onOpenChange={onOpenChange}
      title={t("title")}
      resetKey={scheduledDate}
      headerExtra={scopeToggle}
      showNameField
      onSave={handleSave}
      saveLabel={mutation.isPending ? t("creating") : t("create")}
    />
  );
}
