"use client";

import { stripCoachSeedEntryParams } from "@/lib/coach-seed-entry";

import { useQuery } from "@tanstack/react-query";
import { resolveTodaySuggestionContext } from "@/api/ai-today-suggestion";

import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { useCoachActions } from "./coach-chat-provider";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import { useViewerSession } from "@/public-demo/use-viewer-session";
import { getLoginHrefWithCallback } from "@/lib/auth-callback";
import { useRouter } from "@/i18n/navigation";
import {
  type CoachBranchRequestContext,
  type CoachUserMessageBody,
} from "@/lib/ai-coach-stream";
import {
  buildPlanFollowupCoachUserMessage,
  buildPlanFollowupUserText,
  parsePlanFollowupFromSearchParams,
  planFollowupDedupeKey,
} from "@/lib/ai-plan-followup-prompt";
import {
  aiPlanSeedDedupeKey,
  buildAiPlanSeedToolResult,
  buildAiPlanSeedUserText,
  parseAiPlanSeedFromSearchParams,
  type AiPlanSeedRaceDistance,
} from "@/lib/ai-plan-seed-prompt";
import { getStrengthEquipmentKey } from "@/lib/strength-catalog";
import { getBranchContextFromSearchParams } from "./coach-branch-context";
import { buildTodaySuggestionCoachMessage } from "@/lib/today-suggestion-coach-context";

