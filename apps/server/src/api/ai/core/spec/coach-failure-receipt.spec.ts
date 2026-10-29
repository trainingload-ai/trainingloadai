import { describe, expect, it } from '@jest/globals';
import { AiCoachMessageRole } from '@prisma/client';
import {
  buildCoachFailureReceipt,
  coachFailureReceiptContext,
} from '../coach-failure-receipt';
import { buildHistoryMessages } from '../coach-history-messages';

function failedRunEnvelope() {
  const providerHistory = [
    {
      role: 'ASSISTANT' as const,
      content: '',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'weight-1',
            name: 'mutation_user_body_weight',
            input: { value: 75, unit: 'kg' },
          },
          {
            type: 'tool_use',
            id: 'draft-1',
            name: 'present_coach_plan_draft',
            input: { private: 'large raw plan payload' },
          },
        ],
      },
    },
    {
      role: 'USER' as const,
      content: '',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'weight-1',
            content: JSON.stringify({
              kind: 'mutation_applied',
              ok: true,
              actionId: 'private-action-id',
              type: 'USER_BODY_METRIC_UPDATE',
              summary: '已记录 2026-10-20 的体重：75 kg。',
              payload: {
                valueKg: 75,
                effectiveDate: '2026-10-20',
                changed: true,
              },
            }),
          },
          {
            type: 'tool_result',
            tool_use_id: 'draft-1',
            is_error: true,
            content: JSON.stringify({
              error: 'private detailed validator output',
              code: 'PLAN_QUALITY_INVALID',
              stage: 'validate_input',
            }),
          },
        ],
      },
    },
  ];
  const receipt = buildCoachFailureReceipt({
    outcome: 'failed',
    providerHistory,
    terminal: {
      code: 'invalid_plan_draft_payload',
      message: '计划草案未能通过完整性检查。',
    },
  });
  return {
    kind: 'ui_message' as const,
    version: 2 as const,
    role: 'assistant' as const,
    parts: [],
    providerReplay: false,
    providerHistory,
    failureReceipt: receipt,
  };
}

describe('coach failed-run receipt', () => {
  it('retains committed changes and failed artifact facts without raw inputs or ids', () => {
    const envelope = failedRunEnvelope();
    expect(envelope.failureReceipt).toEqual({
      version: 1,
      outcome: 'failed',
      terminal: {
        code: 'invalid_plan_draft_payload',
        message: '计划草案未能通过完整性检查。',
      },
      completedChanges: [
        {
          type: 'USER_BODY_METRIC_UPDATE',
          summary: '已记录 2026-10-20 的体重：75 kg。',
          bodyWeight: {
            valueKg: 75,
            effectiveDate: '2026-10-20',
            changed: true,
          },
        },
      ],
      planDraft: {
        attempts: 1,
        produced: false,
        reason: 'QUALITY_CONSTRAINTS',
      },
    });
    expect(JSON.stringify(envelope.failureReceipt)).not.toContain(
      'private-action-id',
    );
    expect(JSON.stringify(envelope.failureReceipt)).not.toContain(
      'large raw plan payload',
    );
    expect(JSON.stringify(envelope.failureReceipt)).not.toContain(
      'private detailed validator output',
    );
  });

  it('injects only the sanitized latest receipt into the next model turn', () => {
    const envelope = failedRunEnvelope();
    const messages = buildHistoryMessages({
      provider: 'deepseek',
      thinking: false,
      currentUserMessage: {
        content: [{ type: 'text', text: '为什么失败？' }],
      },
      rows: [
        {
          role: AiCoachMessageRole.USER,
          content: '75 kg，帮我制定计划',
          message: null,
        },
        {
          role: AiCoachMessageRole.ASSISTANT,
          content: '计划草案未能通过完整性检查。',
          message: envelope,
        },
      ],
    });
    const serialized = JSON.stringify(messages);
    expect(serialized).toContain('体重：75 kg');
    expect(serialized).toContain('submitted 1 time(s)');
    expect(serialized).toContain('No plan draft was produced or persisted');
    expect(serialized).toContain('为什么失败？');
    expect(serialized).not.toContain('private-action-id');
    expect(serialized).not.toContain('large raw plan payload');
    expect(serialized).not.toContain('private detailed validator output');
  });

  it('tells the model not to invent facts missing from the receipt', () => {
    expect(
      coachFailureReceiptContext(failedRunEnvelope().failureReceipt),
    ).toContain('say you cannot verify it instead of guessing');
  });

  it('does not revive an old failure receipt after a later successful reply', () => {
    const messages = buildHistoryMessages({
      provider: 'deepseek',
      thinking: false,
      currentUserMessage: {
        content: [{ type: 'text', text: '继续' }],
      },
      rows: [
        {
          role: AiCoachMessageRole.ASSISTANT,
          content: '计划草案未能通过完整性检查。',
          message: failedRunEnvelope(),
        },
        {
          role: AiCoachMessageRole.USER,
          content: '再试一次',
          message: null,
        },
        {
          role: AiCoachMessageRole.ASSISTANT,
          content: '新的计划草案已经生成。',
          message: {
            kind: 'ui_message',
            version: 2,
            role: 'assistant',
            parts: [{ type: 'text', text: '新的计划草案已经生成。' }],
            providerReplay: true,
          },
        },
      ],
    });

    expect(JSON.stringify(messages)).not.toContain('previous_run_receipt');
    expect(JSON.stringify(messages)).not.toContain('submitted 1 time(s)');
  });
});
