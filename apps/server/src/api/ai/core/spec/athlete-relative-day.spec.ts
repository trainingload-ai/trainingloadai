import { describe, expect, it } from '@jest/globals';
import {
  addCalendarDays,
  athleteRelativeDay,
  athleteTodayFromPeriodEnd,
  groundOvernightRelativeDayCopy,
  resolveAthleteClock,
} from '../athlete-relative-day';

describe('athlete-relative-day', () => {
  it('adds calendar days without using the process timezone', () => {
    expect(addCalendarDays('2026-08-25', 1)).toBe('2026-08-26');
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('labels dates relative to athlete-local today', () => {
    expect(athleteRelativeDay('2026-09-11', '2026-09-12')).toBe('yesterday');
    expect(athleteRelativeDay('2026-09-12', '2026-09-12')).toBe('today');
    expect(athleteRelativeDay('2026-09-13', '2026-09-12')).toBe('tomorrow');
    expect(athleteRelativeDay('2026-09-01', '2026-09-12')).toBe('other');
  });

  it.each([
    ['America/Los_Angeles', '2026-08-26T07:00:00.000Z'],
    ['Europe/London', '2026-08-25T23:00:00.000Z'],
    ['Pacific/Kiritimati', '2026-08-25T10:00:00.000Z'],
    ['Pacific/Honolulu', '2026-08-26T10:00:00.000Z'],
    ['Asia/Shanghai', '2026-08-25T16:00:00.000Z'],
  ])(
    'reads athlete-today from exclusive periodEnd in %s',
    (timezone, periodEndIso) => {
      expect(
        athleteTodayFromPeriodEnd(new Date(periodEndIso), timezone),
      ).toBe('2026-08-26');
    },
  );

  it('does not take the UTC calendar day of a UTC+14 midnight', () => {
    const periodEnd = new Date('2026-08-25T10:00:00.000Z');
    expect(periodEnd.toISOString().slice(0, 10)).toBe('2026-08-25');
    expect(athleteTodayFromPeriodEnd(periodEnd, 'Pacific/Kiritimati')).toBe(
      '2026-08-26',
    );
  });

  it('resolves conversation clock from preferred timezone, not the server date', async () => {
    const now = new Date('2026-08-26T07:30:00.000Z');
    const clock = await resolveAthleteClock({
      userService: {
        getPreferredTimezone: async () => 'America/Los_Angeles',
      },
      userId: 'user-1',
      now,
    });
    expect(clock).toEqual({
      timezone: 'America/Los_Angeles',
      athleteLocalToday: '2026-08-26',
      generatedAt: '2026-08-26T07:30:00.000Z',
    });
    expect(now.toISOString().slice(0, 10)).toBe('2026-08-26');

    const londonMorning = await resolveAthleteClock({
      userService: {
        getPreferredTimezone: async () => 'Europe/London',
      },
      userId: 'user-2',
      now: new Date('2026-08-25T23:30:00.000Z'),
    });
    expect(londonMorning.athleteLocalToday).toBe('2026-08-26');
  });

  it('rewrites overnight relative-day copy in the athlete locale', () => {
    const overnight = {
      scale: 'daily',
      athleteToday: '2026-08-26',
      reviewedThrough: '2026-08-25',
    } as const;

    expect(
      groundOvernightRelativeDayCopy({
        ...overnight,
        locale: 'zh',
        text: '建议把今天错过的轻松跑推迟到明天。',
      }),
    ).toBe('建议把昨天错过的轻松跑推迟到今天。');

    expect(
      groundOvernightRelativeDayCopy({
        ...overnight,
        locale: 'en',
        text: "Postpone today's missed easy run to tomorrow.",
      }),
    ).toBe("Postpone yesterday's missed easy run to today.");

    expect(
      groundOvernightRelativeDayCopy({
        ...overnight,
        locale: 'de',
        text: 'Verschiebe die heute unvollständige Einheit auf morgen.',
      }),
    ).toBe('Verschiebe die gestern unvollständige Einheit auf heute.');

    expect(
      groundOvernightRelativeDayCopy({
        ...overnight,
        locale: 'fr',
        text: "Reporte la séance d'aujourd'hui incomplète à demain.",
      }),
    ).toBe("Reporte la séance d'hier incomplète à aujourd’hui.");
  });

  it('leaves relative words alone when the review is still athlete-today', () => {
    expect(
      groundOvernightRelativeDayCopy({
        text: "Postpone today's missed easy run to tomorrow.",
        locale: 'en',
        scale: 'daily',
        athleteToday: '2026-08-25',
        reviewedThrough: '2026-08-25',
      }),
    ).toBe("Postpone today's missed easy run to tomorrow.");
  });

  it('does not rewrite weekly or monthly copy', () => {
    expect(
      groundOvernightRelativeDayCopy({
        text: "Today's session was incomplete.",
        locale: 'en',
        scale: 'weekly',
        athleteToday: '2026-08-26',
        reviewedThrough: '2026-08-25',
      }),
    ).toBe("Today's session was incomplete.");
  });
});