export function CoachSeedAutoStarter({
  sessionId,
  intentOverrideRef,
  branchContextRef,
}: {
  sessionId: string;
  intentOverrideRef: MutableRefObject<string | null>;
  branchContextRef: MutableRefObject<CoachBranchRequestContext | null>;
}) {
  const locale = useLocale();
  const tHome = useTranslations("V2HomePage");
  const tPlanCreate = useTranslations("V2PlanCreatePage");
  const rollingT = useTranslations("RollingPlan");
  const tEquipment = useTranslations("StrengthCatalog.equipment");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending: sessionPending } = useViewerSession();
  const thread = useCoachActions();
  const lastConsumedSeedRef = useRef<string | null>(null);
  const todaySuggestionId = searchParams.get("todaySuggestionId")?.trim() ?? "";
  const resolvedGuidance = useQuery({
    queryKey: [
      "today-suggestion-context",
      session?.user?.id,
      todaySuggestionId,
    ],
    queryFn: () => resolveTodaySuggestionContext(todaySuggestionId),
    enabled: Boolean(session?.user?.id && todaySuggestionId),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (sessionPending) return;
    if (!session?.user?.id) {
      const hasSeed =
        parseAiPlanSeedFromSearchParams(searchParams) ||
        parsePlanFollowupFromSearchParams(searchParams) ||
        (searchParams.get("todaySuggestionId")?.trim() ?? "") ||
        (searchParams.get("prompt")?.trim() ?? "");
      if (hasSeed) router.push(getLoginHrefWithCallback());
      return;
    }
    if (!thread) return;

    const assessmentCaseId = searchParams.get("caseId")?.trim() ?? "";
    if (assessmentCaseId) {
      branchContextRef.current = getBranchContextFromSearchParams(
        searchParams,
        {
          intent: "athlete_state_assessment",
          source: "home-state-inquiry",
          planId: searchParams.get("planId")?.trim() ?? "",
          pending: "",
        },
      );
    }

    const planPayload = parseAiPlanSeedFromSearchParams(searchParams);
    const planFollowup = parsePlanFollowupFromSearchParams(searchParams);
    const todaySuggestionContext = resolvedGuidance.data?.context ?? null;
    if (todaySuggestionId) {
      if (
        resolvedGuidance.isPending ||
        resolvedGuidance.isFetching ||
        !resolvedGuidance.isFetchedAfterMount ||
        resolvedGuidance.isError
      )
        return;
      if (!resolvedGuidance.data?.sessionId || !todaySuggestionContext) return;
      if (searchParams.get("sid") !== resolvedGuidance.data.sessionId) {
        const next = new URLSearchParams(searchParams.toString());
        next.set("sid", resolvedGuidance.data.sessionId);
        router.replace(`/ai-coach?${next.toString()}`);
        return;
      }
      if (sessionId !== resolvedGuidance.data.sessionId) return;
      if (resolvedGuidance.data.resumeExisting) {
        const next = new URLSearchParams(searchParams.toString());
        stripCoachSeedEntryParams(next);
        next.delete("prompt");
        next.delete("intent");
        router.replace(`/ai-coach?${next.toString()}`);
        return;
      }
    }
    let seedPrompt = "";
    let seedKey = "";
    let intent = "";
    let coachUserMessage: CoachUserMessageBody | null = null;

    if (todaySuggestionContext) {
      seedPrompt = searchParams.get("prompt")?.trim() ?? "";
      if (!seedPrompt) return;
      seedKey = `today-suggestion::${todaySuggestionId}`;
      intent = searchParams.get("intent")?.trim() || "today-suggestion";
      coachUserMessage = buildTodaySuggestionCoachMessage({
        prompt: seedPrompt,
        context: todaySuggestionContext,
      });
    } else if (planPayload) {
      const sportText = planPayload.sportTypes
        .map((sport) => tPlanCreate(`sport.${sport}`))
        .join(tPlanCreate("common.joiner"));
      const briefLines = [
        tPlanCreate("brief.sports", { value: sportText }),
        tPlanCreate("brief.intent", {
          value: tPlanCreate(`intent.${planPayload.intent}.title`),
        }),
        ...(planPayload.planningMode === "ROLLING"
          ? [rollingT("title"), rollingT("availability", {
              weeklyDays: planPayload.weeklyDays, dailyMinutes: planPayload.dailyMinutes,
            })]
          : [tPlanCreate("brief.cycle", {
              weeks: planPayload.cycleWeeks ?? 8,
              weeklyDays: planPayload.weeklyDays, dailyMinutes: planPayload.dailyMinutes,
            })]),
        tPlanCreate("brief.strength", {
          value: tPlanCreate(
            `strength.preference.${planPayload.strength.preference}`,
          ),
        }),
      ];
      if (planPayload.strength.preference !== "EXCLUDE") {
        const equipmentText = planPayload.strength.equipment
          .map((item) => {
            const equipmentKey = getStrengthEquipmentKey(item);
            return equipmentKey ? tEquipment(equipmentKey) : item;
          })
          .join(tPlanCreate("common.joiner"));
        briefLines.push(
          tPlanCreate("brief.equipment", {
            value: equipmentText || tEquipment("bodyweight"),
          }),
        );
      }
      if (
        planPayload.intent === "racePrep" &&
        planPayload.raceDiscipline &&
        planPayload.raceDistance
      ) {
        const raceDistanceLabels = {
          "5k": "5K",
          "10k": "10K",
          half: tPlanCreate("raceDistance.run.half"),
          full: tPlanCreate("raceDistance.run.full"),
          sprint: "Sprint",
          olympic: "Olympic",
          halfIron: "Half Iron",
          fullIron: "Full Iron",
          criterium: tPlanCreate("raceDistance.cycle.criterium"),
          road: tPlanCreate("raceDistance.cycle.road"),
        } satisfies Record<AiPlanSeedRaceDistance, string>;
        briefLines.push(
          tPlanCreate("brief.race", {
            discipline: tPlanCreate(
              `raceDiscipline.${planPayload.raceDiscipline}`,
            ),
            distance: raceDistanceLabels[planPayload.raceDistance],
          }),
        );
      }
      seedPrompt = buildAiPlanSeedUserText(locale, {
        title: tPlanCreate("brief.title"),
        lines: briefLines,
      });
      seedKey = `plan-builder::${aiPlanSeedDedupeKey(planPayload)}`;
      intent = searchParams.get("intent")?.trim() || "plan-builder";
      coachUserMessage = {
        content: [
          { type: "text", text: seedPrompt },
          {
            type: "tool_result",
            tool_use_id: "client:ai_plan_seed",
            content: buildAiPlanSeedToolResult(planPayload),
          },
        ],
      };
    } else if (planFollowup) {
      seedPrompt = buildPlanFollowupUserText(locale);
      seedKey = `plan-followup::${planFollowupDedupeKey(planFollowup)}`;
      intent = searchParams.get("intent")?.trim() || "plan-followup";
      coachUserMessage = buildPlanFollowupCoachUserMessage(
        locale,
        planFollowup,
      );
    } else {
      seedPrompt = searchParams.get("prompt")?.trim() ?? "";
      if (!seedPrompt) return;
      intent = searchParams.get("intent")?.trim() ?? "";
      seedKey = `${intent}::${seedPrompt}`;
    }

    if (lastConsumedSeedRef.current === seedKey) return;
    lastConsumedSeedRef.current = seedKey;

    const planId =
      searchParams.get("planId")?.trim() || planFollowup?.planId || "";
    const pending = searchParams.get("pending")?.trim() || "";
    intentOverrideRef.current = intent || null;
    branchContextRef.current = getBranchContextFromSearchParams(searchParams, {
      intent,
      source: searchParams.get("source")?.trim() || "ai-coach",
      planId,
      pending,
    });

    const next = new URLSearchParams(searchParams.toString());
    stripCoachSeedEntryParams(next);
    const qs = next.toString();
    window.history.replaceState(
      window.history.state,
      "",
      qs ? `${pathname}?${qs}` : pathname,
    );

    thread.append({
      role: "user",
      content: [
        { type: "text", text: seedPrompt },
        ...(coachUserMessage?.content
          .filter((block) => block.type === "tool_result")
          .map((block) => ({
            type: "data" as const,
            name: "coach-user-tool-result" as const,
            data: {
              toolUseId: block.tool_use_id,
              content: block.content,
              ...(typeof block.is_error === "boolean"
                ? { isError: block.is_error }
                : {}),
            },
          })) ?? []),
      ],
    });
  }, [
    branchContextRef,
    resolvedGuidance.data,
    resolvedGuidance.isPending,
    resolvedGuidance.isFetching,
    resolvedGuidance.isFetchedAfterMount,
    resolvedGuidance.isError,
    todaySuggestionId,
    sessionId,
    intentOverrideRef,
    locale,
    pathname,
    router,
    searchParams,
    session?.user?.id,
    sessionPending,
    tPlanCreate,
    tEquipment,
    thread,
  ]);

  if (
    todaySuggestionId &&
    (resolvedGuidance.isError ||
      resolvedGuidance.data?.status === "UNAVAILABLE")
  )
    return (
      <p role="status" className="px-4 py-3 text-sm text-muted-foreground">
        {tHome("todaySuggestionActions.suggestionChanged")}
      </p>
    );
  return null;
}
