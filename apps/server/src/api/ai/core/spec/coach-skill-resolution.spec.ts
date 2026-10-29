import { describe, expect, it } from '@jest/globals';
import {
  hasCoachQuestionReplyToolResult,
  resolveCoachActiveSkill,
} from '../coach-skill-resolution';

describe('coach skill resolution', () => {
  it('does not invent a plan task from an unbound question reply', () => {
    const activeSkill = resolveCoachActiveSkill({
      prompt: '你的选择\n- 目标: 首马',
      message: {
        content: [
          { type: 'text', text: '你的选择\n- 目标: 首马' },
          {
            type: 'tool_result',
            tool_use_id: 'assistant-msg-1',
            content: {
              kind: 'coach_question_reply',
              repliesToAssistantMessageId: 'assistant-msg-1',
              answers: { goal: 'first_marathon' },
              notes: {},
            },
          },
        ],
      },
    });

    expect(activeSkill).toBeNull();
  });

  it('keeps explicit intent when no structured reply is present', () => {
    const activeSkill = resolveCoachActiveSkill({
      prompt: '帮我做一个 12 周全马计划',
      intent: 'plan-builder',
    });

    expect(activeSkill?.name).toBe('plan-builder');
  });

  it('keeps an explicit product entry as warm-start guidance', () => {
    const activeSkill = resolveCoachActiveSkill({
      prompt: 'Enviar para meu gps Garmin Edge 540',
      intent: 'plan-followup',
    });

    expect(activeSkill?.name).toBe('plan-followup');
  });

  it('restores the question owner rather than a stale entry hint', () => {
    expect(
      resolveCoachActiveSkill({
        prompt: '只是轻松骑',
        intent: 'plan-builder',
        restoredSkill: 'fitness-assessment',
      })?.name,
    ).toBe('fitness-assessment');
  });
  it('does not use regex rules to override restored task ownership', () => {
    expect(
      resolveCoachActiveSkill({
        prompt: '帮我做一个 12 周全马计划',
        intent: 'fitness-assessment',
        restoredSkill: 'fitness-assessment',
      })?.name,
    ).toBe('fitness-assessment');
  });
  it('leaves ordinary language unclassified for model-led routing', () => {
    expect(
      resolveCoachActiveSkill({
        prompt: '9 月 30 日帮我新增一节骑行测试 Workout',
      }),
    ).toBeNull();
  });
  it('detects coach question reply tool results', () => {
    expect(
      hasCoachQuestionReplyToolResult({
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'assistant-msg-1',
            content: { kind: 'coach_question_skip' },
          },
        ],
      }),
    ).toBe(true);
  });
});
