import { describe, expect, it, jest } from '@jest/globals';
import { integrationStatusTool } from '../integrationStatus.tool';

describe('integrationStatusTool', () => {
  it('returns the signed-in user integration configuration from the authoritative query', async () => {
    const statuses = [
      {
        provider: 'intervals_icu',
        enabled: true,
        connected: true,
        connectionState: 'ACTIVE',
        settings: { exportPlannedWorkouts: true },
      },
    ];
    const listForUser = jest.fn(async () => statuses);
    const ctx = {
      session: { user: { id: 'user-1' } },
      i18n: { t: jest.fn((key: string) => key) },
      integrationStatus: { listForUser },
    };

    const output = await integrationStatusTool.execute(ctx as never, {
      provider: 'intervals_icu',
    });

    expect(listForUser).toHaveBeenCalledWith('user-1', 'intervals_icu');
    expect(output).toMatchObject({
      kind: 'integration_status',
      directionSemantics: {
        import: 'third_party_to_trainingload',
        export: 'trainingload_to_third_party',
      },
      statuses,
    });
  });
});
