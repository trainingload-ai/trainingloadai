import { describe, it, expect, jest } from '@jest/globals';
import { AnalyzePersistenceService } from '../analyze-persistence.service';

describe('transaction conflicts stay internal and retryable', () => {
  it('preserves the native error inside a transaction', async () => {
    const error = { code: 'P2034' };
    const tx = {
      activity: {
        update: jest.fn(async () => {
          throw error;
        }),
      },
    };
    const service = new AnalyzePersistenceService({} as never);
    await expect(
      service.saveActivityPowerActivityFields(
        1,
        { avgPower: 200 },
        tx as never,
      ),
    ).rejects.toBe(error);
    await expect(
      service.saveActivityHeartRateBaseFields(
        1,
        { avg: 140 } as never,
        tx as never,
      ),
    ).rejects.toBe(error);
  });
});
