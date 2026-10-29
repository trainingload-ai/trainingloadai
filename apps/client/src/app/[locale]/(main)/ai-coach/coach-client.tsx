"use client";

import { useCallback, useRef } from "react";
import { MessagesSquare, SquarePen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { MobileTopBarAction } from "@/components/mobile-app/components/MobileTopBar";
import { useMobileNavigation } from "@/components/mobile-app/components/MobileNavigationProvider";
import { MobileSidePageTrigger } from "@/components/mobile-app/components/MobileSidePageTrigger";
import { useMobileEdgeSwipe } from "@/components/mobile-app/hooks/use-mobile-edge-swipe";
import { useAiDataConsent } from "@/api/ai-data-consent";
import { AiDataConsentPrompt } from "@/components/ai-consent/AiDataConsentPrompt";
import { cn } from "@/lib/utils";
import { CoachHistoryMobileSheet } from "./coach-history-panel";
import { CoachHistoryFullPage } from "./coach-history-full-page";
import { useCoachPageState } from "./use-coach-page-state";
import { useCoachSid } from "./use-coach-sid";
import { coachRuntimeInstanceKey } from "./coach-runtime-instance-key";
import { resolveCoachRuntimeMount } from "./coach-runtime-mount";
import { CoachThreadLoading } from "./coach-thread";
import { CoachRuntimeProvider } from "./coach-runtime-provider";

export function AiCoachClient() {
  const t = useTranslations("AiCoachPage");
  const th = useTranslations("AiCoachPage.history");
  const { applySid } = useCoachSid();
  const consent = useAiDataConsent();
  const hasAiDataConsent = consent.data?.granted === true;
  const coach = useCoachPageState(!consent.isLoading && hasAiDataConsent);
  const internallyPersistedSidRef = useRef<string | null>(null);
  const mountedRuntimeSidRef = useRef(coach.sid);
  const runtimeGenerationRef = useRef(0);
  const runtimeMount = resolveCoachRuntimeMount(
    {
      mountedSid: mountedRuntimeSidRef.current,
      internallyPersistedSid: internallyPersistedSidRef.current,
      generation: runtimeGenerationRef.current,
    },
    coach.sid,
  );
  mountedRuntimeSidRef.current = runtimeMount.mountedSid;
  internallyPersistedSidRef.current = runtimeMount.internallyPersistedSid;
  runtimeGenerationRef.current = runtimeMount.generation;
  const { preservesAllocatedRuntime } = runtimeMount;

  const persistActiveRuntimeSid = useCallback(
    (nextSid: string) => {
      // The running chat already owns this client-allocated sid. Updating the
      // URL must not replace that runtime at the end of its first response.
      internallyPersistedSidRef.current = nextSid;
      applySid(nextSid);
    },
    [applySid],
  );
  useSetPageTitle(t("pageTitle"));
  useMobileEdgeSwipe(
    () => coach.setHistorySheetOpen(true),
    !coach.historySheetOpen,
  );
  useMobileNavigation({
    leading: (
      <MobileSidePageTrigger
        onToggle={() => coach.setHistorySheetOpen((current) => !current)}
        openLabel={th("openSheet")}
      >
        <MessagesSquare aria-hidden="true" />
      </MobileSidePageTrigger>
    ),
    trailing: (
      <MobileTopBarAction
        edge="trailing"
        aria-label={t("actions.newChat")}
        onClick={coach.startNewConversation}
      >
        <SquarePen />
      </MobileTopBarAction>
    ),
  });

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 overflow-hidden bg-background text-foreground",
        "pc:pt-0",
      )}
    >
      {hasAiDataConsent ? (
        <CoachHistoryMobileSheet
          open={coach.historySheetOpen}
          onOpenChange={coach.setHistorySheetOpen}
          activeSid={coach.sid}
          onSelectSession={coach.selectSession}
        />
      ) : null}
      {!consent.isLoading && !hasAiDataConsent ? (
        <div className="grid min-w-0 flex-1 place-items-center p-4">
          <AiDataConsentPrompt source="COACH" className="w-full max-w-lg" />
        </div>
      ) : coach.showAllHistory ? (
        <CoachHistoryFullPage
          embedded
          activeSid={coach.sid}
          onBack={coach.closeFullHistory}
          onPickSession={coach.selectSession}
          onSessionDeleted={coach.handleSessionDeleted}
        />
      ) : coach.isLoading && !preservesAllocatedRuntime ? (
        <CoachThreadLoading />
      ) : (
        <CoachRuntimeProvider
          key={`${coachRuntimeInstanceKey(mountedRuntimeSidRef.current, coach.initialMessages)}:${runtimeGenerationRef.current}`}
          sid={mountedRuntimeSidRef.current || ""}
          initialMessages={coach.initialMessages}
          persistSid={persistActiveRuntimeSid}
        />
      )}
    </div>
  );
}
