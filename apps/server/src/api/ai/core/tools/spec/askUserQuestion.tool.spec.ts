import { describe, expect, it } from '@jest/globals';
import type { AiToolContext } from '../../tool.types';
import { askUserQuestionTool } from '../askUserQuestion.tool';

const input = {
  questions: [
    {
      id: 'availability',
      header: '训练安排',
      question: '你每周可以训练几天？',
      options: [
        { value: 'three', label: '3 天' },
        { value: 'four', label: '4 天' },
      ],
    },
  ],
};

describe('ask_user_question response boundary', () => {
  it('keeps a self-identified new-plan question with its active workflow', async () => {
    for (const metadata of [{ source: 'plan-builder' }, { skill: 'plan-builder' }]) {
      const question = { ...input, metadata };
      expect(await askUserQuestionTool.checkPermissions!({} as AiToolContext, question))
        .toMatchObject({ ok: false, code: 'ACTIVE_SKILL_REQUIRED' });
      expect(await askUserQuestionTool.checkPermissions!({ activeSkillName: 'plan-builder' } as AiToolContext, question))
        .toMatchObject({ ok: true });
    }
    expect(await askUserQuestionTool.checkPermissions!({} as AiToolContext, input))
      .toMatchObject({ ok: true });
  });

  it('blocks another structured question after the athlete declined the set', async () => {
    const result = await askUserQuestionTool.validateInput?.(
      {
        questionResponse: { declinedAll: true, skippedQuestionIds: [] },
      } as AiToolContext,
      input,
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'USER_DECLINED_QUESTIONS',
    });
  });
});
