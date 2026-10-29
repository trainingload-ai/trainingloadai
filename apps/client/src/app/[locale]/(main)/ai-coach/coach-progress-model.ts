import type {
  CoachStatusData,
  CoachToolProgressData,
} from "@/lib/ai-coach-ui-parts";

export type CoachProgressSnapshot = {
  status: CoachStatusData | null;
  toolProgress: CoachToolProgressData | null;
};

export type CoachProgressMessageKey =
  | "rendering.thinking"
  | "status.phaseModel"
  | "status.phaseToolRun"
  | "status.progress.preparing"
  | "status.progress.analyzingRequest"
  | "status.progress.readingBaseline"
  | "status.progress.readingPerformance"
  | "status.progress.resolvingIntensity"
  | "status.progress.checkingCompetitions"
  | "status.progress.synthesizingEvidence"
  | "status.progress.draftingPlan"
  | "status.progress.validatingPlan";

function isDataContentPart(
  part: unknown,
): part is { type: "data"; name: string; data: unknown } {
  return (
    Boolean(part) &&
    typeof part === "object" &&
    !Array.isArray(part) &&
    (part as { type?: unknown }).type === "data" &&
    typeof (part as { name?: unknown }).name === "string"
  );
}

export function readCoachProgressSnapshot(
  parts: readonly unknown[],
): CoachProgressSnapshot {
  const snapshot: CoachProgressSnapshot = {
    status: null,
    toolProgress: null,
  };
  for (const part of parts) {
    if (!isDataContentPart(part)) continue;
    if (part.name === "coach-status") {
      snapshot.status = part.data as CoachStatusData;
    } else if (part.name === "coach-tool-progress") {
      snapshot.toolProgress = part.data as CoachToolProgressData;
    }
  }
  return snapshot;
}

function progressKeyForTool(toolName: string): CoachProgressMessageKey | null {
  const normalized = toolName.trim().toLowerCase();
  if (!normalized || normalized === "batch") return null;
  if (normalized === "present_coach_plan_draft") {
    return "status.progress.validatingPlan";
  }
  if (
    normalized === "training_baseline" ||
    normalized === "training.baseline"
  ) {
    return "status.progress.readingBaseline";
  }
  if (normalized === "bests_summary" || normalized === "bests.summary") {
    return "status.progress.readingPerformance";
  }
  if (
    normalized === "workout_intensity_strategy" ||
    normalized === "workout.intensity_strategy" ||
    normalized === "profile_zone_ranges" ||
    normalized === "profile.zone_ranges" ||
    normalized === "profile_current" ||
    normalized === "profile.current"
  ) {
    return "status.progress.resolvingIntensity";
  }
  if (
    normalized === "competition_impact_resolve" ||
    normalized === "competition.impact.resolve" ||
    normalized === "competition_events_list" ||
    normalized === "competition.events.list"
  ) {
    return "status.progress.checkingCompetitions";
  }
  return null;
}

export function resolveCoachProgressMessageKey(
  snapshot: CoachProgressSnapshot,
): CoachProgressMessageKey {
  const toolProgress = snapshot.toolProgress;
  if (
    snapshot.status?.status === "tool_run" &&
    toolProgress &&
    (toolProgress.status === "issued" || toolProgress.status === "start")
  ) {
    return progressKeyForTool(toolProgress.toolName) ?? "status.phaseToolRun";
  }

  switch (snapshot.status?.progress) {
    case "thinking":
      return "rendering.thinking";
    case "preparing":
      return "status.progress.preparing";
    case "analyzing_request":
      return "status.progress.analyzingRequest";
    case "synthesizing_evidence":
      return "status.progress.synthesizingEvidence";
    case "drafting_plan":
      return "status.progress.draftingPlan";
    case "running_tools":
      return "status.phaseToolRun";
    default:
      return snapshot.status?.status === "tool_run"
        ? "status.phaseToolRun"
        : "status.phaseModel";
  }
}
