const HAN_RE = /[\u3400-\u9fff]/u;
const LATIN_WORD_RE = /[A-Za-z]+(?:['’][A-Za-z]+)?/g;

function normalizedLocale(locale: string) {
  return locale.trim().toLowerCase().replace(/_/g, "-");
}

export function coachReplyLanguageName(locale: string) {
  const value = normalizedLocale(locale);
  if (value === "zh-hant" || value.startsWith("zh-hant-")) {
    return "Traditional Chinese (繁體中文)";
  }
  if (value === "zh" || value.startsWith("zh-")) {
    return "Simplified Chinese (简体中文)";
  }
  if (value.startsWith("ja")) return "Japanese (日本語)";
  if (value.startsWith("ko")) return "Korean (한국어)";
  if (value.startsWith("fr")) return "French (français)";
  if (value.startsWith("de")) return "German (Deutsch)";
  if (value.startsWith("es")) return "Spanish (español)";
  if (value.startsWith("it")) return "Italian (italiano)";
  if (value.startsWith("pt")) return "Brazilian Portuguese (português do Brasil)";
  return "English";
}

export function coachReplyLanguageInstruction(locale: string) {
  const language = coachReplyLanguageName(locale);
  return [
    `The required athlete-facing language for this turn is ${language}.`,
    `Write every athlete-facing prose sentence, heading, transition, and question in ${language}.`,
    `The system prompt, skill instructions, and tool data may be in English; that never permits an English preface or progress narration in a non-English reply.`,
    `Keep only proper names, standard metric abbreviations, units, and text the athlete explicitly asked to quote in their original form.`,
  ];
}

function looksLikeEnglishProse(value: string) {
  if (!value.trim() || value.includes("```")) return false;
  const words = value.match(LATIN_WORD_RE) ?? [];
  return words.length >= 5;
}

function lastParagraphBoundaryBefore(value: string, index: number) {
  const prefix = value.slice(0, index);
  const matches = [...prefix.matchAll(/\n[\t ]*\n/g)];
  const last = matches.at(-1);
  if (!last || last.index == null) return null;
  return {
    start: last.index,
    end: last.index + last[0].length,
  };
}

/**
 * The coach occasionally copies an English process sentence into a Chinese
 * reply because its internal instructions and tool descriptions are English.
 * Remove that prose at the server boundary and when old history is read.
 * Metric abbreviations, units, code blocks, and short labels remain intact.
 */
export function sanitizeCoachAssistantTextForLocale(
  text: string,
  locale: string,
) {
  const value = String(text ?? "");
  const normalized = normalizedLocale(locale);
  if (!normalized.startsWith("zh") || !value.trim()) return value;

  const firstHan = value.search(HAN_RE);
  if (firstHan < 0) {
    return looksLikeEnglishProse(value) ? "" : value;
  }

  const boundary = lastParagraphBoundaryBefore(value, firstHan);
  if (!boundary) return value;
  const leadingBlock = value.slice(0, boundary.start).trim();
  if (!looksLikeEnglishProse(leadingBlock) || HAN_RE.test(leadingBlock)) {
    return value;
  }
  return value.slice(boundary.end).trimStart();
}
