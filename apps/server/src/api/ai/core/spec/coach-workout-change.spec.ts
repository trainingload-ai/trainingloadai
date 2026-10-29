import { describe, expect, it, jest } from '@jest/globals';
import {
  currentDecisionConfirmationId,
  hasCurrentDecisionConfirmation,
  workoutChangeDiff,
} from '../coach-workout-change';
import { coachDecisionApplyTool } from '../tools/coachDecisionApply.tool';
import { coachDecisionPreviewRows } from '@shared/coach-decision-preview';

describe('decision confirmation and factual diff', () => {
  it.each(['确认应用', '可以', '好的', 'Yes, apply it'])(
    'accepts explicit current confirmation %s',
    (text) => expect(hasCurrentDecisionConfirmation(text, text)).toBe(true),
  );
  it.each([
    '先不应用',
    '不要执行',
    '可以先看看吗？',
    '是否可以应用',
    'Yes, but not now',
    'maybe apply it',
    'if it is safe, apply it',
  ])('rejects negated/conditional/question %s', (text) =>
    expect(hasCurrentDecisionConfirmation(text, text)).toBe(false),
  );
  it('rejects fabricated paraphrases and old-turn consent', () =>
    expect(hasCurrentDecisionConfirmation('讲讲这个方案', '确认应用')).toBe(
      false,
    ));
  it('rejects unconfirmed apply even when execute is called directly', async () => {
    const approveDecision = jest.fn();
    await expect(
      coachDecisionApplyTool.execute(
        {
          session: { user: { id: 'u' } },
          branchId: 'b',
          currentUserPrompt: '别改',
          coachBranching: { approveDecision },
        } as never,
        { decisionId: 'd', userConfirmation: '确认应用' },
      ),
    ).rejects.toThrow();
    expect(approveDecision).not.toHaveBeenCalled();
  });
  it('a native card confirmation authorizes only that exact decision', async () => {
    const id = currentDecisionConfirmationId({
      content: [
        {
          type: 'tool_result',
          content: { kind: 'coach_decision_confirmation', decisionId: 'd' },
        },
      ],
    });
    expect(id).toBe('d');
    expect(
      await coachDecisionApplyTool.validateInput!(
        { confirmedDecisionId: id } as never,
        { decisionId: 'other', userConfirmation: '确认' },
      ),
    ).toMatchObject({ ok: false });
    const approveDecision = jest.fn(async () => ({}));
    const applyDecision = jest.fn(async () => ({
      result: 'APPLIED',
      branch: { id: 'b' },
      receipt: { changedWorkoutCount: 2 },
    }));
    const result = await coachDecisionApplyTool.execute(
      {
        session: { user: { id: 'u' } },
        confirmedDecisionId: id,
        coachBranching: { approveDecision, applyDecision },
      } as never,
      { decisionId: 'd', userConfirmation: '' },
    );
    expect(result).toMatchObject({
      result: 'APPLIED',
      receipt: { changedWorkoutCount: 2 },
    });
  });
  it('ignores internal/private fields and preserves actual before/after', () => {
    const fields = workoutChangeDiff(
      { text: 'work 30m', token: 'secret' },
      { text: 'work 20m', token: 'other' },
    );
    expect(fields).toEqual([
      { field: 'text', before: 'work 30m', after: 'work 20m' },
    ]);
    expect(
      coachDecisionPreviewRows({
        changes: [
          {
            workoutId: 'internal-id',
            after: { weekIndex: 2, dayIndex: 3 },
            fields,
          },
        ],
      }),
    ).toEqual([
      {
        key: '0:0',
        position: '2 · 3 · 1',
        field: 'text',
        value: 'work 30m → work 20m',
      },
    ]);
    expect(
      coachDecisionPreviewRows({
        verifiedChanges: [{ dto: { weekIndex: 3, dayIndex: 2 }, diff: fields }],
      }),
    ).toHaveLength(1);
  });
});
