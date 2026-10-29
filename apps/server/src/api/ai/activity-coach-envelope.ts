import { ACTIVITY_COACH_MARKDOWN_FORMAT } from './activity-coach.constants';

export {
  compileActivityCoachMessages,
  formatActivityCoachCompiledPromptLog,
  buildActivityCoachSystemPrompt,
} from './core/prompt-contracts/activity-coach.contract';

export type ActivityCoachMarkdownEnvelope = {
  format: typeof ACTIVITY_COACH_MARKDOWN_FORMAT;
  byLang: Record<string, string>;
};

export function isActivityCoachMarkdownEnvelope(
  value: unknown,
): value is ActivityCoachMarkdownEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  return (
    o.format === ACTIVITY_COACH_MARKDOWN_FORMAT &&
    typeof o.byLang === 'object' &&
    o.byLang !== null &&
    !Array.isArray(o.byLang)
  );
}
/**
 * 将存储的教练 Markdown 内容转换为字符串。
 * @param content - 内容。
 * @returns 转换后的字符串。
 */
export function readStoredCoachMarkdown(
  content: unknown,
  language?: string,
): string | null {
  if (!content) return null;
  if (typeof content === 'string') {
    const t = content.trim();
    return t ? t : null;
  }
  if (isActivityCoachMarkdownEnvelope(content)) {
    const requested = language?.trim();
    if (requested) {
      const exact = content.byLang[requested];
      if (typeof exact === 'string' && exact.trim()) return exact.trim();
      const family = requested.toLowerCase().startsWith('zh') ? 'zh' : 'en';
      const fallback = content.byLang[family];
      if (typeof fallback === 'string' && fallback.trim()) {
        return fallback.trim();
      }
    }
    for (const text of Object.values(content.byLang)) {
      if (typeof text === 'string' && text.trim()) {
        return text.trim();
      }
    }
  }
  return null;
}

export function markdownPlainSummary(markdown: string, maxLen = 280): string {
  const plain = String(markdown ?? '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen)}…`;
}

export function firstLineVerdict(markdown: string): string {
  const line = String(markdown ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find(Boolean);
  return line ? line.slice(0, 500) : '';
}
