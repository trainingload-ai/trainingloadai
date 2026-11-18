"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { addCalendarDays, isCalendarDate } from "@shared/plan-calendar";
import { getPlanWindowSnapshot, type TrainingPlanDetail } from "@/api/plans";
import { generatedPlanThrough } from "@/lib/rolling-plan";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function RollingPlanWindowExport({
  plan,
}: {
  plan: TrainingPlanDetail;
}) {
  const t = useTranslations("RollingPlan");
  const id = useId();
  const first =
    [...(plan.generationCoverage?.intervals ?? [])].sort((a, b) =>
      a.from.localeCompare(b.from),
    )[0]?.from ?? "";
  const latest = generatedPlanThrough(plan) ?? "";
  const [selectedFrom, setFrom] = useState<string>();
  const from = selectedFrom ?? first;
  const [selectedThrough, setThrough] = useState<string>();
  const through =
    selectedThrough ??
    (first && latest
      ? latest < addCalendarDays(first, 92)
        ? latest
        : addCalendarDays(first, 92)
      : "");
  const [pending, setPending] = useState(false);
  const valid =
    isCalendarDate(from) &&
    isCalendarDate(through) &&
    through >= from &&
    through <= addCalendarDays(from, 92);
  const exportWindow = async () => {
    if (!valid || pending) return;
    setPending(true);
    try {
      const snapshot = await getPlanWindowSnapshot(plan.id, from, through);
      if (
        !snapshot ||
        snapshot.payloadVersion !== "plan-window-v2" ||
        snapshot.snapshotOnly !== true
      )
        throw new Error("Invalid window snapshot");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(snapshot, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `training-plan-${from}-${through}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error(t("exportFailed"));
    } finally {
      setPending(false);
    }
  };
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void exportWindow();
      }}
    >
      <p className="text-mobile-caption pc:text-xs text-muted-foreground">
        {t("snapshotHint")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`${id}-from`}>{t("windowFrom")}</Label>
          <Input
            id={`${id}-from`}
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            required
          />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`${id}-through`}>{t("windowThrough")}</Label>
          <Input
            id={`${id}-through`}
            type="date"
            value={through}
            min={from}
            max={isCalendarDate(from) ? addCalendarDays(from, 92) : undefined}
            onChange={(event) => setThrough(event.target.value)}
            required
          />
        </div>
      </div>
      <Button
        type="submit"
        variant="outline"
        size="sm"
        className="w-full"
        disabled={!valid || pending}
      >
        {t(pending ? "exporting" : "exportWindow")}
      </Button>
    </form>
  );
}
