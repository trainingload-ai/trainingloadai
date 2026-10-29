import { createHash } from 'node:crypto';
import {
  ACTIVITY_AI_REVIEW_PROMPT_VERSION,
  ACTIVITY_COACH_EVIDENCE_VERSION,
} from './activity-coach.constants';
import { resolveSupportedLocale } from '@/utils/locale.util';

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** 与 SSE / Worker 共用：同一 unified 输入 + 语言 → 同一 dedupe 行。 */
export async function hashActivityCoachDedupe(args: {
  unifiedInput: unknown;
  lang: string;
}): Promise<string> {
  const payload = {
    evidenceVersion: ACTIVITY_COACH_EVIDENCE_VERSION,
    promptVersion: ACTIVITY_AI_REVIEW_PROMPT_VERSION,
    lang: resolveSupportedLocale(args.lang),
    unifiedInput: args.unifiedInput,
  };
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}
