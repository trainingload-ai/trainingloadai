"use client";

import {
  createContext,
  useEffect,
  useId,
  useRef,
  type ComponentProps,
  type ReactNode,
  type Ref,
} from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { PlanCalendarMoveImpact } from "@shared/plan-proposal";
import type { CoachActivityView, CoachEntityView } from "@shared/ai-coach-schema";
import type { TrainingAnalysisMeasure } from "@shared/training-visualization";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import type { CoachCalendarArtifact } from "./coach-calendar-artifact";
import styles from "./coach-preview-panel.module.css";

export const CoachSchedulePreviewContext = createContext<{
  openAdjustment?: (id: string) => void;
  openPublishedCalendar?: (id: string) => void;
  open: (decisionId: string) => void;
  cancelledDecisionId: string | null;
  initialMove: PlanCalendarMoveImpact | undefined;
  confirmInPreview?: boolean;
  editingAdjustmentId?: string;
  isEditingAdjustment?: (id: string) => boolean;
} | null>(null);

export const CoachPlanDraftPreviewContext = createContext<
  ((id: string) => void) | null
>(null);

export const CoachActivityPreviewContext = createContext<
  ((view: CoachActivityView | CoachEntityView, title: string) => void) | null
>(null);

export type CoachChartView = {
  messageId: string;
  deliveryId: string;
  fingerprint: string;
  measure?: TrainingAnalysisMeasure;
  date?: string;
};

export const CoachChartPreviewContext = createContext<
  ((view: CoachChartView, title: string) => void) | null
>(null);

export function CoachConversationDialogContent({
  children,
  onCloseAutoFocus,
}: Pick<
  ComponentProps<typeof DialogContent>,
  "children" | "onCloseAutoFocus"
>) {
  const t = useTranslations("AiCoachPage.workspace");
  const titleId = useId();
  return (
    <DialogContent
      aria-labelledby={titleId}
      className="flex h-[92dvh] flex-col gap-0 overflow-hidden bg-background p-0 pc:h-[85vh] pc:max-w-[min(1200px,calc(100vw-3rem))] pc:p-0"
      onCloseAutoFocus={onCloseAutoFocus}
      onPointerDownOutside={(event) => event.preventDefault()}
    >
      <header className="shrink-0 border-b px-4 py-3 pr-12">
        <DialogTitle id={titleId}>{t("conversationTitle")}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("conversationTitle")}
        </DialogDescription>
      </header>
      {children}
    </DialogContent>
  );
}

