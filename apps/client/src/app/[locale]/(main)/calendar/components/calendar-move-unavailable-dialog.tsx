"use client";

import { useRef, useState, type ComponentProps } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { PlanCalendarMovePreview } from "@shared/plan-proposal";
import { aiCoachMessagesQueryKey, fetchCoachSessionMessages } from "@/api/ai-coach";
import { CoachMarkdown } from "../../ai-coach/coach-markdown";
import { CoachConversationDialogContent, CoachConversationLayout } from "../../ai-coach/coach-preview-panel";
import { coachRowsToUiMessages } from "../../ai-coach/coach-rows-to-ui-messages";
import { CalendarMovePreviewCalendar } from "./calendar-move-preview-calendar";
import { CalendarScheduleReloadOverlay } from "./calendar-schedule-reload-overlay";

export type CalendarMoveUnavailableReason = Exclude<PlanCalendarMovePreview["recoveryBlockedReason"], "alreadyApplied" | undefined>;

export function CalendarMoveUnavailableDialog({
  planId,
  preview,
  reason,
  sid,
  onCloseAutoFocus,
}: {
  planId: string;
  preview: PlanCalendarMovePreview;
  reason: CalendarMoveUnavailableReason;
  sid?: string;
  onCloseAutoFocus: ComponentProps<typeof CoachConversationDialogContent>["onCloseAutoFocus"];
}) {
  const t = useTranslations("CalendarMove");
  const [mobileView, setMobileView] = useState<"conversation" | "preview">("preview");
  const [reloaded, setReloaded] = useState(false);
  const conversation = useRef<HTMLDivElement>(null);
  const history = useQuery({
    queryKey: aiCoachMessagesQueryKey(sid ?? ""),
    queryFn: ({ signal }) => fetchCoachSessionMessages(sid!, signal),
    enabled: Boolean(sid),
    retry: false,
  });
  const messages = coachRowsToUiMessages(history.data ?? []);
  const { workoutId, from, to } = preview.impact;
  const workoutName = preview.presentation.rows.find((row) => row.workoutId === workoutId)?.name;

  return (
    <CoachConversationDialogContent onCloseAutoFocus={onCloseAutoFocus}>
      <CoachConversationLayout
        conversationRef={conversation}
        mobileView={mobileView}
        onMobileViewChange={setMobileView}
        conversation={(
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="space-y-1 text-sm">
                {workoutName && <p className="font-medium">{workoutName}</p>}
                <p className="text-muted-foreground">{t("moving", { from, to })}</p>
              </div>
            )}
            {messages.map(({ id, role, parts }) => {
              const text = parts.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n\n");
              if (!text) return null;
              return role === "user" ? (
                <p key={id} className="max-w-[90%] self-end whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2 text-sm">{text}</p>
              ) : (
                <CoachMarkdown key={id}>{text}</CoachMarkdown>
              );
            })}
          </div>
        )}
        preview={(
          <div className="h-full min-h-0 p-3">
            <CalendarMovePreviewCalendar
              initialDate={from}
              planId={planId}
              presentation={null}
              renderScheduleOverlay={reloaded ? undefined : (reloadSchedule) => (
                <CalendarScheduleReloadOverlay onReload={reloadSchedule} onReloaded={() => setReloaded(true)}>
                  {workoutName && <p className="font-medium text-foreground">{workoutName}</p>}
                  <p>{t(`recovery.${reason}`)}</p>
                  <p>{t("adjustmentUnavailable")}</p>
                </CalendarScheduleReloadOverlay>
              )}
            />
          </div>
        )}
      />
    </CoachConversationDialogContent>
  );
}
