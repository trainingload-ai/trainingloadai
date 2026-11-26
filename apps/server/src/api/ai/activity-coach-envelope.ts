import { ACTIVITY_COACH_MARKDOWN_FORMAT } from './activity-coach.constants';
import { CoachTaskResultValidationError } from './core/coach-task-result-error';
import { appLocaleEnglishName, resolveSupportedLocale } from '@/utils/locale.util';

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

export function activityReviewHasExpectedScript(markdown: string, language: string) {
  const prose = markdown
    .replace(/^(?: {0,3}>.*| {0,3}(?:```|~~~)[^\n]*\n[\s\S]*?^ {0,3}(?:```|~~~)[^\n]*)$/gm, '')
    .replace(/`[^`\n]+`|!?\[([^\]]+)\]\([^)]*\)/g, '$1');
  const latin = (prose.match(/\p{Script=Latin}/gu) ?? []).length;
  const han = (prose.match(/\p{Script=Han}/gu) ?? []).length;
  const kana = (prose.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length;
  const hangul = (prose.match(/\p{Script=Hangul}/gu) ?? []).length;
  const locale = resolveSupportedLocale(language);
  // Only reject a clear script mismatch. Proper names and short quoted labels
  // can legitimately use another script.
  switch (locale) {
    case 'zh':
    case 'zh-hant':
      return Math.max(latin, kana, hangul) < Math.max(15, han * 2);
    case 'ja':
      return Math.max(latin, hangul) < Math.max(15, (han + kana) * 2);
    case 'ko':
      return Math.max(latin, han + kana) < Math.max(15, hangul * 2);
    default:
      return han + kana + hangul < Math.max(12, latin * 2);
  }
}

export function validateActivityReviewMarkdown(content: unknown, language: string) {
  const markdown = typeof content === 'string' ? content.trim() : '';
  if (!markdown) throw new Error('Activity review markdown is required.');
  if (!activityReviewHasExpectedScript(markdown, language)) {
    throw new CoachTaskResultValidationError(
      'ACTIVITY_REVIEW_OUTPUT_REJECTED',
      'ACTIVITY_REVIEW_LANGUAGE_MISMATCH',
      `Rewrite the complete review, including all headings and prose, in ${appLocaleEnglishName(resolveSupportedLocale(language))}. Retain the activity facts, metric units and proper names.`,
    );
  }
  return markdown;
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
    return t && (!language || activityReviewHasExpectedScript(t, language)) ? t : null;
  }
  if (isActivityCoachMarkdownEnvelope(content)) {
    if (language?.trim()) {
      return readStoredCoachMarkdown(content.byLang[resolveSupportedLocale(language)], language);
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
