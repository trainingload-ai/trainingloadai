import {
  isCoachPublicReasoningSummary,
  type CoachPublicReasoningSummary,
} from '@shared/ai-coach-run-contract';
import { sanitizeCoachAssistantTextForLocale } from '@shared/coach-reply-language';
import { inspectCoachVisibleText } from './coach-visible-output-policy';

/** Defense in depth, not a declassifier for arbitrary provider reasoning. */
export function sanitizeCoachPublicSummary(
  value: unknown,
  lang?: string,
): CoachPublicReasoningSummary | undefined {
  if (!isCoachPublicReasoningSummary(value)) return undefined;
  const text = (
    lang ? sanitizeCoachAssistantTextForLocale(value.text, lang) : value.text
  ).trim();
  if (!text || !inspectCoachVisibleText(text).safe) return undefined;
  // This channel is a short plain-language explanation, not code, links,
  // credentials, contact details, hidden instructions or raw tool payloads.
  if (
    /[<>{}]|```|https?:\/\/|\b(?:system prompt|developer message|reasoning_content|api[_ -]?key|authorization|bearer|password|access[_ -]?token|refresh[_ -]?token|sk-[a-z0-9])\b|(?:系统提示词|开发者指令|内部推理|隐藏指令)|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]{20,}\b/iu.test(
      text,
    )
  )
    return undefined;
  return { source: 'assistant_public_summary', text };
}

/** Only ordinary, explicitly athlete-facing model output is eligible. */
export function coachPublicSummaryFromText(text: string, lang: string) {
  return sanitizeCoachPublicSummary(
    { source: 'assistant_public_summary', text },
    lang,
  );
}
