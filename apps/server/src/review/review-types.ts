export type ReviewDigestType = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type ReviewJobStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'DONE'
  | 'FAILED'
  | 'DEAD';

export function parseSendAtLocalTimeToMinutes(v: string): number | null {
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

export function minutesOfDay(d: { hour: () => number; minute: () => number }) {
  return d.hour() * 60 + d.minute();
}
