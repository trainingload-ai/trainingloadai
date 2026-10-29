import { trainingDataCoverageTool } from '../trainingDataCoverage.tool';

describe('trainingDataCoverageTool', () => {
  it('uses the signed-in user and bounded window', async () => {
    const snapshot = jest.fn(async () => ({
      kind: 'training_data_coverage' as const,
      asOf: '2026-10-26T08:00:00.000Z',
      window: { days: 42, since: '2026-09-14T08:00:00.000Z' },
      availableActivityImportMethods: {
        fileUpload: { enabled: true as const, formats: ['FIT', 'TCX', 'GPX'] },
        providers: [],
      },
      activities: {
        readyCount: 0,
        latestReadyAt: null,
        bySource: [],
        processing: [],
      },
      imports: { activeBatchCount: 0, recentBatches: [] },
      integrations: [],
      signals: {
        hasConnectedActivityImport: false,
        hasAutomaticActivityImport: false,
        hasRecentFileImport: false,
        syncInProgress: false,
        syncError: false,
        activityProcessingPending: false,
      },
    }));
    const ctx = {
      session: { user: { id: 'user-1' } },
      currentTurnStartedAt: new Date('2026-10-26T08:00:00.000Z'),
      trainingDataCoverage: { snapshot },
    };

    const output = await trainingDataCoverageTool.execute(ctx as never, {
      windowDays: 42,
    });

    expect(output).toMatchObject({
      kind: 'training_data_coverage',
      activities: { readyCount: 0, latestReadyAt: null },
      integrations: [],
    });
    expect(snapshot).toHaveBeenCalledWith({
      userId: 'user-1',
      windowDays: 42,
      now: new Date('2026-10-26T08:00:00.000Z'),
    });
  });
});
