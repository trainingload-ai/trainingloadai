import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from '@jest/globals';
import {
  assertIanaTimezone,
  competitionDateToYmd,
  differenceInCompetitionDays,
  parseCompetitionYmd,
} from '../competition-calendar.util';

describe('competition calendar util', () => {
  it('round-trips a calendar date without applying local timezone offsets', () => {
    const date = parseCompetitionYmd('2026-08-23', 'startDate');
    expect(date.toISOString()).toBe('2026-08-23T00:00:00.000Z');
    expect(competitionDateToYmd(date)).toBe('2026-08-23');
  });

  it('rejects rollover dates', () => {
    expect(() => parseCompetitionYmd('2026-02-30', 'startDate')).toThrow(
      BadRequestException,
    );
  });

  it('computes differences in calendar days', () => {
    expect(
      differenceInCompetitionDays(
        parseCompetitionYmd('2026-08-23', 'endDate'),
        parseCompetitionYmd('2026-08-20', 'startDate'),
      ),
    ).toBe(3);
  });

  it('accepts valid IANA timezones and rejects unknown ones', () => {
    expect(() => assertIanaTimezone('Asia/Shanghai')).not.toThrow();
    expect(() => assertIanaTimezone('Not/A_Timezone')).toThrow(
      BadRequestException,
    );
  });
});