export function CoachConversationLayout({
  conversation,
  preview,
  mobileView,
  onMobileViewChange,
  previewLabel,
  conversationRef,
}: {
  conversation: ReactNode;
  preview: ReactNode;
  mobileView: "conversation" | "preview";
  onMobileViewChange: (view: "conversation" | "preview") => void;
  previewLabel?: string;
  conversationRef: Ref<HTMLDivElement>;
}) {
  const id = useId();
  const t = useTranslations("AiCoachPage.workspace");
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {preview ? (
        <div className="flex shrink-0 gap-2 border-b px-3 py-2 min-[1080px]:hidden">
          <Button
            size="sm"
            variant={mobileView === "conversation" ? "secondary" : "ghost"}
            aria-pressed={mobileView === "conversation"}
            onClick={() => onMobileViewChange("conversation")}
          >
            {t("conversationTitle")}
          </Button>
          <Button
            size="sm"
            variant={mobileView === "preview" ? "secondary" : "ghost"}
            aria-pressed={mobileView === "preview"}
            onClick={() => onMobileViewChange("preview")}
          >
            {previewLabel ?? t("calendar")}
          </Button>
        </div>
      ) : null}
      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 flex-1 max-[1079px]:!block max-[1079px]:[&>[data-panel]]:!contents"
      >
        <ResizablePanel
          id={`${id}-conversation`}
          elementRef={conversationRef}
          tabIndex={-1}
          defaultSize={preview ? "38%" : "100%"}
          minSize="28%"
          className={cn(
            "flex h-full min-h-0 min-w-0 flex-col",
            preview && mobileView === "preview" && "hidden min-[1080px]:flex",
          )}
        >
          {conversation}
        </ResizablePanel>
        {preview ? (
          <>
            <ResizableHandle
              aria-label={t("resizePreview")}
              className="hidden min-[1080px]:flex"
            />
            <ResizablePanel
              id={`${id}-preview`}
              defaultSize="62%"
              minSize="360px"
              maxSize="960px"
              className={cn(
                "flex h-full min-h-0 min-w-0 flex-col",
                mobileView !== "preview" && "hidden min-[1080px]:flex",
              )}
            >
              {preview}
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
    </div>
  );
}

type PreviewTab = {
  id: string;
  label: string;
  kind?: CoachCalendarArtifact["kind"];
  content: ReactNode;
  footer?: ReactNode;
  lazy?: boolean;
};

export function CoachPreviewPanel({
  onClose,
  onTabClose,
  tabs,
  tabOrder,
  value,
  onValueChange,
}: {
  onClose: () => void;
  onTabClose: (id: string, nextId: string | null) => void;
  tabs: PreviewTab[];
  tabOrder: string[];
  value: string;
  onValueChange: (id: string) => void;
}) {
  const t = useTranslations();
  const viewport = useRef<HTMLDivElement>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const tabsById = new Map(tabs.map((tab) => [tab.id, tab]));
  const kindLabels = {
    "published-calendar": t("AiCoachPage.workspace.calendar"),
    "plan-draft-calendar": t("AiCoachPage.rendering.tools.planDraft"),
    "schedule-calendar": t("AiCoachPage.workspace.preview"),
    "calendar-adjustment": t("AiCoachPage.workspace.preview"),
  };
  const ordered = tabOrder.flatMap((id) => {
    const tab = tabsById.get(id);
    if (!tab) return [];
    const kindLabel = tab.kind ? kindLabels[tab.kind] : undefined;
    return [{
      ...tab,
      kindLabel,
      fullLabel: kindLabel ? `${kindLabel} ${tab.label}` : tab.label,
    }];
  });
  const closeTab = (id: string, index: number) => {
    const nextId = id === value
      ? ordered[index + 1]?.id ?? ordered[index - 1]?.id ?? null
      : value;
    onTabClose(id, nextId);
    if (nextId)
      requestAnimationFrame(() => triggers.current.get(nextId)?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    const scroller = viewport.current;
    const tab = triggers.current.get(value);
    if (!scroller || !tab) return;
    const bounds = scroller.getBoundingClientRect();
    const target = tab.getBoundingClientRect();
    if (target.left < bounds.left) scroller.scrollBy({ left: target.left - bounds.left });
    else if (target.right > bounds.right) scroller.scrollBy({ left: target.right - bounds.right });
  }, [value, ordered.length]);

  return (
    <Tabs
      value={value}
      activationMode="manual"
      onValueChange={onValueChange}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex shrink-0 items-end gap-1 bg-muted/60 pe-2 pt-1.5">
        <div ref={viewport} className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
          <div
            className={cn("grid w-max gap-x-1", styles.tabGrid)}
            style={{ gridTemplateColumns: `repeat(${ordered.length}, max-content)` }}
          >
            <TabsList
              aria-label={t("AiCoachPage.workspace.preview")}
              className="col-span-full row-start-1 grid h-auto grid-cols-subgrid rounded-none bg-transparent p-0"
            >
              {ordered.map(({ id, label, kindLabel, fullLabel }, index) => (
                <TabsTrigger
                  key={id}
                  ref={(button) => {
                    if (button) triggers.current.set(id, button);
                    else triggers.current.delete(id);
                  }}
                  value={id}
                  title={fullLabel}
                  aria-label={fullLabel}
                  aria-keyshortcuts="Delete"
                  onKeyDown={(event) => {
                    if (event.key !== "Delete") return;
                    event.preventDefault();
                    closeTab(id, index);
                  }}
                  className={cn(
                    "h-9 max-w-[min(18rem,72vw)] min-w-0 justify-start gap-1.5 rounded-t-control rounded-b-none px-2.5 pe-9 text-xs hover:bg-background/55 focus-visible:ring-inset focus-visible:ring-offset-0 data-[state=active]:bg-background data-[state=active]:shadow-none",
                    styles.tab,
                  )}
                >
                  {kindLabel ? (
                    <span className="shrink-0 text-[11px] font-normal text-muted-foreground">
                      {kindLabel}
                    </span>
                  ) : null}
                  <span className="truncate">{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {ordered.map(({ id, fullLabel }, index) => (
              <Button
                key={id}
                type="button"
                variant="ghost"
                size="icon-compact"
                className="z-10 me-1 self-center justify-self-end text-muted-foreground hover:bg-accent [&_svg]:size-3.5"
                style={{ gridRow: 1, gridColumn: index + 1 }}
                aria-label={`${t("SharedUI.close")} ${fullLabel}`}
                onClick={() => closeTab(id, index)}
              >
                <X aria-hidden />
              </Button>
            ))}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="mb-0.5 shrink-0"
          aria-label={t("AiCoachPage.workspace.closePreview")}
          title={t("AiCoachPage.workspace.closePreview")}
          onClick={onClose}
        >
          <X aria-hidden />
        </Button>
      </div>
      {ordered.map(({ id, content, footer, lazy }) => (
        <TabsContent
          key={id}
          value={id}
          forceMount={lazy ? undefined : true}
          className="mt-0 flex min-h-0 flex-1 flex-col bg-background data-[state=inactive]:hidden"
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-3">{content}</div>
          {footer}
        </TabsContent>
      ))}
    </Tabs>
  );
}
