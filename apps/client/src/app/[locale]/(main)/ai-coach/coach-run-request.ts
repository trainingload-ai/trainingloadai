import type { CoachUiMessage } from "@/lib/ai-coach-ui-parts";
import { getCoachUserToolResultParts } from "@/lib/ai-coach-ui-parts";
import {
  isRecord,
  parseCoachRunCommand,
  type CoachRunCommand,
} from "@shared/ai-coach-run-contract";

export function coachRunRequest(
  messages: CoachUiMessage[],
  body?: Record<string, unknown>,
) {
  const explicit = parseCoachRunCommand(body?.runCommand);
  if (explicit) return { protocolVersion: 2, runCommand: explicit };
  const last = messages.at(-1);
  const requestId = last?.id ?? crypto.randomUUID();
  for (const result of last ? getCoachUserToolResultParts(last) : []) {
    const reply = result.content;
    if (
      !isRecord(reply) ||
      !["coach_question_reply", "coach_question_skip"].includes(
        String(reply.kind),
      )
    )
      continue;
    const source = messages.find(
      (message) => message.id === reply.repliesToAssistantMessageId,
    );
    const interaction = source?.parts.find(
      (part) =>
        part.type === "data-coach-interaction" &&
        part.data.questionToolCallId === reply.questionToolUseId,
    );
    if (interaction?.type !== "data-coach-interaction") continue;
    const branch = source?.parts.find(
      (part) => part.type === "data-coach-branch-opened",
    );
    const runCommand: CoachRunCommand = {
      kind: "answer",
      requestId,
      submissionId: `${requestId}:answer`,
      runId: interaction.data.runId,
      interactionId: interaction.data.interactionId,
    };
    return {
      protocolVersion: 2,
      runCommand,
      ...(branch?.type === "data-coach-branch-opened"
        ? { branchId: branch.data.id }
        : {}),
    };
  }
  return {
    protocolVersion: 2,
    runCommand: { kind: "start", requestId } satisfies CoachRunCommand,
  };
}
