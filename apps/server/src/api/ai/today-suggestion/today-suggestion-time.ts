export function nextDate(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function timeZoneOffsetMs(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return (
    Date.UTC(
      Number(value.year),
      Number(value.month) - 1,
      Number(value.day),
      Number(value.hour),
      Number(value.minute),
      Number(value.second),
    ) - at.getTime()
  );
}

/** End of the projected local day, represented as the first instant of the next day. */
export function todaySuggestionValidUntil(
  date: string,
  timezone: string | null,
) {
  const [year, month, day] = nextDate(date).split('-').map(Number);
  const wallClockUtc = Date.UTC(year, month - 1, day);
  if (!timezone) return new Date(wallClockUtc);
  try {
    let candidate = new Date(wallClockUtc);
    for (let index = 0; index < 2; index += 1) {
      candidate = new Date(
        wallClockUtc - timeZoneOffsetMs(candidate, timezone),
      );
    }
    return candidate;
  } catch {
    return new Date(wallClockUtc);
  }
}

function localTime(at: Date, timezone: string | null) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(at);
  } catch {
    return at.toISOString().slice(11, 16);
  }
}

export function todaySuggestionTimeContext(
  date: string,
  timezone: string | null,
  now = new Date(),
) {
  const validUntil = todaySuggestionValidUntil(date, timezone);
  const currentLocalTime = localTime(now, timezone);
  const minutesUntilDayEnd = Math.max(
    0,
    Math.floor((validUntil.getTime() - now.getTime()) / 60_000),
  );
  return {
    validUntil,
    localTime: currentLocalTime,
    minutesUntilDayEnd,
  };
}
