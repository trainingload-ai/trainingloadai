import { describe, expect, it, jest } from '@jest/globals';
import { ActivityWeatherWorkerService } from '../activity-weather.worker';

describe('ActivityWeatherWorkerService', () => {
  it('claims pending and expired leased rows with SKIP LOCKED', async () => {
    const queryRaw = jest.fn(async (..._args: unknown[]) => [
      {
        id: 'weather-1',
        activity_id: 42,
        user_id: 'user-1',
        attempt_count: 2,
      },
    ]);
    const service = new ActivityWeatherWorkerService(
      { $queryRaw: queryRaw } as never,
      {
        get: jest.fn(() => ({
          enabled: true,
          pollMs: 1_000,
          batchSize: 5,
          concurrency: 1,
          maxAttempts: 3,
          leaseMs: 300_000,
        })),
      } as never,
      { isEnabled: jest.fn(() => true) } as never,
    );

    const claimed = await (
      service as unknown as {
        claimBatch(): Promise<Array<Record<string, unknown>>>;
      }
    ).claimBatch();

    const strings = queryRaw.mock.calls[0]![0] as TemplateStringsArray;
    const sql = strings.join('?');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain("status = 'PENDING'");
    expect(sql).toContain("status = 'PROCESSING'");
    expect(sql).toContain('lease_expires_at <= NOW()');
    expect(claimed).toEqual([
      expect.objectContaining({
        id: 'weather-1',
        activityId: 42,
        userId: 'user-1',
        attemptCount: 2,
        lockToken: expect.any(String),
      }),
    ]);
  });
});
