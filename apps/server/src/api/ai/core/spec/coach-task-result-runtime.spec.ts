import { stopAfterCoachTaskResult } from '../tool-loop-agent.runtime';

describe('background coach task terminal result', () => {
  it('stops the ToolLoopAgent after an accepted task result', () => {
    expect(
      stopAfterCoachTaskResult({
        steps: [
          {
            toolResults: [
              {
                toolName: 'coach_task_submit_result',
                output: { kind: 'coach_task_result_accepted' },
              },
            ],
          },
        ],
      }),
    ).toBe(true);
  });

  it('does not stop for ordinary evidence tools', () => {
    expect(
      stopAfterCoachTaskResult({
        steps: [
          {
            toolResults: [
              {
                toolName: 'training.data_coverage',
                output: { kind: 'training_data_coverage' },
              },
            ],
          },
        ],
      }),
    ).toBe(false);
  });
});
