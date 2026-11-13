import {
  AthleteStateDecisionReadiness,
  AthleteStateStatus,
} from '@prisma/client';
import { AthleteStateModelService } from './athlete-state-model.service';

describe('AthleteStateModelService unified Agent execution', () => {
  it('runs assessment through the background ToolLoopAgent without duplicating executor usage', async () => {
    const consent = { assertGranted: jest.fn().mockResolvedValue(undefined) };
    const usage = { recordUsageEvent: jest.fn().mockResolvedValue(undefined) };
    const runBackgroundCoachTask = jest.fn(async (input) => ({
      result: input.validateResult({
        state: AthleteStateStatus.UNKNOWN,
        confidence: 0.9,
        decisionReadiness: AthleteStateDecisionReadiness.WAITING_FOR_SYNC,
        dimensions: [],
        hypotheses: [],
        evidenceRequests: [],
        safetyFlags: [],
        limitations: ['Waiting for authoritative activity data.'],
      }),
      usage: {
        inputTokens: 20,
        outputTokens: 10,
        cachedInputTokens: 0,
        totalTokens: 30,
        reported: true,
      },
      provider: 'test-provider',
      model: 'test-model',
      runId: 'run-1',
      operationId: 'operation-1',
      replayed: false,
    }));
    const service = new AthleteStateModelService(
      consent as never,
      { runBackgroundCoachTask } as never,
    );

    const response = await service.assess({
      userId: 'user-1',
      evidenceHash: 'evidence-1',
      snapshot: {} as never,
      language: 'zh',
    });

    expect(response.result).toMatchObject({
      state: AthleteStateStatus.UNKNOWN,
      confidence: 0.49,
      decisionReadiness: AthleteStateDecisionReadiness.WAITING_FOR_SYNC,
    });
    expect(runBackgroundCoachTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'ATHLETE_STATE_ASSESSMENT',
        activeSkillName: 'readiness-check',
        lang: 'zh',
        allowedToolNames: expect.arrayContaining([
          'training.data_coverage',
          'integration.status',
        ]),
      }),
    );
    expect(usage.recordUsageEvent).not.toHaveBeenCalled();
    expect(runBackgroundCoachTask).toHaveBeenCalledWith(
      expect.objectContaining({ funding: 'PLATFORM' }),
    );
  });
});
