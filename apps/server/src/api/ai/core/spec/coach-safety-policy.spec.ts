import { describe, expect, it, jest } from '@jest/globals';
import {
  coachSafetyConcern,
  resolveCoachReplyLanguage,
  urgentCoachSafetyReply,
  withCoachSafetyReminder,
} from '../coach-safety-policy';
import type { CoachQueryYield } from '../coach-query-yield';
import { AiService } from '../../ai.service';

const success: CoachQueryYield = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: '',
};
async function* source(events: CoachQueryYield[]) {
  yield* events;
}
async function collect(events: AsyncIterable<CoachQueryYield>) {
  const result = [];
  for await (const e of events) result.push(e);
  return result;
}

describe('coach safety and current language', () => {
  it('does not let a negated symptom hide a different red flag or misread decimal hours', () => {
    expect(coachSafetyConcern('没有麻木，但疼得起不来床')).toBe('urgent_pain');
    expect(coachSafetyConcern('no severe shoulder pain')).toBeNull();
    expect(coachSafetyConcern('每天练1.5小时')).toBeNull();
    expect(coachSafetyConcern('每天练10小时')).toBe('high_volume');
  });
  it.each([
    ['肩胛骨疼，疼得起不来床，头不能前后挪动', 'en', 'zh'],
    ['My shoulder hurts and I cannot move it', 'zh', 'en'],
    ['请用英语回答我的肩痛问题', 'zh', 'en'],
    ['Please reply in Chinese', 'en', 'zh'],
    ['한국어로 답해주세요', 'en', 'ko'],
    ['FTP', 'fr', 'fr'],
  ])('resolves current language: %s', (prompt, preference, expected) =>
    expect(resolveCoachReplyLanguage(prompt, preference)).toBe(expected),
  );
  it.each([
    '肩胛骨疼，疼得起不来床，头不能前后挪动',
    'severe shoulder pain',
    'chest pain cannot move',
  ])('routes explicit red flags: %s', (prompt) =>
    expect(coachSafetyConcern(prompt)).toBe('urgent_pain'),
  );
  it.each(['没有疼痛，可以起床', 'no severe pain', '昨天轻微肩膀酸，今天好了'])(
    'does not escalate benign/negated reports: %s',
    (prompt) => expect(coachSafetyConcern(prompt)).toBeNull(),
  );
  it('detects water and high-volume contexts', () => {
    expect(coachSafetyConcern('明天开放水域游泳')).toBe('open_water');
    expect(coachSafetyConcern('每天骑两小时，心率低是不是安全')).toBe(
      'high_volume',
    );
  });
  it('localizes a deterministic answer without invoking an upstream or any workout mutation', async () => {
    const service = Object.create(AiService.prototype) as AiService;
    const assertGranted = jest.fn(async () => undefined);
    const t = jest.fn(() => '停止训练，尽快就医。');
    Object.assign(service, { aiDataConsent: { assertGranted }, i18n: { t } });
    const stream = await service.coachStream({
      session: { user: { id: 'u' } },
      lang: 'en',
      prompt: '疼得起不来床',
      signal: new AbortController().signal,
    } as never);
    expect(await collect(stream)).toHaveLength(2);
    expect(assertGranted).toHaveBeenCalledWith('u');
    expect(t).toHaveBeenCalledWith('common.coach_safety.urgent_pain', {
      lang: 'zh',
    });
  });
  it('keeps the consent boundary for deterministic replies', async () => {
    const service = Object.create(AiService.prototype) as AiService;
    Object.assign(service, {
      aiDataConsent: {
        assertGranted: async () => {
          throw new Error('consent');
        },
      },
    });
    await expect(
      service.coachStream({
        session: { user: { id: 'u' } },
        lang: 'zh',
        prompt: '疼得起不来床',
      } as never),
    ).rejects.toThrow('consent');
  });
  it('does not turn empty/error streams into successful reminder-only answers', async () => {
    expect(
      await collect(withCoachSafetyReminder(source([success]), 'notice')),
    ).toEqual([success]);
    const error = {
      ...success,
      subtype: 'error_during_execution',
      is_error: true,
    } as CoachQueryYield;
    const text = {
      type: 'stream_event',
      event: { type: 'text_delta', text: 'Answer' },
    } as CoachQueryYield;
    expect(
      await collect(withCoachSafetyReminder(source([text, error]), 'notice')),
    ).toEqual([text, error]);
    expect(
      await collect(withCoachSafetyReminder(source([text, success]), 'notice')),
    ).toContainEqual({
      type: 'stream_event',
      event: { type: 'text_delta', text: '\n\nnotice' },
    });
  });
  it('also adds a reminder after a delivered decision card', async () => {
    const card = {
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: '1', name: 'CoachDecisionDraft', input: {} },
        ],
      },
    } as CoachQueryYield;
    expect(
      await collect(withCoachSafetyReminder(source([card, success]), 'notice')),
    ).toHaveLength(3);
    expect(
      await collect(
        urgentCoachSafetyReply({ t: () => '中文提醒' } as never, 'zh'),
      ),
    ).toHaveLength(2);
  });
});
