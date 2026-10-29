export function parsePositiveNumber(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function parsePositiveInt(value: unknown, fallback: number) {
  const n = Math.floor(parsePositiveNumber(value, fallback));
  return n > 0 ? n : fallback;
}

export function parsePositiveMinutes(value: unknown, fallback: number) {
  return parsePositiveNumber(value, fallback);
}

export function parseLocalStartHour(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 23) return fallback;
  return n;
}
