"use client";

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
  stripAiPlanSeedParams,
  type AiPlanSeedRaceDistance,
} from "@/lib/ai-plan-seed-prompt";
import { getStrengthEquipmentKey } from "@/lib/strength-catalog";
import { getBranchContextFromSearchParams } from "./coach-branch-context";
import {
  buildTodaySuggestionCoachMessage,
  claimTodaySuggestionCoachContext,
} from "@/lib/today-suggestion-coach-context";

function stripAiCoachSeedEntryParams(next: URLSearchParams): void {
  stripAiPlanSeedParams(next);
  next.delete("branch");
  next.delete("branchId");
  next.delete("contextId");
  next.delete("source");
  next.delete("date");
  next.delete("workoutId");
  next.delete("openReason");
  next.delete("planId");
  next.delete("pending");
  next.delete("caseId");
  next.delete("todaySuggestionId");
  next.delete("starterCode");
}

export function CoachSeedAutoStarter({
  intentOverrideRef,
  branchContextRef,
}: {
  intentOverrideRef: MutableRefObject<string | null>;
  branchContextRef: MutableRefObject<CoachBranchRequestContext | null>;
}) {
  const locale = useLocale();
  const tPlanCreate = useTranslations("V2PlanCreatePage");
  const tEquipment = useTranslations("StrengthCatalog.equipment");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending: sessionPending } = useViewerSession();
  const thread = useCoachActions();
  const lastConsumedSeedRef = useRef<string | null>(null);
  const claimedTodaySuggestionRef = useRef<{
    id: string;
    context: NonNullable<ReturnType<typeof claimTodaySuggestionCoachContext>>;
  } | null>(null);

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
    const todaySuggestionId =
      searchParams.get("todaySuggestionId")?.trim() ?? "";
    const todaySuggestionContext = todaySuggestionId
      ? claimedTodaySuggestionRef.current?.id === todaySuggestionId
        ? claimedTodaySuggestionRef.current.context
        : claimTodaySuggestionCoachContext(todaySuggestionId)
      : null;
    if (todaySuggestionId && todaySuggestionContext) {
      claimedTodaySuggestionRef.current = {
        id: todaySuggestionId,
        context: todaySuggestionContext,
      };
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
        tPlanCreate("brief.cycle", {
          weeks: planPayload.cycleWeeks,
          weeklyDays: planPayload.weeklyDays,
          dailyMinutes: planPayload.dailyMinutes,
        }),
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
    stripAiCoachSeedEntryParams(next);
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

  return null;
}
