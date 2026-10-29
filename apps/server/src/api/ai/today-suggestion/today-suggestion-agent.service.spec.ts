import { TodaySuggestionAgentService } from './today-suggestion-agent.service';
import type { TodaySuggestionConstraintProjection } from './today-suggestion.types';

describe('TodaySuggestionAgentService', () => {
  it('uses the normal background Agent loop and readiness skill with progressive tools', async () => {
    const runBackgroundCoachTask = jest.fn(async (input) => ({
      result: input.validateResult({
        headline: 'Check the data connection',
        summary: 'No current activities are available yet.',
        recommendation: { kind: 'SYNC_DATA' },
        confidence: 'LOW',
        evidenceCodes: ['NEVER_RECORDED_ACTIVITY'],
        preferredIntent: 'OPEN_PROVIDER_SETTINGS',
        secondaryIntents: ['OPEN_IMPORT'],
        tags: ['Data needed'],
      }),
      provider: 'test',
      model: 'test-model',
      runId: 'run-1',
      operationId: 'operation-1',
      replayed: false,
    }));
    const service = new TodaySuggestionAgentService({
      runBackgroundCoachTask,
    } as never);
    const projection = {
      userId: 'user-1',
      locale: 'en',
      date: '2026-10-28',
      factHash: 'fact',
      constraintHash: 'constraint',
      continuityHash: 'continuity',
      constraints: ['NEVER_RECORDED_ACTIVITY'],
      requiredToolNames: ['training.data_coverage'],
      lightContext: { constraints: ['NEVER_RECORDED_ACTIVITY'] },
      highConcern: false,
      pendingInquiry: null,
      todayWorkouts: [],
    } as TodaySuggestionConstraintProjection;

    await expect(
      service.run({ projection, continuityStage: 3 }),
    ).resolves.toMatchObject({ runId: 'run-1' });
    expect(runBackgroundCoachTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'TODAY_SUGGESTION',
        activeSkillName: 'readiness-check',
        funding: 'PLATFORM',
        requiredToolNames: ['training.data_coverage'],
        allowedToolNames: expect.arrayContaining([
          'training.readiness',
          'integration.status',
          'plan.execution_context',
        ]),
        instructions: expect.stringContaining('Identify one real barrier'),
      }),
    );
    expect(runBackgroundCoachTask.mock.calls[0][0].instructions).toContain(
      'Allowed intent names: OPEN_TODAY_WORKOUT',
    );
    expect(runBackgroundCoachTask.mock.calls[0][0].instructions).toContain(
      'whole-day recommendation',
    );
    expect(runBackgroundCoachTask.mock.calls[0][0].instructions).toContain(
      'do not quote the clock time',
    );
    expect(runBackgroundCoachTask.mock.calls[0][0].instructions).toContain(
      'must never become the subject',
    );
    expect(runBackgroundCoachTask.mock.calls[0][0].instructions).toContain(
      'dedicated workout-generator skill',
    );
    expect(runBackgroundCoachTask.mock.calls[0][0].instructions).not.toContain(
      '"workoutProposal"',
    );
  });
});
