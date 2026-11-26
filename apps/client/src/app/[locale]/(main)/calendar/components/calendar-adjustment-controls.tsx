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
  calendarAdjustmentRecoveryKeys,
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
import { CalendarScheduleReloadOverlay } from "./calendar-schedule-reload-overlay";

function adjustmentLabels(adjustment: CalendarAdjustment) {
  return new Map(adjustment.presentation.rows.map((row) => [
    row.candidateKey ? `candidate:${row.candidateKey}` : row.workoutId,
    row.name,
  ]));
}

export function CalendarAdjustmentUnavailableNotice({
  adjustment,
  className = "space-y-1 rounded-md bg-muted/60 px-3 py-2 text-sm",
  onViewSchedule,
}: {
  adjustment: CalendarAdjustment;
  className?: string;
  onViewSchedule?: () => void;
}) {
  const t = useTranslations("CalendarMove");
  const tw = useTranslations("AiCoachPage.workspace");
  const labels = adjustmentLabels(adjustment);

  return (
    <div className={className}>
      <p>{t("adjustmentUnavailable")}</p>
      {adjustment.conflicts.length ? (
        <ul className="max-h-24 space-y-1 overflow-y-auto text-muted-foreground">
          {adjustment.conflicts.map(({ key, reason }) => (
            <li key={key}>
              {[labels.get(key), t.has(`adjustmentConflicts.${reason}`)
                ? t(`adjustmentConflicts.${reason}`)
                : t("recovery.scheduleChanged")].filter(Boolean).join(" · ")}
            </li>
          ))}
        </ul>
      ) : null}
      {onViewSchedule && (
        <Button type="button" size="sm" variant="secondary" onClick={onViewSchedule}>
          {tw("openCalendar")}
        </Button>
      )}
    </div>
  );
}

export function CalendarAdjustmentRecoveryOverlay({
  adjustment,
  reloadSchedule,
  onReloaded,
}: {
  adjustment: CalendarAdjustment;
  reloadSchedule: () => Promise<unknown>;
  onReloaded: () => void;
}) {
  const t = useTranslations("CalendarMove");
  const publish = usePublishCalendarAdjustment();
  const [deselected, setDeselected] = useState<string[]>([]);
  const [versionId, setVersionId] = useState(() => crypto.randomUUID());
  const recoverable = calendarAdjustmentRecoveryKeys(adjustment) ?? [];
  const selected = recoverable.filter((key) => !deselected.includes(key));
  const labels = adjustmentLabels(adjustment);
  const load = async () => {
    await reloadSchedule();
    try {
      const next = await rebaseCalendarAdjustment(adjustment.planId, adjustment.id, {
        versionId,
        baseVersionId: adjustment.versionId,
        operationKeys: selected,
      });
      if (!next) throw new Error("Missing refreshed calendar adjustment");
      await publish(next);
    } catch (error) {
      if (error instanceof ApiFetchError && [409, 422].includes(error.status)) {
        const current = await getCalendarAdjustment(adjustment.planId, adjustment.id).catch(() => undefined);
        if (current) await publish(current);
      }
      throw error;
    }
  };

  return (
    <CalendarScheduleReloadOverlay
      title={t(`adjustmentStates.${adjustment.state}`)}
      retryDraft
      disabled={!selected.length}
      onReload={load}
      onReloaded={onReloaded}
    >
      <p>{t(adjustment.state === CalendarAdjustmentState.Expired ? "recovery.expired" : "batchConflict")}</p>
      {adjustment.conflicts.length > 0 && (
        <div className="max-h-36 space-y-2 overflow-y-auto">
          <ul className="space-y-1">
            {adjustment.conflicts.map(({ key, reason }) => (
              <li key={key}>
                {[labels.get(key), t.has(`adjustmentConflicts.${reason}`)
                  ? t(`adjustmentConflicts.${reason}`)
                  : t("recovery.scheduleChanged")].filter(Boolean).join(" · ")}
              </li>
            ))}
          </ul>
          {recoverable.map((key) => (
            <label key={key} className="flex items-center gap-2 text-foreground">
              <input
                type="checkbox"
                checked={selected.includes(key)}
                onChange={(event) => {
                  setVersionId(crypto.randomUUID());
                  setDeselected((current) => event.target.checked
                    ? current.filter((value) => value !== key)
                    : [...current, key]);
                }}
              />
              {labels.get(key) ?? key}
            </label>
          ))}
        </div>
      )}
    </CalendarScheduleReloadOverlay>
  );
}

export function CalendarAdjustmentControls({
  adjustment,
  disabled,
  onOpenRecovery,
}: {
  adjustment: CalendarAdjustment;
  disabled?: boolean;
  onOpenRecovery?: (state: CalendarAdjustmentState) => void;
}) {
  const t = useTranslations("CalendarMove");
  const queryClient = useQueryClient();
  const publish = usePublishCalendarAdjustment();
  const [dialog, setDialog] = useState<"discard" | "refresh" | null>(null);
  const [requestId, setRequestId] = useState<string>();
  const { id, planId, versionId, state } = adjustment;
  const ready = state === CalendarAdjustmentState.Ready;
  const recoveryKeys = calendarAdjustmentRecoveryKeys(adjustment);
  const validOperations = recoveryKeys ?? [];
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
          : recoveryKeys
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
      if (action !== "discard" && error instanceof ApiFetchError && [409, 422].includes(error.status)) {
        const current = await getCalendarAdjustment(planId, id).catch(
          () => undefined,
        );
        if (current) {
          await publish(current);
          if (current.state === CalendarAdjustmentState.Applied) {
            await invalidateAfterPlanMutation(queryClient, { planId });
          }
          const keys = calendarAdjustmentRecoveryKeys(current);
          if (current.state === CalendarAdjustmentState.Ready || keys?.length) {
            if (onOpenRecovery) onOpenRecovery(current.state);
            else setDialog("refresh");
          } else {
            if (keys?.length === 0) onOpenRecovery?.(current.state);
            setDialog(null);
          }
        } else if (action === "confirm") {
          if (onOpenRecovery) onOpenRecovery(CalendarAdjustmentState.Ready);
          else toast.error(t("recovery.failed"));
        }
        return;
      }
      if (action !== "confirm") return;
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
        if (onOpenRecovery) onOpenRecovery(CalendarAdjustmentState.Ready);
        else toast.error(t("batchFailed"));
      }
    },
  });
  const terminal =
    state === CalendarAdjustmentState.Applied ||
    state === CalendarAdjustmentState.Discarded;
  if (terminal || recoveryKeys?.length === 0) return null;
  const open = (next: typeof dialog) => {
    mutation.reset();
    setRequestId(crypto.randomUUID());
    setDeselected([]);
    setDialog(next);
  };
  const labels = adjustmentLabels(adjustment);
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
          else if (onOpenRecovery) onOpenRecovery(state);
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
          {dialog === "refresh" && recoveryKeys && (
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
                (dialog === "refresh" && Boolean(recoveryKeys) && !selected.length)
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
