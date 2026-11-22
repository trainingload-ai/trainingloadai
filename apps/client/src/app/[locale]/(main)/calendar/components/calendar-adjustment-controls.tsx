"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  confirmCalendarAdjustment,
  discardCalendarAdjustment,
  getCalendarAdjustment,
  rebaseCalendarAdjustment,
} from "@/api/plans";
import {
  CalendarAdjustmentState,
  type CalendarAdjustment,
} from "@shared/plan-proposal";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ApiFetchError } from "@/lib/api";
import { invalidateAfterPlanMutation } from "@/lib/query-invalidation";
import { usePublishCalendarAdjustment } from "./use-calendar-adjustments";

export function CalendarAdjustmentControls({
  adjustment,
  disabled,
}: {
  adjustment: CalendarAdjustment;
  disabled?: boolean;
}) {
  const t = useTranslations("CalendarMove");
  const queryClient = useQueryClient();
  const publish = usePublishCalendarAdjustment();
  const [dialog, setDialog] = useState<"discard" | "refresh" | null>(null);
  const [requestId, setRequestId] = useState<string>();
  const { id, planId, versionId, state } = adjustment;
  const ready = state === CalendarAdjustmentState.Ready;
  const recoverable =
    state === CalendarAdjustmentState.Stale ||
    state === CalendarAdjustmentState.Expired ||
    state === CalendarAdjustmentState.Invalidated;
  const blocked = new Set(adjustment.conflicts.map(({ key }) => key));
  const validOperations = adjustment.operationKeys.filter(
    (key) => !blocked.has(key),
  );
  const [deselected, setDeselected] = useState<string[]>([]);
  const selected = validOperations.filter((key) => !deselected.includes(key));

  const mutationKey = ["calendar-adjustment-write", planId, id];
  const pending = useIsMutating({ mutationKey }) > 0;
  const mutation = useMutation({
    mutationKey,
    mutationFn: async (action: "confirm" | "discard" | "refresh") => {
      if (action === "confirm") {
        const receipt = await confirmCalendarAdjustment(planId, id, versionId);
        if (!receipt?.readbackVerified || receipt.versionId !== versionId)
          throw new Error("Missing calendar receipt");
        await publish({
          ...adjustment,
          state: CalendarAdjustmentState.Applied,
          receipt,
        });
        await invalidateAfterPlanMutation(queryClient, { planId });
        return;
      }
      const next =
        action === "discard"
          ? await discardCalendarAdjustment(planId, id, versionId)
          : recoverable
            ? await rebaseCalendarAdjustment(planId, id, {
                versionId: requestId ?? crypto.randomUUID(),
                baseVersionId: versionId,
                operationKeys: selected,
              })
            : await getCalendarAdjustment(planId, id);
      if (!next) throw new Error("Missing calendar version");
      await publish(next);
    },
    onSuccess: () => setDialog(null),
    onError: async (error, action) => {
      if (action !== "confirm") return;
      if (error instanceof ApiFetchError && [409, 422].includes(error.status)) {
        setDialog("refresh");
        const current = await getCalendarAdjustment(planId, id).catch(
          () => undefined,
        );
        if (current) await publish(current);
        return;
      }
      const submitted = await getCalendarAdjustment(
        planId,
        id,
        versionId,
      ).catch(() => undefined);
      if (
        submitted?.state === CalendarAdjustmentState.Applied &&
        submitted.receipt
      ) {
        await publish(submitted);
        await invalidateAfterPlanMutation(queryClient, { planId });
      } else {
        toast.error(t("batchFailed"));
      }
    },
  });
  const terminal =
    state === CalendarAdjustmentState.Applied ||
    state === CalendarAdjustmentState.Discarded;
  if (terminal) return null;
  const open = (next: typeof dialog) => {
    mutation.reset();
    setRequestId(crypto.randomUUID());
    setDeselected([]);
    setDialog(next);
  };
  const labels = new Map(
    adjustment.presentation.rows.map((row) => [
      row.candidateKey ? `candidate:${row.candidateKey}` : row.workoutId,
      row.name,
    ]),
  );
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled || pending}
        onClick={() => open("discard")}
      >
        {t("cancel")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={ready ? "default" : "secondary"}
        disabled={disabled || pending}
        onClick={() => {
          if (ready) mutation.mutate("confirm");
          else open("refresh");
        }}
      >
        {!ready && <RefreshCw aria-hidden="true" />}
        {t(
          mutation.isPending
            ? "working"
            : ready
              ? "confirmAdjustment"
              : "recovery.action",
        )}
      </Button>
      {mutation.isError && !dialog ? (
        <span role="alert" className="sr-only">
          {t("batchFailed")}
        </span>
      ) : null}
      <AlertDialog
        open={dialog !== null}
        onOpenChange={(value) => {
          if (!value && !mutation.isPending) setDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                dialog === "discard"
                  ? "adjustmentDiscardTitle"
                  : "batchReloadTitle",
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                dialog === "discard"
                  ? "adjustmentDiscardDescription"
                  : "batchConflict",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {dialog === "refresh" && recoverable && (
            <div className="max-h-56 space-y-2 overflow-y-auto text-sm">
              {adjustment.conflicts.map(({ key, reason }) => (
                <p key={key} className="text-muted-foreground">
                  {labels.get(key) ?? key} ·{" "}
                  {t.has(`adjustmentConflicts.${reason}`)
                    ? t(`adjustmentConflicts.${reason}`)
                    : t("batchConflict")}
                </p>
              ))}
              {adjustment.conflicts.length > 0 &&
                validOperations.map((key) => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.includes(key)}
                      disabled={mutation.isPending}
                      onChange={(event) =>
                        setDeselected((current) =>
                          event.target.checked
                            ? current.filter((item) => item !== key)
                            : [...current, key],
                        )
                      }
                    />
                    {labels.get(key) ?? key}
                  </label>
                ))}
            </div>
          )}
          {mutation.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {t("batchFailed")}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              {t("continueEditing")}
            </AlertDialogCancel>
            <Button
              type="button"
              disabled={
                mutation.isPending ||
                (dialog === "refresh" && recoverable && !selected.length)
              }
              onClick={() =>
                mutation.mutate(dialog === "discard" ? "discard" : "refresh")
              }
            >
              {t(
                mutation.isPending
                  ? "working"
                  : dialog === "discard"
                    ? "discardAdjustment"
                    : "recovery.action",
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
