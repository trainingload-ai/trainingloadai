"use client";

import { useRef, type ComponentProps, type ReactNode } from "react";
import { CalendarEditor } from "../calendar/components/calendar-editor";
import { calendarToday } from "../calendar/components/calendar-move-model";
import { CoachPlanDraftCalendarPreview } from "./coach-plan-draft-calendar-preview";
import {
  CoachConversationLayout,
  CoachPlanDraftPreviewContext,
  CoachPreviewPanel,
  CoachSchedulePreviewContext,
} from "./coach-preview-panel";
import {
  calendarAdjustmentArtifact,
  calendarArtifactKey,
  calendarDraftKey,
  useCoachCalendarArtifacts,
  useCoachCalendarTabs,
  type CoachPlanDraftArtifact,
  type CoachCalendarAdjustmentArtifact,
  type CoachPublishedCalendarArtifact,
  type CoachScheduleArtifact,
} from "./coach-calendar-artifact";
import { useCoachCalendarMovePreview } from "./coach-calendar-move-recovery-card";

import { CoachReadViewProvider, useCoachReadTabs } from "./coach-read-workspace";

export function CoachDraftCalendar({
  artifact,
}: {
  artifact: CoachPlanDraftArtifact;
}) {
  const { draft } = artifact;
  return (
    <CoachPlanDraftCalendarPreview
      draft={draft}
      responsiveToContainer
      startDate={draft.qualityContract?.startDate}
      calendarTimeZone={draft.scheduleConstraints?.calendarTimeZone ?? "UTC"}
      scheduleConstraints={draft.scheduleConstraints}
    />
  );
}

export function CoachEditableCalendar({
  artifact, ...editor
}: Omit<ComponentProps<typeof CalendarEditor>, "planId" | "initialDate" | "adjustmentId" | "presentation"> & {
  artifact: CoachPublishedCalendarArtifact | CoachCalendarAdjustmentArtifact | CoachScheduleArtifact;
}) {
  const initialDate = artifact.kind === "schedule-calendar"
    ? artifact.presentation.rows.find((row) => row.changeKind === "CHANGED")?.scheduledDate
      ?? artifact.presentation.range?.from ?? calendarToday()
    : artifact.initialDate;
  return (
    <CalendarEditor
      {...editor}
      planId={artifact.planId}
      instanceId={artifact.id}
      initialDate={initialDate}
      adjustmentId={artifact.kind === "published-calendar" ? undefined : calendarDraftKey(artifact)}
      presentation={artifact.kind === "published-calendar" ? undefined : artifact.presentation}
    />
  );
}

export function CoachConversationWorkspace({
  children,
  sid,
}: {
  children: ReactNode;
  sid: string;
}) {
  const artifacts = useCoachCalendarArtifacts();
  const { data: move } = useCoachCalendarMovePreview(sid);
  const adjustment = calendarAdjustmentArtifact(move);
  const closeEditor = useRef<() => void>(null);
  const workspace = useCoachCalendarTabs(adjustment ? [...artifacts, adjustment] : artifacts);
  const read = useCoachReadTabs(sid, workspace);
  const activeCalendarKey = workspace.active ? calendarArtifactKey(workspace.active) : undefined;
  const activeKey = read.activeId ?? activeCalendarKey;

  return (
    <CoachReadViewProvider read={read}>
    <CoachSchedulePreviewContext.Provider
      value={{
        open: (id) => workspace.openFromCard("schedule-calendar", id),
        openAdjustment: (id) => workspace.openFromCard("calendar-adjustment", id),
        openPublishedCalendar: (id) => workspace.openFromCard("published-calendar", id),
        editingAdjustmentId: adjustment && workspace.drafts[adjustment.id] ? adjustment.id : undefined,
        isEditingAdjustment: workspace.isEditingAdjustment,
        cancelledDecisionId: null,
        initialMove: undefined,
      }}
    >
      <CoachPlanDraftPreviewContext.Provider
        value={(id) => workspace.openFromCard("plan-draft-calendar", id)}
      >
        <CoachConversationLayout
          conversation={children}
          conversationRef={workspace.conversationRef}
          mobileView={workspace.mobileView}
          onMobileViewChange={workspace.setMobileView}
          previewLabel={read.activeLabel}
          preview={
            workspace.visible && activeKey ? (
              <CoachPreviewPanel
                onClose={() => !read.activeId && closeEditor.current ? closeEditor.current() : read.close()}
                onTabClose={workspace.closeTab}
                tabOrder={workspace.openedIds}
                value={activeKey}
                onValueChange={workspace.setSelection}
                tabs={[...workspace.tabs.map((artifact) => ({
                  id: calendarArtifactKey(artifact),
                  kind: artifact.kind,
                  label:
                    artifact.kind === "plan-draft-calendar"
                      ? artifact.draft.title
                      : artifact.kind === "published-calendar"
                        ? artifact.title
                        : artifact.presentation.title,
                  content:
                    artifact.kind === "plan-draft-calendar" ? (
                      <CoachDraftCalendar artifact={artifact} />
                    ) : (
                      <CoachEditableCalendar
                        artifact={artifact}
                        closeRef={!read.activeId && calendarArtifactKey(artifact) === activeCalendarKey
                          ? closeEditor : undefined}
                        onClose={workspace.close}
                        draft={workspace.drafts[calendarDraftKey(artifact)] ?? null}
                        onDraftChange={(update) => workspace.updateDraft(calendarDraftKey(artifact), update)}
                      />
                    ),
                })), ...read.tabs]}
              />
            ) : null
          }
        />
      </CoachPlanDraftPreviewContext.Provider>
    </CoachSchedulePreviewContext.Provider>
    </CoachReadViewProvider>
  );
}
