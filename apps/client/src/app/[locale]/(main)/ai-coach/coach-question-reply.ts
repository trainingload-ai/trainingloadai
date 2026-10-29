import type { CoachQuestionPrompt } from "./coach-question-card";

export type CoachQuestionReplyLabels = {
  /** e.g. "Note" / "备注" — appended in parentheses when user typed a note */
  noteLabel: string;
};

export const COACH_QUESTION_REPLY_TEXT_KIND = "coach_question_reply_text";

export function buildCoachQuestionReplyTextPayload(payload: {
  repliesToAssistantMessageId: string;
  answers: Record<string, string | string[]>;
  notes: Record<string, string>;
}): string {
  return JSON.stringify({
    kind: COACH_QUESTION_REPLY_TEXT_KIND,
    repliesToAssistantMessageId: payload.repliesToAssistantMessageId,
    answers: payload.answers,
    notes: payload.notes,
  });
}

export function isCoachQuestionReplyTextPayload(text: string): boolean {
  try {
    const parsed = JSON.parse(String(text ?? "").trim()) as {
      kind?: unknown;
    };
    return parsed?.kind === COACH_QUESTION_REPLY_TEXT_KIND;
  } catch {
    return false;
  }
}

/**
 * Short user-visible reply after structured questions (what appears in the chat bubble).
 * Only headings + selected labels; no full prompts, descriptions, ids, or JSON.
 */
export function buildCoachQuestionReplyBody(
  questions: CoachQuestionPrompt["questions"],
  payload: {
    answers: Record<string, string | string[]>;
    notes: Record<string, string>;
  },
  labels: CoachQuestionReplyLabels,
): string {
  const lines: string[] = [];

  for (const question of questions) {
    const raw = payload.answers[question.id];
    const selectedValues = Array.isArray(raw)
      ? raw
      : raw
        ? [raw]
        : [];
    const note = payload.notes[question.id]?.trim() ?? "";

    const selectedLabels = selectedValues
      .map(
        (value) =>
          question.options.find((o) => o.value === value)?.label ?? value,
      )
      .filter(Boolean);

    const choice =
      selectedLabels.length > 0 ? selectedLabels.join("、") : null;

    let tail = "";
    if (choice && note) {
      tail = `${choice}（${labels.noteLabel}：${note}）`;
    } else if (choice) {
      tail = choice;
    } else if (note) {
      tail = `${labels.noteLabel}：${note}`;
    } else {
      tail = "—";
    }

    lines.push(`- ${question.header}：${tail}`);
  }

  if (lines.length === 0) return "已提交选择";
  return ["已选择", ...lines].join("\n");
}
