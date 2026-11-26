"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CalendarEditor } from "./calendar-editor";
import type { CalendarEditDraft } from "./calendar-edit-draft";
import { useCalendarAdjustments } from "./use-calendar-adjustments";

export function CalendarAdjustmentDialog({
  planId,
  initialDate,
  onClose,
}: {
  planId: string;
  initialDate: string;
  onClose: () => void;
}) {
  const t = useTranslations("CalendarMove");
  const titleId = useId();
  const [selection, setSelection] = useState<string>();
  const [draft, setDraft] = useState<CalendarEditDraft | null>(null);
  const closeEditor = useRef<() => void>(null);
  const adjustments = useCalendarAdjustments(planId);
  const visible =
    adjustments.data?.filter(
      ({ state }) => state !== "DISCARDED" && state !== "APPLIED",
    ) ?? [];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeEditor.current?.();
      }}
    >
      <DialogContent
        aria-labelledby={titleId}
        className="flex max-h-[94dvh] h-[min(54rem,94dvh)] w-[calc(100vw-1rem)] max-w-[58rem] flex-col gap-3 overflow-hidden p-3 pc:max-w-[58rem] pc:p-5"
      >
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle id={titleId}>{t("adjustSchedule")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("adjustScheduleDescription")}
          </DialogDescription>
        </DialogHeader>
        {visible.length || selection ? (
          <div className="flex shrink-0 gap-1 overflow-x-auto pb-1">
            <Button
              size="sm"
              variant={!selection ? "secondary" : "ghost"}
              disabled={Boolean(draft)}
              onClick={() => setSelection(undefined)}
            >
              {t("newAdjustment")}
            </Button>
            {visible.map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant={selection === item.id ? "secondary" : "ghost"}
                disabled={Boolean(draft)}
                onClick={() => setSelection(item.id)}
              >
                {item.presentation.range?.from ?? item.presentation.startDate} ·{" "}
                {t(`adjustmentStates.${item.state}`)}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="min-h-0 flex-1">
          <CalendarEditor
            key={selection ?? "new"}
            planId={planId}
            initialDate={initialDate}
            adjustmentId={selection}
            draft={draft}
            onDraftChange={(update) => setDraft(update)}
            closeRef={closeEditor}
            onClose={onClose}
            showInitialControls
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
