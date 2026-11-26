/// <reference lib="es2022.intl" />

import { CoachTaskResultValidationError } from '../core/coach-task-result-error';
import type {
  TodaySuggestionConstraintProjection,
  TodaySuggestionDraft,
} from './today-suggestion.types';

const SENTENCES = new Intl.Segmenter(undefined, { granularity: 'sentence' });
const TOMORROW =
  /\b(?:tomorrow|morgen|demain|domani|ma[ñn]ana|amanh[ãa]|besok)\b|明[天日]|내일/i;
const TODAY =
  /\b(?:today|heute|aujourd'hui|oggi|hoy|hoje|hari ini)\b|今[天日]|오늘/i;
const WEEK_LOAD =
  /\b(?:weekly (?:training )?load|week(?:'s|’s)? (?:recorded |training )*load|wochen(?:last|belastung|trainingslast)|belastung dieser woche|carga semanal|charge hebdomadaire|carico settimanale|beban mingguan)\b|[周週](?:训练|訓練)?[负負][荷载載]|週間負荷|주간 부하/i;
const CURRENT_WEEK_LOAD =
  /\b(?=[^.!?]*(?:this week|current week))[^.!?]*\b(?:training load|recorded load)\b/i;
const PREVIOUS_WEEK =
  /\b(?:(?:last|previous|prior) week|week[- ]over[- ]week|(?:letzte[nr]?|vorige[nr]?|vergangene[nr]?) woche|vorwoche|semaine (?:dernière|précédente)|(?:semana|settimana) (?:pasada|passada|anterior|scorsa)|minggu lalu)\b|上[周週]|先週|지난주/i;
const MATCHING_WEEKDAYS =
  /\b(?:same (?:week)?days|same period|gleichen? (?:wochen)?tage[n]?|gleichen? zeitraum|mêmes? jours|mêmes? période|mismos días|mesmos dias|stessi giorni)\b|同期|相同(?:日期|几天|幾天)|同期間|같은 기간/i;
const INCREASE =
  /\b(?:higher|more|up|above|increas\w*|höher\w*|mehr|gestiegen|plus|aument\w*|mayor|lebih tinggi)\b|上[升漲涨]|增[加長长]|[高多]于|高於|比.{0,18}[高多]/i;
const DECREASE =
  /\b(?:lower|less|down|below|decreas\w*|niedriger\w*|weniger|gesunken|minus|moins|menor|lebih rendah|redu[cz]\w*)\b|下[跌降]|[减減]少|低[于於]|比.{0,18}[低少]/i;
const PERCENT = /([+\-−]?\d+(?:[.,]\d+)?)\s*(?:%|(?:percent|prozent)\b)/gi;
const ROLLING_WEEK =
  /\b(?:last|past|previous)\s+(?:7|seven)\s+days\b|\b(?:letzten|vergangenen)\s+(?:7|sieben)\s+Tagen?\b|\b(?:7|sieben)[ -]?Tage[ -]?(?:Last|Belastung)\b|\b(?:7|sept)\s+derniers?\s+jours\b|(?:过去|過去|近|最近)\s*[七7]\s*[天日]/i;
const EXPLICIT_CURRENT_WEEK =
  /\b(?:this|current)\s+(?:calendar\s+)?week\b|\b(?:dieser|diese|aktuellen)\s+(?:kalender)?woche\b|\bcette semaine\b|本[周週]|这[周週]|這[周週]/i;
const LOAD_AVERAGE =
  /\b(?:average|mean|Durchschnitt|Mittelwert|moyenne)\b|\d+\s*[-–]?\s*Tag(?:e[s-]?)?[-–]?\s*Durchschnitt|(?:平均|均值)/i;
const LOAD_POINTS =
  /(?<![\d.,])([+\-−]?\d+(?:[.,]\d+)?)\s*(?:(?:training\s+load\s+)?points?\b|Punkt(?:e|en)?\b|[点點分](?![钟鐘])(?:训练负荷|訓練負荷|负荷|負荷)?|TSS\b)/gi;
const TRAINING_LOAD_TERM = /\b(?:training load|training stress|Trainingslast|(?:Trainings)?belastung|charge d['’]entraînement|CTL|ATL|TSB)\b|[负負][荷载載]/i;
const PMC_METRIC = /\b(?:CTL|ATL|TSB)\b/i;
const UNSUPPORTED_AVERAGE_WINDOW = /(?:\b28[ -]?(?:day|tage|jours)|28\s*[天日])/i;
const LOAD_TOTAL_WITHOUT_UNIT =
  /(?:added up to|totall?ed|beträgt|ergibt|était de|合计|合計|约为|約為)\s*[+\-−]?\d/i;
const OTHER_SCORE = /\b(?:sleep|readiness|recovery|Schlaf)\s*(?:score|rating|wert)\b|(?:睡眠|恢复|恢復)评分/i;
const WORKOUT_DETAIL =
  /\b(?:including|includes?|with|warm[- ]?up|cool[- ]?down|davon|inkl\.?|mit|dont|con)\b|其中|包含|热身|熱身/i;
const AMOUNT = String.raw`\d+(?:[.,]\d+)?`;
const HOUR_UNIT = String.raw`(?:h(?:ours?|rs?|eures?|oras?)?|std\.?|stunden?|小时|小時|時間|시간)(?![a-z])`;
const MINUTE_UNIT = String.raw`(?:min(?:utes?|uten?|utos?|uti)?|分钟|分鐘|分|분)(?![a-z])`;
const CLOCK_DURATION = String.raw`(?<clockHours>\d{1,2}):(?<clockMinutes>[0-5]\d)(?![\d:])`;
const HOURS_DURATION = String.raw`(?<hours>${AMOUNT})[\s-]*${HOUR_UNIT}(?:\s*(?<extraMinutes>\d{1,2})(?:\s*(?:${MINUTE_UNIT}|m\b)|(?!\s*[\d\p{L}])))?`;
const MINUTES_DURATION = String.raw`(?<minutes>${AMOUNT})[\s-]*${MINUTE_UNIT}`;
const DURATION = new RegExp(
  String.raw`(?<![\d.,:])(?:${CLOCK_DURATION}|${HOURS_DURATION}|${MINUTES_DURATION})`,
  'giu',
);

function decimal(value: string) {
  return Number(value.replace(',', '.').replace('−', '-'));
}

type ProjectedLoad = {
  rolling7DayLoad?: number;
  currentWeekLoad?: number | null;
  previousWeekLoad?: number | null;
  weekToDateLoadChangePercent?: number;
};

function disagreesWithAbsoluteLoad(sentence: string, load?: ProjectedLoad) {
  const rolling = ROLLING_WEEK.test(sentence);
  const current = EXPLICIT_CURRENT_WEEK.test(sentence);
  const previous = PREVIOUS_WEEK.test(sentence);
  const average = LOAD_AVERAGE.test(sentence);
  const claims = [...sentence.matchAll(LOAD_POINTS)];
  if (average && PMC_METRIC.test(sentence) && UNSUPPORTED_AVERAGE_WINDOW.test(sentence))
    return true;
  const hasWindow = rolling || current || previous;
  const hasLoad = TRAINING_LOAD_TERM.test(sentence) || WEEK_LOAD.test(sentence);
  if (OTHER_SCORE.test(sentence) && !hasLoad) return false;
  if (!claims.length) return hasWindow && LOAD_TOTAL_WITHOUT_UNIT.test(sentence);
  if (!hasWindow && !hasLoad && !UNSUPPORTED_AVERAGE_WINDOW.test(sentence)) return false;
  if (hasWindow && PMC_METRIC.test(sentence)) return true;
  if (average || claims.length !== 1 || [rolling, current, previous].filter(Boolean).length !== 1)
    return true;
  const [claim, amount] = claims[0];
  if (/TSS$/i.test(claim)) return true;
  const actual = rolling ? load?.rolling7DayLoad : current ? load?.currentWeekLoad : load?.previousWeekLoad;
  if (typeof actual !== 'number' || !Number.isFinite(actual)) return true;
  const fractionDigits = amount.split(/[.,]/)[1]?.length ?? 0;
  return Math.abs(decimal(amount) - actual) > 0.5 * 10 ** -fractionDigits + Number.EPSILON;
}

function disagreesWithWeeklyLoad(sentence: string, actual: unknown) {
  if (!WEEK_LOAD.test(sentence) && !CURRENT_WEEK_LOAD.test(sentence))
    return false;
  const claims = [...sentence.matchAll(PERCENT)];
  if (!claims.length) return false;
  // More than one percentage can use unrelated denominators.
  if (
    claims.length > 1 ||
    !PREVIOUS_WEEK.test(sentence) ||
    !MATCHING_WEEKDAYS.test(sentence) ||
    typeof actual !== 'number' ||
    !Number.isFinite(actual)
  ) {
    return true;
  }
  const increasing = INCREASE.test(sentence);
  const decreasing = DECREASE.test(sentence);
  const [, amount] = claims[0];
  const signed = /^[+\-−]/.test(amount);
  const value = decimal(amount);
  if (increasing === decreasing && !signed && value !== 0) return true;
  if ((increasing && actual < 0) || (decreasing && actual > 0)) return true;
  const reported = decreasing && !signed ? -value : value;
  const fractionDigits = amount.split(/[.,]/)[1]?.length ?? 0;
  const rounding = 0.5 * 10 ** -fractionDigits;
  return Math.abs(reported - actual) > rounding + Number.EPSILON;
}

function disagreesWithWorkoutDuration(
  sentence: string,
  totalSeconds: number | null,
) {
  const mentionsToday = TODAY.test(sentence);
  const tomorrow = sentence.search(TOMORROW);
  if (tomorrow < 0 && mentionsToday) return false;
  const workoutText = mentionsToday ? sentence.slice(tomorrow) : sentence;
  let endOfTotal = 0;
  for (const match of workoutText.matchAll(DURATION)) {
    const prefix = workoutText.slice(endOfTotal, match.index);
    if (/\d+\s*[x×]\s*$/i.test(prefix)) continue;
    if (endOfTotal && WORKOUT_DETAIL.test(prefix)) break;
    if (mentionsToday && TODAY.test(prefix)) break;
    const { clockHours, clockMinutes, hours, extraMinutes, minutes } =
      match.groups!;
    const explicitClock = /\b(?:at|um|around|vers)\s*$/i.test(prefix);
    if (clockHours && explicitClock) continue;
    const reportedSeconds =
      decimal(hours ?? clockHours ?? '0') * 3_600 +
      decimal(minutes ?? extraMinutes ?? clockMinutes ?? '0') * 60;
    if (!totalSeconds || Math.abs(reportedSeconds - totalSeconds) > 30)
      return true;
    endOfTotal = match.index + match[0].length;
  }
  return false;
}

export function groundTodaySuggestionNumbers(
  draft: TodaySuggestionDraft,
  projection: TodaySuggestionConstraintProjection,
) {
  const scheduled = (projection.tomorrowWorkouts ?? []).filter((workout) =>
    ['PLANNED', 'IN_PROGRESS'].includes(workout.status),
  );
  const load = projection.lightContext?.load as ProjectedLoad | undefined;

  const isSupported = (sentence: string) => {
    const normalized = sentence.normalize('NFKC');
    if (
      disagreesWithWeeklyLoad(normalized, load?.weekToDateLoadChangePercent) ||
      disagreesWithAbsoluteLoad(normalized, load)
    ) {
      return false;
    }
    if (!scheduled.length) return true;
    const lower = normalized.toLowerCase();
    const mentions = ({ name }: { name: string }) =>
      name && lower.includes(name.normalize('NFKC').toLowerCase());
    const named = scheduled.filter(mentions);
    if (
      !TOMORROW.test(normalized) &&
      (!named.length ||
        TODAY.test(normalized) ||
        (projection.todayWorkouts ?? []).some(mentions))
    ) {
      return true;
    }
    const candidates = named.length ? named : scheduled;
    const totalSeconds =
      candidates.length === 1 ? candidates[0].plannedDurationSeconds : null;
    return !disagreesWithWorkoutDuration(normalized, totalSeconds);
  };

  const retainSupportedSentences = (text: string) =>
    [...SENTENCES.segment(text)]
      .map(({ segment }) => {
        if (isSupported(segment)) return segment;
        const reasonStart = segment.search(
          /(?:,?\s+(?:because|weil|denn|parce que|porque)\s+)|(?:[，,]?\s*(?:因为|因為))/i,
        );
        if (reasonStart <= 0) return '';
        const advice = segment.slice(0, reasonStart).trim();
        if (!isSupported(advice)) return '';
        const ending = segment.match(/[.!?。！？]\s*$/)?.[0] ?? '';
        return advice + ending;
      })
      .join('')
      .trim();

  const headline = retainSupportedSentences(draft.headline);
  const summary = retainSupportedSentences(draft.summary);
  if (!headline || !summary) {
    throw new CoachTaskResultValidationError(
      'TODAY_SUGGESTION_OUTPUT_REJECTED_NUMERIC_FACTS',
      'UNSUPPORTED_NUMERIC_FACTS_IN_MAIN_ADVICE',
      'Restate the main advice using supported facts. Use projected durations and the matching load window, or omit the numbers. CTL is not an arithmetic mean.',
    );
  }
  draft.headline = headline;
  draft.summary = summary;
  draft.tags = draft.tags.map(retainSupportedSentences).filter(Boolean);
  if (draft.uncertainty) {
    draft.uncertainty =
      retainSupportedSentences(draft.uncertainty) || undefined;
  }
  if (draft.recommendation.details) {
    const details = draft.recommendation.details
      .map(retainSupportedSentences)
      .filter(Boolean);
    draft.recommendation.details = details.length ? details : undefined;
  }
}
