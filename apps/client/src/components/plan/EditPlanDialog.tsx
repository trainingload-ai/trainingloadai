"use client";

import { useGuestAccessText } from "@deployment/managed-ui";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EditWorkoutDialog } from "@/components/plan/EditWorkoutDialog";
import { ManualPlanWeekGrid } from "@/components/plan/manual-plan-week-grid";
import { usePlanStore } from "@/lib/plan-store";
import {
  useCreatePlanFromDraft,
  useUpdatePlanFromDraft,
} from "@/api/usePlanMutations";
import { PlanDescriptionRender } from "../tiptap/rich-text-editor";
import { useTranslations } from "next-intl";
import { CoachPlanDraftCalendarPreview } from "@/app/[locale]/(main)/ai-coach/coach-plan-draft-calendar-preview";
import { planCurrentToCoachPlanDraft } from "@/lib/coach-plan-draft";
import { cn } from "@/lib/utils";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

interface EditPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly?: boolean;
  allowSwitchToEdit?: boolean;
}

export const EditPlanDialog: React.FC<EditPlanDialogProps> = ({
  open,
  onOpenChange,
  readOnly = false,
  allowSwitchToEdit = false,
}) => {
  const t = useTranslations("PlanEditor");
  const publicDemo = usePublicDemo();
  const demoText = useGuestAccessText();
  const effectiveReadOnly = readOnly || publicDemo.active;
  const current = usePlanStore((s) => s.current);
  const sourcePlanId = usePlanStore((s) => s.sourcePlanId);
  const [workoutOpen, setWorkoutOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<{
    week: number;
    day: number;
    sessionIndex: number;
  } | null>(null);
  const { mutateAsync: createAsync, isPending: isCreating } =
    useCreatePlanFromDraft();
  const { mutateAsync: updateAsync, isPending: isUpdating } =
    useUpdatePlanFromDraft();
  const isPending = isCreating || isUpdating;
  const isExistingPlan = sourcePlanId !== undefined;
  const [mode, setMode] = useState<"view" | "edit">(
    effectiveReadOnly ? "view" : "edit",
  );
  React.useEffect(() => {
    // Sync initial mode when passed readOnly externally or dialog reopens
    if (open) {
      setMode(effectiveReadOnly ? "view" : "edit");
    }
  }, [effectiveReadOnly, open]);

  const viewDraft = React.useMemo(
    () =>
      current && mode === "view" ? planCurrentToCoachPlanDraft(current) : null,
    [current, mode],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            mode === "view"
              ? "flex max-h-[min(92vh,900px)] w-[min(100vw-1rem,1200px)] max-w-[min(100vw-1rem,1200px)] flex-col gap-0 overflow-hidden p-4 sm:max-w-[min(100vw-1rem,1200px)] sm:p-6"
              : "w-[100vw] md:w-[80vw] max-w-none sm:max-w-none max-h-[85vh] overflow-hidden",
          )}
        >
          <DialogHeader
            className={mode === "view" ? "shrink-0 space-y-2 pb-2" : undefined}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DialogTitle
                className={mode === "view" ? "text-base" : undefined}
              >
                {mode === "view"
                  ? t("title.view")
                  : current?.title
                    ? `${t("title.edit")}: ${current.title}`
                    : t("title.edit")}
              </DialogTitle>
              {mode === "view" && allowSwitchToEdit && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={publicDemo.active}
                  title={
                    publicDemo.active ? demoText("readOnlyAction") : undefined
                  }
                  onClick={() => setMode("edit")}
                >
                  {t("buttons.edit")}
                </Button>
              )}
            </div>
          </DialogHeader>

          {mode === "view" && viewDraft ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <CoachPlanDraftCalendarPreview
                draft={viewDraft}
                variant="dialog"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="max-h-[28vh] overflow-auto text-sm text-muted-foreground">
                <PlanDescriptionRender
                  value={current?.description}
                  disabled={true}
                />
              </div>
              <ManualPlanWeekGrid
                scrollAreaClassName="max-h-[30vh]"
                onAddSession={(w, d, sessionIndex) => {
                  setEditingCell({ week: w, day: d, sessionIndex });
                  setWorkoutOpen(true);
                }}
                onEditSession={(w, d, sessionIndex) => {
                  setEditingCell({ week: w, day: d, sessionIndex });
                  setWorkoutOpen(true);
                }}
              />
            </div>
          )}

          <div
            className={cn(
              "flex justify-end gap-2 pt-2",
              mode === "view" && "shrink-0 border-t border-border/50 pt-3",
            )}
          >
            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("buttons.close")}
            </Button>
            {mode === "edit" && (
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    if (isExistingPlan) {
                      await updateAsync();
                    } else {
                      await createAsync();
                    }
                    onOpenChange(false);
                  } catch (error) {
                    console.error("Failed to save plan", error);
                  }
                }}
                disabled={isPending || publicDemo.active}
                title={
                  publicDemo.active ? demoText("readOnlyAction") : undefined
                }
              >
                {isPending ? t("buttons.saving") : t("buttons.save")}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {editingCell && mode === "edit" && (
        <EditWorkoutDialog
          open={workoutOpen}
          onOpenChange={(o) => {
            setWorkoutOpen(o);
            if (!o) setEditingCell(null);
          }}
          weekIndex={editingCell.week}
          dayIndex={editingCell.day}
          sessionIndex={editingCell.sessionIndex}
          readOnly={false}
        />
      )}
    </>
  );
};
