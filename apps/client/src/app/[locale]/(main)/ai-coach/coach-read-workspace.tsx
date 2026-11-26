"use client";

import { useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import type { CoachActivityView, CoachEntityView } from "@shared/ai-coach-schema";
import type { useCoachCalendarTabs } from "./coach-calendar-artifact";
import type { CoachActivityPreviewView } from "./coach-activity-preview";
import {
  CoachActivityPreviewContext,
  CoachChartPreviewContext,
  CoachLocalPreviewContext,
  type CoachChartView,
} from "./coach-preview-panel";

const ActivityPreview = dynamic(() =>
  import("./coach-activity-preview").then((module) => module.CoachActivityPreview),
);
const ChartPreview = dynamic(() =>
  import("./coach-chart-preview").then((module) => module.CoachChartPreview),
);
const PlanDetail = dynamic(() =>
  import("@/components/plan/mobile-plan-detail").then((module) => module.MobilePlanDetailSheet),
);
const AthleteOverview = dynamic(() => import("../dashboard/components/Overview/Overview"));

type ReadView = CoachActivityPreviewView | CoachEntityView | ({ kind: "chart" } & CoachChartView)
  | { kind: "local"; content: ReactNode };
type ReadTab = { view: ReadView; label: string };

export function useCoachReadTabs(
  sid: string | undefined,
  workspace: Pick<ReturnType<typeof useCoachCalendarTabs>, "selection" | "openedIds" | "openTab" | "close">,
) {
  const t = useTranslations("ActivityDetail");
  const lastTrigger = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<{ sid: typeof sid; entries: Record<string, ReadTab> }>(
    { sid, entries: {} },
  );
  const entries = state.sid === sid ? state.entries : {};
  const activeId = workspace.selection && entries[workspace.selection] ? workspace.selection : undefined;
  const active = activeId ? entries[activeId] : undefined;
  const saveTab = (id: string, entry: ReadTab) => setState(
    (current) => ({ sid, entries: { ...(current.sid === sid ? current.entries : {}), [id]: entry } }),
  );
  const open = (id: string, entry: ReadTab) => {
    lastTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    saveTab(id, entry);
    workspace.openTab(id);
  };
  const close = () => {
    workspace.close();
    const trigger = lastTrigger.current;
    if (trigger?.isConnected) requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
  };
  function content(id: string, tab: ReadTab) {
    const view = tab.view;
    switch (view.kind) {
      case "activity_detail":
        return <ActivityPreview view={view} onSectionChange={(section) => saveTab(id, {
          ...tab, view: { ...view, section },
        })} />;
      case "chart":
        return sid ? <ChartPreview sid={sid} view={view} /> : null;
      case "local":
        return <div className="min-w-0 p-3">{view.content}</div>;
      case "plan_detail":
        return <PlanDetail embedded open plan={{ id: view.planId }} onOpenChange={(open) => {
          if (!open) close();
        }} />;
      case "athlete_overview":
        return <AthleteOverview embedded />;
    }
  }
  return {
    activeId,
    activeLabel: active?.view.kind === "activity_detail" ? t("title") : active?.label,
    close,
    openEntity(view: CoachActivityView | CoachEntityView, label: string) {
      const id = view.kind === "activity_detail" ? `activity:${view.hashId}`
        : view.kind === "plan_detail" ? `plan:${view.planId}` : "overview";
      open(id, { view, label });
    },
    openChart(view: CoachChartView, label: string) {
      open(`chart:${view.messageId}:${view.deliveryId}`, { view: { ...view, kind: "chart" }, label });
    },
    openLocal(id: string, label: string, content: ReactNode) {
      open(`local:${id}`, { view: { kind: "local", content }, label });
    },
    tabs: workspace.openedIds.flatMap((id) => {
      const tab = entries[id];
      return tab ? [{ id, label: tab.label, lazy: true, content: content(id, tab) }] : [];
    }),
  };
}

export function CoachReadViewProvider({ read, children }: {
  read: Pick<ReturnType<typeof useCoachReadTabs>, "openEntity" | "openChart" | "openLocal">;
  children: ReactNode;
}) {
  return (
    <CoachLocalPreviewContext.Provider value={read.openLocal}>
      <CoachChartPreviewContext.Provider value={read.openChart}>
        <CoachActivityPreviewContext.Provider value={read.openEntity}>
          {children}
        </CoachActivityPreviewContext.Provider>
      </CoachChartPreviewContext.Provider>
    </CoachLocalPreviewContext.Provider>
  );
}
