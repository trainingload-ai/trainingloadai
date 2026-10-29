"use client";

import { useState } from "react";
import { Brain, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CoachActivity } from "@shared/ai-coach-run-contract";
import { isCoachPublicReasoningSummary } from "@shared/ai-coach-run-contract";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { cn } from "@/lib/utils";

export function CoachReasoningSummary({
  activity,
  runActive,
}: {
  activity: CoachActivity;
  runActive: boolean;
}) {
  const t = useTranslations("AiCoachPage.timeline");
  const [userOpen, setUserOpen] = useState<boolean>();
  if (
    activity.kind !== "analysis" ||
    !isCoachPublicReasoningSummary(activity.publicSummary)
  )
    return null;
  const failed =
    activity.status === "failed" || activity.status === "interrupted";
  const Icon = failed ? XCircle : Brain;
  return (
    <Reasoning
      data-activity-id={activity.activityId}
      data-coach-reasoning-summary
      open={userOpen ?? runActive}
      onOpenChange={setUserOpen}
      // The summary is published only once a complete public prelude passes
      // validation. Run progress is not a fabricated reasoning-token timer.
      isStreaming={false}
    >
      <ReasoningTrigger
        title={t("publicSummaryHint")}
        className={cn(failed && "text-destructive")}
      >
        <Icon aria-hidden className="size-4 shrink-0" />
        <span>{t("publicSummary")}</span>
        <span className="text-xs">{t(`activity.${activity.status}`)}</span>
      </ReasoningTrigger>
      <ReasoningContent className="ml-6 rounded-md bg-muted/60 px-3 py-2.5 dark:bg-muted/45">
        {activity.publicSummary.text}
      </ReasoningContent>
    </Reasoning>
  );
}
