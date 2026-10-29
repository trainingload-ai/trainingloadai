import { coachTaskSubmitResultTool } from '../coachTaskSubmitResult.tool';

describe('coachTaskSubmitResultTool', () => {
  it('is hidden outside a server-owned background task', async () => {
    await expect(
      Promise.resolve(coachTaskSubmitResultTool.isEnabled?.({} as never)),
    ).resolves.toBe(false);
  });

  it('validates and forwards the structured result to the task sink', async () => {
    const submitResult = jest.fn(async () => undefined);
    const ctx = {
      backgroundTask: {
        taskType: 'ATHLETE_CHECK_IN',
        allowedToolNames: [],
        submitResult,
      },
    };

    const output = await coachTaskSubmitResultTool.execute(ctx as never, {
      result: { summary: '今天轻松训练。', tags: ['恢复'] },
    });

    expect(submitResult).toHaveBeenCalledWith({
      summary: '今天轻松训练。',
      tags: ['恢复'],
    });
    expect(output).toEqual({
      kind: 'coach_task_result_accepted',
      taskType: 'ATHLETE_CHECK_IN',
    });
  });

  it('rejects submission until every hard evidence tool has completed', () => {
    const completedToolNames = new Set<string>();
    const ctx = {
      backgroundTask: {
        taskType: 'TODAY_SUGGESTION',
        allowedToolNames: ['training.data_coverage'],
        requiredToolNames: ['training.data_coverage'],
        completedToolNames,
        submitResult: jest.fn(),
      },
    };
    const input = { result: { summary: '待判断', tags: [] } };

    expect(
      coachTaskSubmitResultTool.validateInput?.(ctx as never, input),
    ).toMatchObject({
      ok: false,
      code: 'REQUIRED_EVIDENCE_MISSING',
    });

    completedToolNames.add('training.data_coverage');
    expect(
      coachTaskSubmitResultTool.validateInput?.(ctx as never, input),
    ).toEqual({ ok: true });
  });
});
