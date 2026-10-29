import { BadRequestException } from '@nestjs/common';

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseCompetitionYmd(value: string, fieldName: string): Date {
  const match = YMD_RE.exec(String(value ?? '').trim());
  if (!match) {
    throw new BadRequestException({
      code: 'COMPETITION_EVENT_INVALID_DATE',
      message: `${fieldName} must use YYYY-MM-DD`,
    });
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new BadRequestException({
      code: 'COMPETITION_EVENT_INVALID_DATE',
      message: `${fieldName} is not a valid calendar date`,
    });
  }
  return date;
}

export function competitionDateToYmd(value: Date | null | undefined) {
  if (!value) return null;
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, '0'),
    String(value.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function addCompetitionDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function differenceInCompetitionDays(end: Date, start: Date) {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

export function assertIanaTimezone(value: string | null | undefined) {
  if (!value) return;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
  } catch {
    throw new BadRequestException({
      code: 'COMPETITION_EVENT_INVALID_TIMEZONE',
      message: 'timezone must be a valid IANA timezone',
    });
  }
}
