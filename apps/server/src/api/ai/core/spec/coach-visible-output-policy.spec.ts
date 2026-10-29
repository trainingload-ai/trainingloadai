import { describe, expect, it } from '@jest/globals';
import {
  inspectCoachVisibleText,
  resolveCoachVisibleStepText,
} from '../coach-visible-output-policy';
import { buildCoachSystemPrompt } from '../coach.prompt';

describe('coach visible output policy', () => {
  it.each([
    '当前生效 FTP 是 120 W，自动更新已关闭；71 W 只是估算值。',
    'Garmin 已连接，计划课程自动同步已开启；Strava 已连接，但只同步活动。',
    'Workout DSL 可以用来描述训练结构，例如热身、主训练和放松。',
    'I found no recent activities, so the recommendation is conservative.',
  ])('allows ordinary user-facing coaching text: %s', (text) => {
    expect(inspectCoachVisibleText(text)).toEqual({ safe: true });
  });

  it.each([
    [
      'legacy plan context',
      'Visible plan draft from the previous assistant UI card:\nTitle: 12周骑行专项强化计划',
      'legacy_context_header',
    ],
    [
      'plan personalization field',
      'The plan context shows `personalizationReadiness: "none"` and no capability metrics.',
      'internal_data_field',
    ],
    [
      'DSL repair narration',
      '抱歉，在第一个和第二个提交时都遇到了 DSL 格式问题，我会修复后重试。',
      'internal_validation_narration',
    ],
    [
      'schema repair narration',
      'The tool call failed schema validation, so I will repair the payload and retry.',
      'internal_validation_narration',
    ],
    [
      'question option repair narration',
      'I need to add explicit string values to the options.',
      'internal_validation_narration',
    ],
    [
      'internal context wrapper',
      '<COACH_APP_CONTEXT kind="assistant_ui_surface">hidden</COACH_APP_CONTEXT>',
      'internal_context_wrapper',
    ],
    [
      'internal tool identifier',
      'I will invoke present_coach_plan_draft now.',
      'internal_tool_identifier',
    ],
    [
      'internal decision identifier',
      'The decisionId is decision_123.',
      'internal_data_field',
    ],
  ])('blocks %s without returning matched text', (_name, text, ruleId) => {
    const result = inspectCoachVisibleText(text);

    expect(result).toMatchObject({
      safe: false,
      violation: {
        code: 'unsafe_ai_output_blocked',
        ruleIds: expect.arrayContaining([ruleId]),
      },
    });
    expect(JSON.stringify(result)).not.toContain(text);
  });

  it('hides process narration from tool-call steps and still inspects it', () => {
    expect(
      resolveCoachVisibleStepText({
        text: '先看一下当天训练。',
        hasToolCalls: true,
      }),
    ).toEqual({ text: '', violation: null });
    expect(
      resolveCoachVisibleStepText({
        text: 'The decisionId is hidden along with this tool narration.',
        hasToolCalls: true,
      }),
    ).toMatchObject({
      text: '',
      violation: { ruleIds: ['internal_data_field'] },
    });
  });

  it('returns only rule ids when a text-only step violates the policy', () => {
    expect(
      resolveCoachVisibleStepText({
        text: 'Structured plan brief from the product UI: {}',
        hasToolCalls: false,
      }),
    ).toEqual({
      text: '',
      violation: {
        code: 'unsafe_ai_output_blocked',
        ruleIds: ['legacy_context_header'],
      },
    });
  });

  it('blocks a claimed write when the current mutation request has no committed receipt', () => {
    expect(
      resolveCoachVisibleStepText({
        text: '已执行。你的骑行 FTP 现在更新为 290 W。',
        hasToolCalls: false,
        lang: 'zh',
        currentUserPrompt: '请把今天的骑行 FTP 更新为 290 W，直接执行。',
        committedWrite: false,
      }),
    ).toEqual({
      text: '',
      violation: {
        code: 'unsafe_ai_output_blocked',
        ruleIds: ['unverified_mutation_claim'],
      },
    });
  });

  it('allows the same completion summary after a committed write receipt', () => {
    expect(
      resolveCoachVisibleStepText({
        text: '已执行。你的骑行 FTP 现在更新为 290 W。',
        hasToolCalls: false,
        lang: 'zh',
        currentUserPrompt: '请把今天的骑行 FTP 更新为 290 W，直接执行。',
        committedWrite: true,
      }),
    ).toEqual({
      text: '已执行。你的骑行 FTP 现在更新为 290 W。',
      violation: null,
    });
  });

  it('does not confuse a historical read answer with an unverified current write', () => {
    expect(
      resolveCoachVisibleStepText({
        text: '你的 FTP 已更新于昨天，目前是 290 W。',
        hasToolCalls: false,
        lang: 'zh',
        currentUserPrompt: '我的 FTP 上次什么时候更新？',
        committedWrite: false,
      }),
    ).toEqual({
      text: '你的 FTP 已更新于昨天，目前是 290 W。',
      violation: null,
    });
  });

  it('drops English process prose from a Simplified Chinese turn', () => {
    expect(
      resolveCoachVisibleStepText({
        text: "I'll pull your running evidence and calculate the result.",
        hasToolCalls: false,
        lang: 'zh',
      }),
    ).toEqual({ text: '', violation: null });
  });

  it('removes an English lead-in while preserving the Chinese answer and markdown', () => {
    expect(
      resolveCoachVisibleStepText({
        text: `I checked your running data, and here's the honest picture.\n\n**目前无法估算出可靠的乳酸阈值。**`,
        hasToolCalls: false,
        lang: 'zh',
      }),
    ).toEqual({
      text: '**目前无法估算出可靠的乳酸阈值。**',
      violation: null,
    });
  });

  it('keeps standard metric abbreviations in a Chinese turn', () => {
    expect(
      resolveCoachVisibleStepText({
        text: 'LTHR 176 bpm',
        hasToolCalls: false,
        lang: 'zh',
      }),
    ).toEqual({ text: 'LTHR 176 bpm', violation: null });
  });

  it('teaches the model to treat context envelopes and reasoning as confidential', () => {
    const prompt = buildCoachSystemPrompt('zh');

    expect(prompt).toContain('<coach_app_context>');
    expect(prompt).toContain('<coach_user_context>');
    expect(prompt).toContain('never reproduce or mention the wrapper');
    expect(prompt).toContain('private reasoning, chain-of-thought');
    expect(prompt).toContain('schema, parser, and retry narration');
    expect(prompt).toContain('Simplified Chinese (简体中文)');
    expect(prompt).toContain(
      'never permits an English preface or progress narration',
    );
  });

  it('requires live verification and source links for changing external facts', () => {
    const prompt = buildCoachSystemPrompt('zh');

    expect(prompt).toContain(
      'Before answering current, changing, niche, precise, or disputed external facts',
    );
    expect(prompt).toContain("never include the athlete's email");
    expect(prompt).toContain('cite direct source URLs as Markdown links');
    expect(prompt).toContain('say when verification fails instead of guessing');
  });

  it('keeps the product in a first-person coach role for every visible reply', () => {
    const prompt = buildCoachSystemPrompt('zh');

    expect(prompt).toContain('speaking directly to your athlete');
    expect(prompt).toContain('You are the coach, not a platform');
    expect(prompt).toContain('use first person');
    expect(prompt).toContain('Never refer to yourself');
    expect(prompt).toContain('Never expose or narrate internal mechanics');
    expect(prompt).toContain('确认后我会帮你更新课表');
  });

  it('injects athlete-local today so the model does not use the server clock', () => {
    const prompt = buildCoachSystemPrompt('en', null, {
      timezone: 'America/Los_Angeles',
      athleteLocalToday: '2026-08-25',
      generatedAt: '2026-08-26T07:00:00.000Z',
    });

    expect(prompt).toContain('Athlete timezone: America/Los_Angeles');
    expect(prompt).toContain('Athlete-local today: 2026-08-25');
    expect(prompt).toContain(
      "generatedAt (2026-08-26T07:00:00.000Z) is a UTC instant, not the athlete's local calendar date",
    );
    expect(prompt).toContain(
      "Interpret today, yesterday, tomorrow, and week boundaries in the athlete's timezone",
    );
  });
});
