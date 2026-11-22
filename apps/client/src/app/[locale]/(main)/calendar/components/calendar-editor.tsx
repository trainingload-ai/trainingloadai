"use client";

import {
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
  type ReactNode,
} from "react";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { saveCalendarAdjustment, type PlanWorkout } from "@/api/plans";
import {
  CalendarAdjustmentState,
  type PlanProposalPresentation,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarMoveWeekComparison } from "./calendar-move-week-comparison";
import type { WorkoutEditorPayload } from "@/components/plan/WorkoutEditorSheet";
import { ApiFetchError } from "@/lib/api";
import { CalendarMovePreviewCalendar } from "./calendar-move-preview-calendar";
import { canMoveCalendarWorkout } from "./calendar-move-model";
import {
  useCalendarAdjustment,
  usePublishCalendarAdjustment,
} from "./use-calendar-adjustments";
import { CalendarAdjustmentControls } from "./calendar-adjustment-controls";
import {
  calendarDraftEdits,
  refreshCalendarEditDraft,
  type CalendarDraftEntry,
  type CalendarEditDraft,
} from "./calendar-edit-draft";

export function CalendarEditor({
  planId,
  initialDate,
  presentation: originalPresentation,
  adjustmentId,
  draft,
  onDraftChange,
  legacyActions,
  closeRef,
  onClose,
  showInitialControls,
  instanceId,
}: {
  planId: string;
  initialDate: string;
  presentation?: PlanProposalPresentation;
  adjustmentId?: string;
  draft: CalendarEditDraft | null;
  onDraftChange: (
    update: (current: CalendarEditDraft | null) => CalendarEditDraft | null,
  ) => void;
  legacyActions?: ReactNode;
  closeRef?: Ref<() => void>;
  onClose?: () => void;
  showInitialControls?: boolean;
  instanceId?: string;
}) {
  const t = useTranslations("CalendarMove");
  const tEditor = useTranslations("WorkoutEditor.buttons");
  const queryClient = useQueryClient();
  const editorKey = ["published-calendar-edit", planId, instanceId] as const;
  const [savedId, setSavedId] = useState<string | undefined>(() =>
    instanceId ? queryClient.getQueryData(editorKey) : undefined,
  );
  const versionedId = adjustmentId ?? savedId;
  const adjustmentQuery = useCalendarAdjustment(planId, versionedId);
  const versioned = adjustmentQuery.data;
  const showAdjustmentControls = Boolean(
    versioned &&
    (showInitialControls ||
      versioned.isVersioned ||
      versioned.state !== CalendarAdjustmentState.Ready),
  );
  const publish = usePublishCalendarAdjustment();
  const base =
    versioned?.state === CalendarAdjustmentState.Ready ? versioned : undefined;
  const ready =
    !versionedId ||
    Boolean(base) ||
    (!adjustmentId &&
      Boolean(versioned && ["APPLIED", "DISCARDED"].includes(versioned.state)));
  const showLegacy = Boolean(
    adjustmentId && adjustmentQuery.isError && originalPresentation,
  );
  const container = useRef<HTMLDivElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const [reloadPrompt, setReloadPrompt] = useState<
    "closed" | "open" | "loading" | "failed"
  >("closed");
  const [confirmClose, setConfirmClose] = useState(false);
  const mutationKey = ["calendar-edits", planId, versionedId];
  const editing = useIsMutating({ mutationKey });
  const submitting = useIsMutating({
    mutationKey: ["calendar-adjustment-write", planId, versionedId],
  });
  const pending = editing + submitting > 0;
  const mutation = useMutation({
    mutationKey,
    mutationFn: async ({
      value,
      base,
    }: {
      value: CalendarEditDraft;
      base: typeof versioned;
      saveOnly?: boolean;
    }) => {
      const id = base?.id ?? value.batchId;
      const saved = await saveCalendarAdjustment(planId, id, {
        versionId: value.batchId,
        baseVersionId: value.baseVersionId ?? base?.versionId,
        edits: calendarDraftEdits(value),
      });
      if (!saved || saved.versionId !== value.batchId)
        throw new Error("Missing saved calendar adjustment");
      await publish(saved);
      return saved;
    },
    onSuccess: (saved, { value, saveOnly }) => {
      setSavedId(saved.id);
      if (instanceId && !adjustmentId)
        queryClient.setQueryData(editorKey, saved.id);
      if (saveOnly) {
        setConfirmClose(false);
        onClose?.();
      }
      onDraftChange((current) =>
        current?.batchId === value.batchId ? null : current,
      );
      restoreFocus();
    },
    onError: (error) => {
      if (error instanceof ApiFetchError && [409, 422].includes(error.status)) {
        setReloadPrompt("open");
      } else {
        toast.error(t("batchFailed"));
      }
    },
  });
  const restoreFocus = () =>
    container.current
      ?.querySelector<HTMLElement>("[data-calendar-proposal]")
      ?.focus({ preventScroll: true });
  const loadLatestSchedule = async (
    reloadSchedule: () => Promise<Map<string, PlanWorkout>>,
  ) => {
    setReloadPrompt("loading");
    try {
      const workouts = await reloadSchedule();
      const next = versionedId
        ? (await adjustmentQuery.refetch({ throwOnError: true })).data
        : undefined;
      const batchId = crypto.randomUUID();
      onDraftChange(
        (current) =>
          current &&
          refreshCalendarEditDraft(
            current,
            workouts,
            batchId,
            next?.state === CalendarAdjustmentState.Ready
              ? next.versionId
              : current.baseVersionId,
          ),
      );
      mutation.reset();
      setReloadPrompt("closed");
    } catch {
      setReloadPrompt("failed");
    }
  };
  const canEdit = (workout: PlanWorkout) =>
    ready &&
    !pending &&
    !workout.id.startsWith("original:") &&
    canMoveCalendarWorkout(workout);
  const change = (
    id: string,
    update: (
      current: CalendarDraftEntry | undefined,
    ) => CalendarDraftEntry | undefined,
  ) => {
    const batchId = crypto.randomUUID();
    mutation.reset();
    onDraftChange((current) => {
      const entries = { ...current?.entries };
      const entry = update(entries[id]);
      if (entry) entries[id] = entry;
      else delete entries[id];
      return Object.keys(entries).length
        ? {
            batchId,
            entries,
            baseVersionId: current?.baseVersionId ?? base?.versionId,
          }
        : null;
    });
  };
  const updateWorkout = (
    workout: PlanWorkout,
    scheduledDate: string,
    payload?: WorkoutEditorPayload,
  ) =>
    change(workout.id, (current) => {
      const after = { ...workout, ...payload, scheduledDate };
      if (current?.kind === "ADD")
        return { ...current, after, payload: payload ?? current.payload };
      const before = current?.before ?? workout;
      const nextPayload =
        payload ?? (current?.kind === "UPDATE" ? current.payload : undefined);
      if (before.scheduledDate === scheduledDate && !nextPayload)
        return undefined;
      return { kind: "UPDATE", before, after, payload: nextPayload };
    });
  useImperativeHandle(
    closeRef,
    () => () => {
      if (pending) return;
      if (draft) setConfirmClose(true);
      else onClose?.();
    },
    [draft, onClose, pending],
  );
  const presentation =
    base?.presentation ??
    (showLegacy || !versionedId ? originalPresentation : null) ??
    null;
  return (
    <div ref={container} className="flex h-full min-h-0 flex-col">
      {base?.presentation.calendarAdjustmentWeeks?.length ? (
        <div className="flex shrink-0 justify-end">
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="sm">
                {t("weeklyImpact")}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="max-h-[55dvh] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto"
            >
              <CalendarMoveWeekComparison
                batchWeeks={base.presentation.calendarAdjustmentWeeks}
              />
            </PopoverContent>
          </Popover>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <CalendarMovePreviewCalendar
          initialDate={initialDate}
          instanceId={adjustmentId ?? instanceId}
          planId={planId}
          presentation={presentation}
          canEdit={canEdit}
          onEdit={async (workout, payload) => {
            if (canEdit(workout))
              updateWorkout(workout, workout.scheduledDate!, payload);
          }}
          draft={{
            value: draft,
            disabled: pending || !ready,
            move: updateWorkout,
            add: (scheduledDate, payload) => {
              const id = crypto.randomUUID();
              change(id, () => ({
                kind: "ADD",
                payload,
                after: {
                  id,
                  planId,
                  revision: 0,
                  scheduledDate,
                  dayOffset: 0,
                  weekIndex: 1,
                  dayIndex: 1,
                  sessionIndex: 1,
                  status: "PLANNED",
                  dslVersion: 1,
                  ...payload,
                },
              }));
            },
            remove: (workout) => {
              if (canEdit(workout) && workout.capabilities?.delete !== false)
                change(workout.id, (current) =>
                  current?.kind === "ADD"
                    ? undefined
                    : { kind: "DELETE", before: current?.before ?? workout },
                );
            },
          }}
          renderActions={
            draft || showAdjustmentControls || legacyActions
              ? (reloadSchedule) => (
                  <>
                    {draft ? (
                      <div className="absolute inset-x-0 bottom-1 z-10 mx-auto flex w-fit gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => {
                            mutation.reset();
                            onDraftChange(() => null);
                            restoreFocus();
                          }}
                        >
                          {t("cancel")}
                        </Button>
                        <Button
                          ref={confirmButton}
                          type="button"
                          size="sm"
                          disabled={pending || !ready}
                          onClick={() =>
                            mutation.mutate({ value: draft, base })
                          }
                        >
                          {pending
                            ? t("savingMove")
                            : versioned
                              ? tEditor("saveDraft")
                              : t("reviewAdjustment")}
                        </Button>
                      </div>
                    ) : versioned && showAdjustmentControls ? (
                      <div className="absolute inset-x-0 bottom-1 z-10 mx-auto flex w-fit gap-2">
                        <CalendarAdjustmentControls adjustment={versioned} />
                      </div>
                    ) : ready || showLegacy ? (
                      legacyActions
                    ) : null}
                    <AlertDialog
                      open={reloadPrompt !== "closed"}
                      onOpenChange={(open) => {
                        if (!open && reloadPrompt !== "loading")
                          setReloadPrompt("closed");
                      }}
                    >
                      <AlertDialogContent
                        onCloseAutoFocus={(event) => {
                          event.preventDefault();
                          if (confirmButton.current)
                            confirmButton.current.focus({
                              preventScroll: true,
                            });
                          else restoreFocus();
                        }}
                      >
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t("batchReloadTitle")}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("batchConflict")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        {reloadPrompt === "failed" ? (
                          <p role="status" className="text-sm text-destructive">
                            {t("recovery.failed")}
                          </p>
                        ) : null}
                        <AlertDialogFooter>
                          <AlertDialogCancel
                            disabled={reloadPrompt === "loading"}
                          >
                            {t("continueEditing")}
                          </AlertDialogCancel>
                          <Button
                            type="button"
                            disabled={reloadPrompt === "loading"}
                            onClick={() =>
                              void loadLatestSchedule(reloadSchedule)
                            }
                          >
                            {t(
                              reloadPrompt === "loading"
                                ? "working"
                                : "recovery.action",
                            )}
                          </Button>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )
              : undefined
          }
        />
      </div>
      <AlertDialog
        open={confirmClose}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirmClose(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("closeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("closeDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {mutation.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {t("batchFailed")}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {t("continueEditing")}
            </AlertDialogCancel>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                onDraftChange(() => null);
                setConfirmClose(false);
                onClose?.();
              }}
            >
              {t("discardLocalEdits")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending || !ready || !draft}
              onClick={() => {
                if (draft)
                  mutation.mutate({
                    value: draft,
                    base,
                    saveOnly: true,
                  });
              }}
            >
              {pending ? t("working") : tEditor("saveDraft")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
