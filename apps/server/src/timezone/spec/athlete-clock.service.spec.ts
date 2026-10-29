import { AthleteClockService } from '../athlete-clock.service';

describe('AthleteClockService', () => {
  function serviceFor(value: unknown) {
    const findFirst = jest.fn(async () => (value ? { value } : null));
    const users = {
      bodyMetrics: jest.fn(() => ({ findFirst })),
    };
    return { service: new AthleteClockService(users as never), findFirst };
  }

  it('projects one UTC instant into the stored athlete timezone', async () => {
    const { service } = serviceFor('Asia/Shanghai');
    await expect(
      service.resolve({
        userId: 'user-1',
        instant: new Date('2026-10-28T16:05:00.000Z'),
      }),
    ).resolves.toEqual({
      instant: new Date('2026-10-28T16:05:00.000Z'),
      timezone: 'Asia/Shanghai',
      localDate: '2026-10-29',
    });
  });

  it('uses a validated client timezone only when the profile has none', async () => {
    const { service } = serviceFor(null);
    await expect(
      service.todayYmd(
        'user-1',
        'America/Los_Angeles',
        new Date('2026-10-29T03:00:00.000Z'),
      ),
    ).resolves.toBe('2026-10-28');
  });

  it('falls back to UTC when neither stored nor client timezone is valid', async () => {
    const { service } = serviceFor('not-a-timezone');
    await expect(
      service.resolve({
        userId: 'user-1',
        clientTimezone: 'also-invalid',
        instant: new Date('2026-10-29T03:00:00.000Z'),
      }),
    ).resolves.toMatchObject({
      timezone: 'UTC',
      localDate: '2026-10-29',
    });
  });
});
