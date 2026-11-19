"use client";

import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createPlan } from "@/api/plans";
import { invalidateAfterPlanMutation } from "@/lib/query-invalidation";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
} from "@/components/ui/adaptive-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PlanStartConversationDialog } from "./plan-start-conversation-dialog";

export function RollingPlanCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("RollingPlan");
  const id = useId();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [planId, setPlanId] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      const plan = await createPlan({
        title: title.trim(),
        goal: goal.trim(),
        sourceType: "AI",
        planningMode: "ROLLING",
        periodWeeks: null,
        workouts: [],
      });
      if (!plan) throw new Error("Empty plan response");
      return plan;
    },
    onSuccess: (plan) => {
      void invalidateAfterPlanMutation(qc, { planId: plan.id });
      onOpenChange(false);
      setPlanId(plan.id);
      toast.success(t("created"));
    },
    onError: () => toast.error(t("failed")),
  });
  return (
    <>
      <AdaptiveDialog open={open} onOpenChange={onOpenChange}>
        <AdaptiveDialogContent>
          <AdaptiveDialogHeader>
            <AdaptiveDialogTitle>{t("title")}</AdaptiveDialogTitle>
            <AdaptiveDialogDescription>
              {t("description")}
            </AdaptiveDialogDescription>
          </AdaptiveDialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!mutation.isPending && title.trim() && goal.trim())
                mutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor={`${id}-title`}>{t("titleLabel")}</Label>
              <Input
                id={`${id}-title`}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-goal`}>{t("goalLabel")}</Label>
              <Input
                id={`${id}-goal`}
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                required
                maxLength={2000}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={mutation.isPending || !title.trim() || !goal.trim()}
            >
              {t(mutation.isPending ? "creating" : "create")}
            </Button>
          </form>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
      <PlanStartConversationDialog
        open={Boolean(planId)}
        planId={planId}
        onOpenChange={(next) => {
          if (!next) setPlanId(null);
        }}
      />
    </>
  );
}
