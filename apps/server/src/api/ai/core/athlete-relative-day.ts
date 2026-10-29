import { activityCalendarYmdInZone } from '@/api/plan/plan-link-calendar.util';
import { dayDiffByYmd, localDateYmd } from './ai-common.util';

export type CoachPromptClock = {
  timezone: string;
  athleteLocalToday: string;
  generatedAt: string;
};

export type AthleteRelativeDay = 'yesterday' | 'today' | 'tomorrow' | 'other';

/** Calendar-date arithmetic on YYYY-MM-DD strings. Does not use the server TZ. */
export function addCalendarDays(ymd: string, days: number): string {
  const date = new Date(`${ymd}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Exclusive review-window end (`periodEnd`) is local midnight of athlete-today
 * when daily/weekly/monthly jobs enqueue. Convert that instant in the athlete
 * IANA zone; never take the UTC calendar day of the instant.
 */
export function athleteTodayFromPeriodEnd(
  periodEnd: Date,
  timezone: string,
): string {
  return (
    activityCalendarYmdInZone(periodEnd, timezone) ??
    localDateYmd(periodEnd, timezone) ??
    localDateYmd(periodEnd, 'UTC') ??
    periodEnd.toISOString().slice(0, 10)
  );
}

export function athleteRelativeDay(
  dateYmd: string,
  athleteTodayYmd: string,
): AthleteRelativeDay {
  const diff = dayDiffByYmd(athleteTodayYmd, dateYmd);
  if (diff === 0) return 'today';
  if (diff === -1) return 'yesterday';
  if (diff === 1) return 'tomorrow';
  return 'other';
}

export async function resolveAthleteClock(args: {
  userService: { getPreferredTimezone(userId: string): Promise<string | null> };
  userId?: string | null;
  now?: Date;
}): Promise<CoachPromptClock> {
  const now = args.now ?? new Date();
  const timezone = args.userId
    ? ((await args.userService.getPreferredTimezone(args.userId)) ?? 'UTC')
    : 'UTC';
  return {
    timezone,
    athleteLocalToday:
      localDateYmd(now, timezone) ??
      localDateYmd(now, 'UTC') ??
      now.toISOString().slice(0, 10),
    generatedAt: now.toISOString(),
  };
}

/**
 * Daily jobs run after local midnight, so the reviewed day is already
 * yesterday relative to athleteToday. Frozen 今天/today copy is rewritten
 * only for that overnight case. Does not rewrite weekly/monthly copy or
 * historical rows already stored in the database.
 */
export function groundOvernightRelativeDayCopy(args: {
  text: string;
  locale: string;
  scale?: string | null;
  athleteToday?: string | null;
  reviewedThrough?: string | null;
}): string {
  if (args.scale && args.scale !== 'daily') return args.text;
  if (!args.athleteToday || !args.reviewedThrough) return args.text;
  if (addCalendarDays(args.reviewedThrough, 1) !== args.athleteToday) {
    return args.text;
  }
  const locale = args.locale.toLowerCase();
  if (locale.startsWith('zh')) return rewriteZhOvernight(args.text);
  if (locale.startsWith('ja')) return rewriteJaOvernight(args.text);
  if (locale.startsWith('ko')) return rewriteKoOvernight(args.text);
  if (locale.startsWith('de')) return rewriteDeOvernight(args.text);
  if (locale.startsWith('fr')) return rewriteFrOvernight(args.text);
  if (locale.startsWith('es')) return rewriteEsOvernight(args.text);
  if (locale.startsWith('it')) return rewriteItOvernight(args.text);
  if (locale.startsWith('pt')) return rewritePtOvernight(args.text);
  return rewriteEnOvernight(args.text);
}

function rewriteZhOvernight(text: string) {
  return text
    .replace(/(今天|今日)(?=.{0,12}(错过|漏练|未完成|没练|尚未完成))/g, '昨天')
    .replace(/(今天|今日)的(?=(轻松跑|训练|課次|课次|课|跑))/g, '昨天的')
    .replace(/(推迟到|延后到|改到|挪到)明天/g, '$1今天');
}

function rewriteEnOvernight(text: string) {
  return text
    .replace(
      /\btoday(?:'s|’s)?(?=.{0,24}(missed|incomplete|skipped|not completed))/gi,
      (match) => (match[0] === 'T' ? "Yesterday's" : "yesterday's"),
    )
    .replace(/\bmissed today\b/gi, 'missed yesterday')
    .replace(
      /\b(postpone(?:d)?|move|moved|shift(?:ed)?)\b(.{0,48}?)\bto tomorrow\b/gi,
      '$1$2to today',
    );
}

function rewriteJaOvernight(text: string) {
  return text
    .replace(/(今日|きょう)(?=.{0,12}(未完了|未完|スキップ|欠席))/g, '昨日')
    .replace(/(延期|先送り|後ろ倒し).{0,8}明日/g, (match) =>
      match.replace('明日', '今日'),
    );
}

function rewriteKoOvernight(text: string) {
  return text
    .replace(/오늘(?=.{0,12}(미완료|놓친|빠뜨|건너))/g, '어제')
    .replace(/(미루|연기).{0,8}내일/g, (match) => match.replace('내일', '오늘'));
}

function rewriteDeOvernight(text: string) {
  return text
    .replace(
      /\bheute(?=.{0,24}(unvollständig|verpasst|ausgelassen|offen))/gi,
      'gestern',
    )
    .replace(
      /\b(verschieb\w*|verleg\w*)\b(.{0,48}?)\bauf morgen\b/gi,
      '$1$2auf heute',
    );
}

function rewriteFrOvernight(text: string) {
  return text
    .replace(
      /aujourd['’]hui(?=.{0,28}(incomplète|incomplete|manquée|ouverte|pas terminée))/gi,
      'hier',
    )
    .replace(
      /\b(reporte\w*|déplace\w*|repousse\w*)\b(.{0,48}?)à demain\b/gi,
      '$1$2à aujourd’hui',
    );
}

function rewriteEsOvernight(text: string) {
  return text
    .replace(
      /\bhoy(?=.{0,24}(incompleta|abierta|perdida|omitida|no completada))/gi,
      'ayer',
    )
    .replace(
      /\b(posponer|pospone|mover|mueve|pasar)\b(.{0,40}?)(\ba\s+)?mañana\b/gi,
      '$1$2$3hoy',
    );
}

function rewriteItOvernight(text: string) {
  return text
    .replace(
      /\boggi(?=.{0,24}(incompleta|aperta|mancata|saltata|non completata))/gi,
      'ieri',
    )
    .replace(
      /\b(posticipa\w*|sposta\w*)\b(.{0,48}?)\ba domani\b/gi,
      '$1$2a oggi',
    );
}

function rewritePtOvernight(text: string) {
  return text
    .replace(
      /\bhoje(?=.{0,24}(incompleta|aberta|perdida|omitida|não concluída))/gi,
      'ontem',
    )
    .replace(
      /\b(adie|adiar|mova|mover|desloca\w*)\b(.{0,48}?)\bpara amanh[ãa]\b/gi,
      '$1$2para hoje',
    );
}
