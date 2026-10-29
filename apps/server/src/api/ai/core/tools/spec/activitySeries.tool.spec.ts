import { describe, expect, it, jest } from '@jest/globals';
import { activitySeriesTool } from '../activitySeries.tool';

describe('activity series tool boundaries', () => {
  it.each([
    { hashId: '' },
    { hashId: 'a', fromSecond: -1 },
    { hashId: 'a', fromSecond: 30, toSecond: 20 },
    { hashId: 'a', movingOnly: 'yes' },
    { hashId: 'a', minGrade: 8, maxGrade: 3 },
    { hashId: 'a', maxPoints: 121 },
    { hashId: 'a', maxPoints: 1.5 },
  ])('rejects malformed filters: %j', async (input) => {
    expect(
      await activitySeriesTool.validateInput!({} as never, input as never),
    ).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });
  it('requires a signed-in athlete and only forwards that identity', async () => {
    expect(
      await activitySeriesTool.checkPermissions!(
        { session: null, i18n: { t: () => 'sign in' } } as never,
        { hashId: 'a' },
      ),
    ).toMatchObject({ ok: false, code: 'UNAUTHORIZED' });
    const query = jest.fn(async () => ({ status: 'AVAILABLE' }));
    await activitySeriesTool.execute(
      {
        session: { user: { id: 'owner' } },
        activitySeries: { query },
      } as never,
      { hashId: 'a', excludeZeroPower: true },
    );
    expect(query).toHaveBeenCalledWith('owner', 'a', {
      hashId: 'a',
      excludeZeroPower: true,
    });
  });
});
