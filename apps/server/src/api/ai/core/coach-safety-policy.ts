import type { CoachQueryYield } from './coach-query-yield';
import type { I18nService } from 'nestjs-i18n';
import { resolveSupportedLocale } from '@/utils/locale.util';
import { isCoachUiSurfaceToolName } from './coach-message.util';

export function resolveCoachReplyLanguage(
  prompt: string,
  preference: string,
): string {
  const explicit = [
    [
      'zh',
      /(?:用|说|使用|请讲)\s*(?:简体)?中文|(?:reply|respond|answer) in (?:simplified )?chinese/i,
    ],
    ['en', /(?:用|说|使用)\s*英语|(?:reply|respond|answer) in english/i],
    ['fr', /(?:用|说)法语|(?:reply|respond|answer) in french/i],
    ['de', /(?:用|说)德语|(?:reply|respond|answer) in german/i],
  ] as const;
  for (const [lang, pattern] of explicit) if (pattern.test(prompt)) return lang;
  if (/[\uac00-\ud7af]/.test(prompt)) return 'ko';
  if (
    !/[\u3040-\u30ff]/.test(prompt) &&
    (prompt.match(/[\u4e00-\u9fff]/g)?.length ?? 0) >= 2
  )
    return 'zh';
  if (
    /\b(i am|i have|my shoulder|my neck|should i|can you|please|could you)\b/i.test(
      prompt,
    )
  )
    return 'en';
  return resolveSupportedLocale(preference);
}

/** Narrow deterministic handling of explicit current red flags, not a diagnostic classifier. */
export function coachSafetyConcern(
  prompt: string,
): 'urgent_pain' | 'open_water' | 'high_volume' | null {
  const clauses = prompt.split(/[。！？!?;；\n]/);
  if (
    clauses.some((clause) => {
      const symptoms = clause.replace(
        /(?:没有|没|无|不再)(?:剧烈)?(?:胸痛|疼痛|麻木)|\b(?:no|without|no longer) (?:severe |sudden )?(?:(?:shoulder |neck |chest )?pain|numbness)\b/gi,
        '',
      );
      return /(?:疼|痛)[\s\S]{0,24}(?:起不来床|不能(?:活动|动|走)|无法(?:活动|动|走))|(?:胸痛|胸口痛)[\s\S]{0,24}(?:呼吸困难|喘不过气)|\b(?:severe|sudden) (?:shoulder|neck|chest) pain\b|\bpain[\s\S]{0,40}(?:cannot|can't|unable to) (?:move|get out of bed)\b/i.test(
        symptoms,
      );
    })
  )
    return 'urgent_pain';
  if (
    /开放水域|公开水域|野泳|海泳|\bopen[- ]water\b|águas abertas|aguas abiertas|eau libre|acque libere|freiwasser|야외 수영/i.test(
      prompt,
    )
  )
    return 'open_water';
  const hours =
    prompt.match(
      /(?:每天|每日)[\s\S]{0,16}?(\d+(?:\.\d+)?|两|二|三)\s*(?:个)?小时/,
    )?.[1] ??
    prompt.match(
      /\b(\d+(?:\.\d+)?|two|three) hours? (?:every|a|per) day\b/i,
    )?.[1];
  const dailyHours =
    ({ 两: 2, 二: 2, 三: 3, two: 2, three: 3 } as Record<string, number>)[
      hours?.toLowerCase() ?? ''
    ] ?? Number(hours);
  if (dailyHours >= 2) return 'high_volume';
  return null;
}

export async function* urgentCoachSafetyReply(
  i18n: I18nService,
  lang: string,
): AsyncGenerator<CoachQueryYield> {
  const text = String(i18n.t('common.coach_safety.urgent_pain', { lang }));
  yield { type: 'stream_event', event: { type: 'text_delta', text } };
  yield { type: 'result', subtype: 'success', is_error: false, result: text };
}

/** Add a product safety reminder only to a delivered successful answer, never mask an empty/error turn. */
export async function* withCoachSafetyReminder(
  source: AsyncGenerator<CoachQueryYield, void, undefined>,
  notice: string | null,
): AsyncGenerator<CoachQueryYield, void, undefined> {
  let delivered = false;
  for await (const event of source) {
    if (
      event.type === 'stream_event' &&
      event.event.type === 'text_delta' &&
      event.event.text.trim()
    )
      delivered = true;
    if (
      event.type === 'assistant' &&
      event.message.content.some(
        (b) => b.type === 'tool_use' && isCoachUiSurfaceToolName(b.name),
      )
    )
      delivered = true;
    if (event.type === 'result' && !event.is_error && delivered && notice) {
      yield {
        type: 'stream_event',
        event: { type: 'text_delta', text: `\n\n${notice}` },
      };
    }
    yield event;
  }
}
