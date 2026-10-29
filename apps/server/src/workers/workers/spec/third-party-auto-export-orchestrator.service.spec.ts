import { describe, expect, it, jest } from '@jest/globals';
import { ThirdPartyAutoExportOrchestratorService } from '../../third-party-auto-export-orchestrator.service';

describe('ThirdPartyAutoExportOrchestratorService', () => {
  it('runs every adapter registered by the deployment composition', async () => {
    const first = jest.fn(async () => ({ exportedCount: 1 }));
    const second = jest.fn(async () => ({ exportedCount: 2 }));
    const service = new ThirdPartyAutoExportOrchestratorService([
      { provider: 'first', displayName: 'First', export: first },
      { provider: 'second', displayName: 'Second', export: second },
    ]);

    await expect(
      service.run({ userId: 'user-1', activityIds: [42] }),
    ).resolves.toEqual({
      results: {
        first: { exportedCount: 1 },
        second: { exportedCount: 2 },
      },
      providerLabels: { first: 'First', second: 'Second' },
      failures: [],
    });
    expect(first).toHaveBeenCalledWith({
      userId: 'user-1',
      activityIds: [42],
    });
    expect(second).toHaveBeenCalled();
  });

  it('starts all adapters before waiting for any exporter to finish', async () => {
    const releases: Array<() => void> = [];
    const waitForRelease = jest.fn(
      () =>
        new Promise<Record<string, never>>((resolve) => {
          releases.push(() => resolve({}));
        }),
    );
    const service = new ThirdPartyAutoExportOrchestratorService([
      { provider: 'one', displayName: 'One', export: waitForRelease },
      { provider: 'two', displayName: 'Two', export: waitForRelease },
    ]);

    const pending = service.run({ userId: 'user-1', activityIds: [42] });
    await Promise.resolve();

    expect(waitForRelease).toHaveBeenCalledTimes(2);
    releases.forEach((release) => release());
    await expect(pending).resolves.toMatchObject({ failures: [] });
  });

  it('isolates failures and preserves neutral presentation data', async () => {
    const service = new ThirdPartyAutoExportOrchestratorService([
      {
        provider: 'broken',
        displayName: 'Broken adapter',
        export: async () => {
          throw new Error('unavailable');
        },
      },
    ]);

    await expect(
      service.run({ userId: 'user-1', activityIds: [42] }),
    ).resolves.toEqual({
      results: {},
      providerLabels: { broken: 'Broken adapter' },
      failures: [
        {
          provider: 'broken',
          displayName: 'Broken adapter',
          error: 'unavailable',
        },
      ],
    });
  });

  it('registers and removes deployment adapters without retaining stale providers', async () => {
    const service = new ThirdPartyAutoExportOrchestratorService();
    const exporter = jest.fn(async () => ({ exportedCount: 1 }));
    const unregister = service.registerAdapter({
      provider: 'intervalsIcu',
      displayName: 'Intervals.icu',
      export: exporter,
    });

    await expect(
      service.run({ userId: 'user-1', activityIds: [42] }),
    ).resolves.toMatchObject({
      providerLabels: { intervalsIcu: 'Intervals.icu' },
    });
    unregister();
    await expect(
      service.run({ userId: 'user-1', activityIds: [42] }),
    ).resolves.toEqual({ results: {}, providerLabels: {}, failures: [] });
    expect(exporter).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate deployment adapter registration', () => {
    const service = new ThirdPartyAutoExportOrchestratorService();
    const adapter = {
      provider: 'intervalsIcu',
      displayName: 'Intervals.icu',
      export: async () => ({}),
    };
    service.registerAdapter(adapter);

    expect(() => service.registerAdapter(adapter)).toThrow(
      'Third-party auto-export adapter already registered: intervalsIcu',
    );
  });
});
